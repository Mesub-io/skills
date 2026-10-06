#!/usr/bin/env node
// Usage: node "<skill-dir>/scripts/check-setup.mjs" [--help] [--server-only]
//
// Reads the project in the current directory and reports whether Mesub is wired:
// the packages, the API key, the routes the widget calls, a gated route, the
// provider and the button. Run it from the project root.
//
// It only reads files. No write, no install, no network. It never shows the
// value of a key: only the file and the line where it found one.
//
// Exit 0: no FAIL. Exit 1: at least one FAIL. Exit 2: arguments not understood.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const HELP = `Usage: node "<skill-dir>/scripts/check-setup.mjs" [--help] [--server-only]

Checks, from the project root, that a Mesub integration is wired.
Reads files only: no write, no install, no network, no key value shown.

  --server-only   the project has no React front: skip the widget checks
  --help          show this text

Each line is PASS, FAIL, WARN or SKIP. Exit 0 when nothing FAILs, 1 otherwise.`

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(`${HELP}\n`)
  process.exit(0)
}
const unknown = args.filter((arg) => arg !== '--server-only')
if (unknown.length > 0) {
  process.stderr.write(`Unknown argument: ${unknown[0]}\n\n${HELP}\n`)
  process.exit(2)
}
const serverOnly = args.includes('--server-only')

const root = process.cwd()
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.next', '.nuxt', '.turbo', '.vercel',
  '.output', '.cache', '.agents', 'vendor', 'tmp',
])
const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/
const MAX_FILES = 6000
const MAX_BYTES = 512 * 1024

const results = []
const report = (level, message) => results.push({ level, message })
const shown = (path) => relative(root, path).split(sep).join('/') || '.'

/** Every file of the project worth reading, generated and installed folders left out. */
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

const files = walk(root)
const sources = files.filter((path) => SOURCE.test(path)).map((path) => ({ path, text: read(path) }))
const manifests = files.filter((path) => path.endsWith(`${sep}package.json`) || path === join(root, 'package.json'))
const envFiles = files.filter((path) => /(^|[\\/])\.env(\.[\w.-]+)?$/.test(path))
const isExample = (path) => /\.(example|sample|template|dist)$/.test(path)

if (manifests.length === 0) {
  process.stderr.write('No package.json here. Run this from the project root.\n')
  process.exit(2)
}

// --- Node ---
const nodeMajor = Number(process.versions.node.split('.')[0])
if (nodeMajor >= 22) report('PASS', `Node ${process.versions.node} runs this check (@mesub/node needs 22 or later)`)
else report('FAIL', `Node ${process.versions.node} runs this check: @mesub/node needs 22 or later, on the server too`)

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
      if (!declared.has(name)) declared.set(name, { manifest: path, group })
    }
  }
}

/** The version installed for a package, looked up from the manifest that names it, then the root. */
function installed(name) {
  const from = declared.get(name)?.manifest
  const starts = [from ? join(from, '..') : null, root].filter(Boolean)
  for (const start of starts) {
    const path = join(start, 'node_modules', ...name.split('/'), 'package.json')
    if (!existsSync(path)) continue
    try {
      return JSON.parse(readFileSync(path, 'utf8')).version ?? 'unknown version'
    } catch {
      return 'unknown version'
    }
  }
  return null
}

function checkPackage(name, required) {
  const entry = declared.get(name)
  if (!entry) {
    report(required ? 'FAIL' : 'SKIP', `${name} is not in any package.json${required ? '' : ' (skipped)'}`)
    return false
  }
  const version = installed(name)
  if (!version) {
    report('FAIL', `${name} is in ${shown(entry.manifest)} but not installed: run the project's install`)
    return false
  }
  if (name === '@mesub/node' && entry.group === 'devDependencies') {
    report('WARN', `${name} ${version} is a devDependency in ${shown(entry.manifest)}: a production install would leave it out`)
  } else {
    report('PASS', `${name} ${version} is installed (${shown(entry.manifest)})`)
  }
  return true
}

checkPackage('@mesub/node', true)
const hasReact = serverOnly ? false : checkPackage('@mesub/react', true)
if (serverOnly) report('SKIP', 'the widget checks, by --server-only')

// --- The API key ---
const KEY_NAME = 'MESUB_API_KEY'
const KEY_LITERAL = /SUB_[A-Za-z0-9]{16,}/
const PUBLIC_NAME = /\b(NEXT_PUBLIC|VITE|REACT_APP|EXPO_PUBLIC|NUXT_PUBLIC|GATSBY|PUBLIC)_[A-Z0-9_]*/g

/** NAME=value pairs of an env file, comments and blanks left out. */
function pairs(text) {
  const found = []
  text.split('\n').forEach((raw, index) => {
    const match = raw.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match) return
    found.push({ name: match[1], value: match[2].trim().replace(/^["']|["']$/g, ''), line: index + 1 })
  })
  return found
}

function tracked(path) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', path], { cwd: root, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

let keyFound = false
for (const path of envFiles) {
  for (const pair of pairs(read(path))) {
    const where = `${shown(path)}:${pair.line}`
    const isKey = KEY_LITERAL.test(pair.value)

    if (isExample(path)) {
      if (isKey) report('FAIL', `${where} holds a real API key in an example file: replace it with a placeholder and rotate the key`)
      continue
    }
    if (pair.name === KEY_NAME && pair.value !== '') {
      keyFound = true
      if (!pair.value.startsWith('SUB_')) {
        report('FAIL', `${where} sets ${KEY_NAME} to something that does not start with SUB_: that is not an API key`)
      } else if (tracked(path)) {
        report('FAIL', `${where} sets ${KEY_NAME} in a file git tracks: untrack it, ignore it, and rotate the key`)
      } else {
        report('PASS', `${KEY_NAME} is set in ${shown(path)}, which git does not track`)
      }
    } else if (isKey && new RegExp(`^${PUBLIC_NAME.source}$`).test(pair.name)) {
      report('FAIL', `${where} puts an API key in ${pair.name}, a variable the bundler ships to the browser`)
    }
  }
}
if (!keyFound) {
  report('WARN', `${KEY_NAME} is in no env file here: fine if the host sets it, otherwise new Mesub() throws on start`)
}

let leaks = 0
for (const { path, text } of sources) {
  const literal = text.match(KEY_LITERAL)
  if (literal) {
    leaks += 1
    report('FAIL', `${shown(path)}:${lineOf(text, literal.index)} holds a literal API key: read it from the environment and rotate it`)
  }
  for (const match of text.matchAll(PUBLIC_NAME)) {
    if (/MESUB/.test(match[0]) && /KEY/.test(match[0]) && !/PUBLISHABLE/.test(match[0])) {
      leaks += 1
      report('FAIL', `${shown(path)}:${lineOf(text, match.index)} reads ${match[0]}: that prefix ships the value to the browser`)
      break
    }
  }
  const client = /^\s*["']use client["']/m.test(text) || /from\s+["']@mesub\/react["']/.test(text)
  const reads = text.indexOf(KEY_NAME)
  if (client && reads !== -1) {
    leaks += 1
    report('FAIL', `${shown(path)}:${lineOf(text, reads)} is client code that names ${KEY_NAME}: the key stays on the server`)
  }
}
if (leaks === 0) report('PASS', 'no API key in source files, and none under a browser prefix')

// --- The routes the widget calls ---
/** The URL an App Router catch-all answers under: app/api/mesub/[...mesub]/route.ts gives /api/mesub. */
function nextMount(path) {
  const parts = shown(path).split('/')
  const app = parts.lastIndexOf('app')
  if (app === -1 || !/^route\.(ts|js|mjs|tsx|jsx)$/.test(parts.at(-1))) return null
  const inside = parts.slice(app + 1, -1)
  if (!/^\[\[?\.\.\./.test(inside.at(-1) ?? '')) return null
  return `/${inside.slice(0, -1).filter((part) => !/^\(.*\)$/.test(part)).join('/')}`
}

const mounts = []
for (const { path, text } of sources) {
  if (/\bmesubRouteHandlers\s*\(/.test(text)) {
    const mount = nextMount(path)
    if (mount) {
      mounts.push(mount)
      report('PASS', `the widget routes are mounted at ${mount} (${shown(path)})`)
    } else {
      report('FAIL', `${shown(path)} calls mesubRouteHandlers outside a catch-all route: it belongs in app/api/mesub/[...mesub]/route.ts`)
      mounts.push(null)
    }
  }
  for (const call of text.matchAll(/\bmesubRoutes\s*\(/g)) {
    const before = text.slice(Math.max(0, call.index - 400), call.index)
    const use = [...before.matchAll(/\.use\(\s*(["'`])([^"'`]+)\1/g)].at(-1)
    mounts.push(use ? use[2] : null)
    report('PASS', `the widget routes are mounted${use ? ` at ${use[2]}` : ''} (${shown(path)}:${lineOf(text, call.index)})`)
  }
}
if (mounts.length === 0) {
  report(serverOnly ? 'SKIP' : 'FAIL', 'the widget routes are not mounted: no mesubRoutes( or mesubRouteHandlers( call found')
}

// --- Who is asking ---
let suspicious = 0
for (const { path, text } of sources) {
  if (!/@mesub\/node/.test(text)) continue
  for (const match of text.matchAll(/\bcustomer\b\s*[:=(]/g)) {
    const body = text.slice(match.index, match.index + 320)
    if (/\b(req|request)\.(query|body|params)\b|searchParams|\.headers\.get\(\s*["'`]x-|\.headers\[\s*["'`]x-/.test(body)) {
      suspicious += 1
      report('WARN', `${shown(path)}:${lineOf(text, match.index)} seems to take the customer from the request itself: it must come from a verified session`)
      break
    }
  }
}
if (suspicious === 0 && mounts.length > 0) report('PASS', 'no customer read from the query, the body or a custom header (a reading of the code, not a proof)')

// --- A gated route ---
const gate = sources.find(({ text }) => /from\s+["']@mesub\/node|require\(\s*["']@mesub\/node/.test(text) && /\b(hasAccess|requirePlan|withMesub|RequirePlan|accessList)\s*[(<]|\bmesub\.access\s*\(/.test(text))
if (gate) report('PASS', `a route asks Mesub for access (${shown(gate.path)})`)
else report('WARN', 'no route is gated yet: nothing calls hasAccess, requirePlan, withMesub or RequirePlan')

// --- The widget ---
if (hasReact) {
  const providers = []
  for (const { path, text } of sources) {
    for (const match of text.matchAll(/<MesubProvider\b[^>]*>/g)) {
      const endpoint = match[0].match(/\bendpoint=(?:\{\s*)?(["'`])([^"'`]+)\1/)
      providers.push({ path, line: lineOf(text, match.index), endpoint: endpoint ? endpoint[2] : null })
    }
  }
  if (providers.length === 0) {
    report('FAIL', 'no <MesubProvider> found: the widget needs it once, around the app')
  }
  for (const provider of providers) {
    const where = `${shown(provider.path)}:${provider.line}`
    const known = mounts.filter(Boolean)
    if (!provider.endpoint) {
      report('WARN', `${where} has a <MesubProvider> whose endpoint is not a plain string: check by hand that it is where the routes are mounted`)
    } else if (known.length === 0) {
      report('SKIP', `${where} points the widget at ${provider.endpoint}: the mount path could not be read to compare`)
    } else {
      let pathname = provider.endpoint
      try {
        if (/^https?:\/\//.test(pathname)) pathname = new URL(pathname).pathname
      } catch {
        // Left as written.
      }
      const clean = (value) => value.replace(/\/+$/, '') || '/'
      if (known.some((mount) => clean(pathname).endsWith(clean(mount)))) {
        report('PASS', `${where} points the widget at ${provider.endpoint}, where the routes are mounted`)
      } else {
        report('FAIL', `${where} points the widget at ${provider.endpoint}, but the routes are mounted at ${known.join(', ')}`)
      }
    }
  }

  if (sources.some(({ text }) => /@mesub\/react\/styles\.css/.test(text))) report('PASS', 'the widget stylesheet is imported')
  else report('WARN', '@mesub/react/styles.css is imported nowhere: the window shows unstyled unless the app styles it itself')

  const button = sources.find(({ text }) => /<SubscribeButton\b|\buseSubscribe\s*\(/.test(text))
  if (button) report('PASS', `a subscribe button is placed (${shown(button.path)})`)
  else report('FAIL', 'no <SubscribeButton> and no useSubscribe( call: nothing opens the subscribe window')
}

if (files.length >= MAX_FILES) report('WARN', `stopped reading at ${MAX_FILES} files: run this from the app's own folder for a full check`)

for (const { level, message } of results) process.stdout.write(`${level.padEnd(4)}  ${message}\n`)
const count = (level) => results.filter((result) => result.level === level).length
process.stdout.write(`\n${count('PASS')} passed, ${count('FAIL')} failed, ${count('WARN')} to look at, ${count('SKIP')} skipped\n`)
process.exit(count('FAIL') > 0 ? 1 : 0)
