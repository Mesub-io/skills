#!/usr/bin/env node
// Usage: node "<skill-dir>/scripts/check-wallet-side.mjs" [--help]
//
// Reads the project in the current directory and reports the mistakes that leave
// the subscribe and manage part silently broken: a widget with no provider, a
// manageUrl that is ignored, a slug the routes refuse, the server package in
// client code, a subscription created and never submitted, a cancellation built
// and never confirmed. Run it from the project root.
//
// It only reads source files and package manifests. No write, no install, no
// network. It never opens an env file, so it cannot show a key.
//
// Exit 0: no FAIL. Exit 1: at least one FAIL. Exit 2: arguments not understood.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const HELP = `Usage: node "<skill-dir>/scripts/check-wallet-side.mjs" [--help]

Checks, from the project root, the subscribe and manage part of a Mesub integration:
the widget of @mesub/react, and mesub.subscriptions.* calls made without it.
Reads source files only: no write, no install, no network, no env file opened.

  --help   show this text

Each line is PASS, FAIL, WARN or SKIP. Exit 0 when nothing FAILs, 1 otherwise.
A PASS is a reading of the code, not a proof: the runbook says what is left.`

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(`${HELP}\n`)
  process.exit(0)
}
if (args.length > 0) {
  process.stderr.write(`Unknown argument: ${args[0]}\n\n${HELP}\n`)
  process.exit(2)
}

const root = process.cwd()
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.next', '.nuxt', '.turbo', '.vercel',
  '.output', '.cache', '.agents', 'vendor', 'tmp',
])
const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/
const STYLE = /\.(css|scss|sass|less|pcss)$/
// Tests may call half a flow on purpose: they are not the integration.
const TEST = /(^|\/)(__tests__|tests?|e2e)\/|\.(test|spec)\.[cm]?[jt]sx?$/
const MAX_FILES = 6000
const MAX_BYTES = 512 * 1024

const results = []
const report = (level, message) => results.push({ level, message })
const shown = (path) => relative(root, path).split(sep).join('/') || '.'

function walk(dir, found = []) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return found
  }
  for (const entry of entries) {
    if (found.length >= MAX_FILES) break
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path, found)
    } else if (entry.isFile()) {
      found.push(path)
    }
  }
  return found
}

function read(path) {
  try {
    if (statSync(path).size > MAX_BYTES) return ''
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length
const at = (file, index) => `${shown(file.path)}:${lineOf(file.text, index)}`

const files = walk(root)
const manifests = files.filter((path) => path.endsWith(`${sep}package.json`) || path === join(root, 'package.json'))
if (manifests.length === 0) {
  process.stderr.write('No package.json here. Run this from the project root.\n')
  process.exit(2)
}
const load = (pattern) => files
  .filter((path) => pattern.test(path) && !TEST.test(shown(path)))
  .map((path) => ({ path, text: read(path) }))
const sources = load(SOURCE)
const styles = load(STYLE)

// --- Packages ---
const declared = new Map()
for (const path of manifests) {
  let manifest
  try {
    manifest = JSON.parse(read(path))
  } catch {
    continue
  }
  for (const group of ['dependencies', 'devDependencies', 'peerDependencies']) {
    for (const name of Object.keys(manifest[group] ?? {})) {
      if (!declared.has(name)) declared.set(name, path)
    }
  }
}

/** Where a declared package is installed, looked up from the manifest that names it, then the root. */
function installedDir(name) {
  const from = declared.get(name)
  for (const start of [from ? join(from, '..') : null, root].filter(Boolean)) {
    const dir = join(start, 'node_modules', ...name.split('/'))
    if (existsSync(join(dir, 'package.json'))) return dir
  }
  return null
}

function checkPackage(name) {
  if (!declared.has(name)) return null
  const dir = installedDir(name)
  if (!dir) {
    report('FAIL', `${name} is in ${shown(declared.get(name))} but not installed: run the project's install, and if it says the package does not exist, stop and tell the user`)
    return null
  }
  let version = 'unknown version'
  try {
    version = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version ?? version
  } catch {
    // Left as unknown.
  }
  report('PASS', `${name} ${version} is installed: read its README and types for anything this skill does not show`)
  return dir
}

const reactDir = checkPackage('@mesub/react')
checkPackage('@mesub/node')

const importsOf = (text, name) => new RegExp(`(?:from\\s+|require\\(\\s*|import\\s+)["']${name}(?:/[\\w./-]+)?["']`).test(text)
const isClient = (text) => /^\s*["']use client["']/m.test(text) || importsOf(text, '@mesub/react')
const widgetFiles = sources.filter(({ text }) => importsOf(text, '@mesub/react'))
const WIDGET_USE = /<(SubscribeButton|ManageButton|ManageSubscriptions)\b|\b(useSubscribe|useSubscriptions)\s*\(/

// --- The server package must stay on the server ---
let leaked = 0
for (const file of sources) {
  if (!isClient(file.text)) continue
  // @mesub/node/situations imports nothing of Node and is made for pages.
  const match = file.text.match(/(?:from\s+|require\(\s*|import\s+)["']@mesub\/node(?!\/situations)(?:\/[\w./-]+)?["']/)
  if (match) {
    leaked += 1
    report('FAIL', `${at(file, match.index)} is client code that imports @mesub/node: it holds the API key and runs on the server only`)
  }
}
if (leaked === 0 && declared.has('@mesub/node')) report('PASS', '@mesub/node is imported by no client file')

// --- The widget ---
if (widgetFiles.length === 0) {
  report('SKIP', 'the widget checks: no file imports @mesub/react')
} else {
  const uses = sources.filter(({ text }) => WIDGET_USE.test(text))
  const providers = []
  for (const file of sources) {
    for (const match of file.text.matchAll(/<MesubProvider\b[^>]*>/g)) providers.push({ file, index: match.index, tag: match[0] })
  }

  if (providers.length === 0) {
    report('FAIL', `no <MesubProvider> found, and ${shown(uses[0]?.path ?? widgetFiles[0].path)} uses the widget: every button and hook throws outside it`)
  } else {
    report('PASS', `<MesubProvider> is rendered (${at(providers[0].file, providers[0].index)})`)
    if (providers.length > 1) report('WARN', `${providers.length} <MesubProvider> found: one around the app is enough, and each renders its own window`)
  }

  // manageUrl: a site path, a full URL or null. Anything else is ignored without a word.
  const managesInPage = sources.some(({ text }) => /<ManageSubscriptions\b|\buseSubscriptions\s*\(/.test(text))
  for (const { file, index, tag } of providers) {
    const literal = tag.match(/\bmanageUrl=(?:\{\s*)?(["'`])([^"'`]*)\1/)
    if (literal) {
      const value = literal[2]
      if (/^\/(?!\/)\S*$/.test(value) || /^https?:\/\/\S+$/.test(value)) {
        report('PASS', `${at(file, index)} sends "Cancel any time" to ${value}`)
      } else {
        report('FAIL', `${at(file, index)} sets manageUrl to "${value}": not a path starting with one / nor an http(s) URL, so it is ignored and the link opens Mesub's page`)
      }
    } else if (/\bmanageUrl=\{\s*null\s*\}/.test(tag)) {
      report('PASS', `${at(file, index)} removes the "Cancel any time" link (manageUrl is null)`)
    } else if (/\bmanageUrl=/.test(tag)) {
      report('WARN', `${at(file, index)} sets manageUrl from an expression: check it is a path starting with one /, an http(s) URL or null`)
    } else if (managesInPage) {
      report('WARN', `${at(file, index)} has no manageUrl, yet the app has its own list of subscriptions: "Cancel any time" opens Mesub's page instead of it`)
    }
  }

  // Slugs: the routes refuse anything that is not a slug, and anything outside their `plans` list.
  const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
  let allowed = null
  for (const { text } of sources) {
    const call = text.match(/\b(?:mesubRoutes|mesubRouteHandlers)\s*\(/)
    if (!call) continue
    const list = text.slice(call.index, call.index + 1500).match(/\bplans\s*:\s*\[([^\]]*)\]/)
    if (list) allowed = [...list[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((match) => match[1])
  }
  let slugs = 0
  let badSlugs = 0
  for (const file of sources) {
    const found = [
      ...file.text.matchAll(/<(?:SubscribeButton|ManageButton)\b[^>]*?\bplan=(?:\{\s*)?(["'`])([^"'`]*)\1/g),
      ...file.text.matchAll(/\buseSubscribe\s*\(\s*(["'`])([^"'`]*)\1/g),
    ]
    for (const match of found) {
      slugs += 1
      const slug = match[2]
      if (!SLUG.test(slug)) {
        badSlugs += 1
        report('FAIL', `${at(file, match.index)} names the plan "${slug}": a slug is lowercase letters, digits and single hyphens, as the dashboard shows it`)
      } else if (allowed && !allowed.includes(slug)) {
        badSlugs += 1
        report('FAIL', `${at(file, match.index)} names the plan "${slug}", which the routes' own plans list (${allowed.join(', ')}) leaves out: they answer 404`)
      }
    }
  }
  if (slugs > 0 && badSlugs === 0) report('PASS', `${slugs} plan slug${slugs === 1 ? '' : 's'} named by the widget, each one well formed${allowed ? ' and in the routes\' plans list' : ''} (whether the plan exists is the dashboard's to say)`)

  // The routes: in this project, or on another server.
  if (sources.some(({ text }) => /\b(mesubRoutes|mesubRouteHandlers)\s*\(/.test(text))) {
    report('PASS', 'the routes the widget calls are mounted in this project')
  } else {
    report('WARN', 'no mesubRoutes( or mesubRouteHandlers( call here: fine only if another server mounts the routes and the provider\'s endpoint is its URL')
  }

  // App Router: hooks and function props need a client component.
  if (declared.has('next')) {
    let boundary = 0
    for (const file of widgetFiles) {
      if (/^\s*["']use client["']/m.test(file.text)) continue
      const needs = file.text.match(/\b(useSubscribe|useSubscriptions)\s*\(|\b(onSubscribed|onChanged)=\{|<MesubProvider\b[^>]*\bfetch=\{/)
      if (needs) {
        boundary += 1
        report('WARN', `${at(file, needs.index)} calls a hook or passes a function to the widget without 'use client': under the App Router that file must be a client component`)
      }
    }
    if (boundary === 0) report('PASS', 'every file that calls a widget hook or hands it a function is a client component')
  }

  // Styling.
  const sheet = sources.concat(styles).some(({ text }) => /@mesub\/react\/styles\.css/.test(text))
  const ownStyles = styles.some(({ text }) => /\[data-mesub-/.test(text))
  if (sheet) report('PASS', 'the widget stylesheet is imported')
  else if (ownStyles) report('PASS', 'the widget is styled by the app itself, through its data-mesub-* attributes')
  else report('WARN', '@mesub/react/styles.css is imported nowhere and no stylesheet targets [data-mesub-...]: the window shows unstyled')

  for (const file of styles) {
    const klass = file.text.match(/\.mesub[-_][\w-]*\s*[,{:]/)
    if (klass) report('WARN', `${at(file, klass.index)} styles a class named ${klass[0].replace(/\s*[,{:]$/, '')}: the widget carries no class names, only data-mesub-* attributes`)
  }

  // Custom properties the installed stylesheet never reads do nothing.
  let known = null
  if (reactDir) {
    const css = read(join(reactDir, 'styles.css'))
    if (css) known = new Set([...css.matchAll(/var\(\s*(--mesub-[a-z-]+)/g)].map((match) => match[1]))
  }
  if (known && known.size > 0) {
    let unknown = 0
    let set = 0
    for (const file of styles.concat(sources)) {
      for (const match of file.text.matchAll(/(--mesub-[a-z][a-z-]*)\s*["']?\s*:/g)) {
        set += 1
        if (!known.has(match[1])) {
          unknown += 1
          report('WARN', `${at(file, match.index)} sets ${match[1]}, which the installed stylesheet never reads: it changes nothing`)
        }
      }
    }
    if (set > 0 && unknown === 0) report('PASS', `${set} --mesub-* propert${set === 1 ? 'y' : 'ies'} set, each one read by the installed stylesheet`)
  }
}

// --- mesub.subscriptions.* without the widget ---
const calls = (name) => new RegExp(`\\bsubscriptions\\s*\\??\\.\\s*${name}\\s*\\(`, 'g')
const first = (name) => {
  for (const file of sources) {
    const match = calls(name).exec(file.text)
    if (match) return { file, index: match.index }
  }
  return null
}
const names = (word) => sources.some(({ text }) => new RegExp(`\\b${word}\\b`).test(text))
const dynamic = sources.find(({ text }) => /\bsubscriptions\s*\[/.test(text))

const created = first('create')
const submitted = first('submit')
const ACTIONS = [['cancel', 'confirmCancel'], ['resume', 'confirmResume'], ['close', 'confirmClose']]
const built = ACTIONS.map(([build, confirm]) => ({ build, confirm, call: first(build) })).filter(({ call }) => call)
const byId = /\bsubscriptions\s*\??\.\s*(submit|cancel|resume|close|confirmCancel|confirmResume|confirmClose|retrieve|attempts|allAttempts)\s*\(|\bsubscriptions\s*\[/

if (!created && !submitted && built.length === 0 && !dynamic) {
  report('SKIP', 'the server-side checks: no mesub.subscriptions call that subscribes or manages (the widget routes do it)')
} else {
  if (created && !submitted) {
    report('FAIL', `${at(created.file, created.index)} creates a subscription and nothing ever calls subscriptions.submit: it stays pending and expires`)
  } else if (submitted && !created) {
    report('WARN', `${at(submitted.file, submitted.index)} submits a subscription that nothing here creates: check where its id and its transaction come from`)
  } else if (created && submitted) {
    report('PASS', 'a subscription created on the server is also submitted')
  }

  if (submitted) {
    if (names('MesubSubmitError')) report('PASS', 'an unknown outcome of submit is handled (MesubSubmitError)')
    else report('WARN', `${at(submitted.file, submitted.index)} submits and nothing handles MesubSubmitError: when its outcome is unknown the wallet may have paid, so the subscription must be read back before creating anew`)
    if (!/\.access\b|\breason\b/.test(submitted.file.text)) {
      report('WARN', `${at(submitted.file, submitted.index)} never reads subscription.access nor reason: a submit that returns is not always a subscription that landed`)
    }
  }

  for (const { build, confirm, call } of built) {
    if (names(confirm)) report('PASS', `a ${build} built on the server is also confirmed (${confirm})`)
    else report('FAIL', `${at(call.file, call.index)} builds a ${build} and nothing ever calls ${confirm}: the app never learns whether the wallet's transaction landed`)
  }
  for (const [, confirm] of ACTIONS) {
    const call = first(confirm)
    if (call && !/\breason\b/.test(call.file.text)) {
      report('WARN', `${at(call.file, call.index)} calls ${confirm} and never reads reason: with a reason, nothing changed`)
    }
  }
  if (dynamic && built.length === 0) {
    report('SKIP', `${shown(dynamic.path)} calls subscriptions by a computed name: check by hand that each build has its confirm`)
  }

  // Who the subscription is for, and whose it is.
  if (created) {
    const body = created.file.text.slice(created.index, created.index + 500)
    if (/\b(external_id|email)\s*:\s*[^,\n]*\b(req|request|ctx|body|query|params|searchParams)\b[^,\n]*\.(body|query|params|get\()|\b(external_id|email)\s*:\s*(body|query|params)\b/.test(body)) {
      report('WARN', `${at(created.file, created.index)} seems to take external_id or email from the request itself: they must come from the session the app verified`)
    } else if (!/\bexternal_id\b/.test(body)) {
      report('WARN', `${at(created.file, created.index)} creates without external_id: an access check by the app's own user id will not find this subscription`)
    } else {
      report('PASS', 'subscriptions.create names the customer by external_id (a reading of the code, not a proof of where it comes from)')
    }
  }
  let unchecked = 0
  for (const file of sources) {
    const match = file.text.match(byId)
    if (!match || isClient(file.text)) continue
    if (!/\bexternal_id\b|\.wallet\b|\.email\b/.test(file.text)) {
      unchecked += 1
      report('WARN', `${at(file, match.index)} acts on a subscription by id and never compares its external_id, wallet or email: the API key reaches every subscription of the project, so check whose it is first`)
    }
  }
  if (unchecked === 0) report('PASS', 'every file that acts on a subscription by id also reads whose it is (a reading of the code, not a proof)')
}

if (files.length >= MAX_FILES) report('WARN', `stopped reading at ${MAX_FILES} files: run this from the app's own folder for a full check`)

for (const { level, message } of results) process.stdout.write(`${level.padEnd(4)}  ${message}\n`)
const count = (level) => results.filter((result) => result.level === level).length
process.stdout.write(`\n${count('PASS')} passed, ${count('FAIL')} failed, ${count('WARN')} to look at, ${count('SKIP')} skipped\n`)
process.exit(count('FAIL') > 0 ? 1 : 0)
