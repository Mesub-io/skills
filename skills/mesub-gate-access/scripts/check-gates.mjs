#!/usr/bin/env node
// Usage: node "<skill-dir>/scripts/check-gates.mjs" [--help]
//
// Reads the project in the current directory and reports every place that asks
// Mesub for access, the routes a guard guards, and the mistakes that make a gate unsafe or silently
// broken. Run it from the project root.
//
// It only reads files. No write, no install, no network. It never shows the
// value of a key.
//
// Exit 0: no FAIL. Exit 1: at least one FAIL. Exit 2: arguments not understood.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join, relative, sep } from 'node:path'

const HELP = `Usage: node "<skill-dir>/scripts/check-gates.mjs" [--help]

Lists, from the project root, every gate on a Mesub plan (requirePlan, withMesub,
RequirePlan, hasAccess), the routes each guard guards, and checks them for the
usual mistakes.
Reads files only: no write, no install, no network, no key value shown.

  --help          show this text

Each line is PASS, FAIL or WARN. Exit 0 when nothing FAILs, 1 otherwise.
A reading of the code, not a proof: it cannot see a gate reached through a
helper it does not know, nor run the app.`

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
const TEST = /(\.|_)(test|spec)\.[cm]?[jt]sx?$|(^|\/)(__tests__|tests?|e2e)\//
const MAX_FILES = 6000
const MAX_BYTES = 512 * 1024
const MAX_PLANS = 3

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

/** The text with its comments blanked, same length and same lines, so a commented call is not a call. */
function withoutComments(text) {
  const blank = (match) => match.replace(/[^\n]/g, ' ')
  return text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (match, lead) => lead + blank(match.slice(lead.length)))
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length

/** The arguments of the call whose opening parenthesis is at `open`, as written. */
function argsAt(text, open) {
  let depth = 0
  for (let index = open; index < Math.min(text.length, open + 4000); index++) {
    const char = text[index]
    if (char === '(' || char === '[' || char === '{') depth += 1
    else if (char === ')' || char === ']' || char === '}') {
      depth -= 1
      if (depth === 0) return text.slice(open + 1, index)
    }
  }
  return text.slice(open + 1, open + 4000)
}

const files = walk(root)
const manifests = files.filter((path) => basename(path) === 'package.json')
if (manifests.length === 0) {
  process.stderr.write('No package.json here. Run this from the project root.\n')
  process.exit(2)
}

const sources = files
  .filter((path) => SOURCE.test(path) && !TEST.test(shown(path)))
  .map((path) => ({ path, text: withoutComments(read(path)) }))
const usesNode = ({ text }) => /from\s+["']@mesub\/node|require\(\s*["']@mesub\/node|import\(\s*["']@mesub\/node/.test(text)
// A file that asks through a client imported from the app's own module counts too.
const asksMesub = ({ text }) => /\.\s*(hasAccess|accessList)\s*\(|\bmesub\w*\s*\.\s*access\s*\(/i.test(text)
const server = sources.filter((file) => usesNode(file) || asksMesub(file))
// Where a named gate is used: any file of the app, not only those that ask Mesub.
const everyFile = sources

// --- The package ---
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

const NODE_SDK = '@mesub/node'
const entry = declared.get(NODE_SDK)
if (!entry) {
  report('FAIL', `${NODE_SDK} is not in any package.json: the first setup comes before any gate`)
} else {
  const starts = [join(entry.manifest, '..'), root]
  const found = starts.map((start) => join(start, 'node_modules', '@mesub', 'node', 'package.json')).find((path) => existsSync(path))
  let version = null
  try {
    if (found) version = JSON.parse(readFileSync(found, 'utf8')).version ?? 'unknown version'
  } catch {
    version = 'unknown version'
  }
  if (!version) report('FAIL', `${NODE_SDK} is in ${shown(entry.manifest)} but not installed: run the project's install`)
  else if (entry.group === 'devDependencies') report('WARN', `${NODE_SDK} ${version} is a devDependency in ${shown(entry.manifest)}: a production install would leave it out`)
  else report('PASS', `${NODE_SDK} ${version} is installed (${shown(entry.manifest)})`)
}

// --- The gates ---
const GUARDS = [
  { name: 'requirePlan', call: /\brequirePlan\s*\(/g, planFirst: true, custom: 'replaces' },
  { name: 'withMesub', call: /\bwithMesub\s*(?:<[^>()]*>)?\s*\(/g, planFirst: false, custom: 'replaces' },
  { name: 'RequirePlan', call: /\bRequirePlan\s*(?:<[^>()]*>)?\s*\(/g, planFirst: true, custom: 'throws' },
]

/** The slugs written as a list in a guard's arguments, or null when the plan is not a literal list. */
function listedPlans(written, planFirst) {
  const list = planFirst ? written.match(/^\s*\[([^\]]*)\]/) : written.match(/\bplan\s*:\s*\[([^\]]*)\]/)
  if (!list) return null
  return [...new Set([...list[1].matchAll(/(["'`])([^"'`]+)\1/g)].map((match) => match[2]))]
}

const ROUTE_CALL = /\.\s*(get|post|put|patch|delete|all|use|head|options)\s*\(/g
const METHODS = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/

/** The URL an App Router route file answers: app/api/reports/route.ts gives /api/reports. */
function nextPath(path) {
  const parts = shown(path).split('/')
  const app = parts.lastIndexOf('app')
  if (app === -1 || !/^route\.[cm]?[jt]sx?$/.test(parts.at(-1))) return null
  return `/${parts.slice(app + 1, -1).filter((part) => !/^\(.*\)$/.test(part)).join('/')}`
}

/** `GET /x (file:line)` for an Express route call at `index`, whose arguments are `written`. */
function routeName(path, text, index, method, written) {
  const literal = written.match(/^\s*(["'`])([^"'`]*)\1/)
  const verb = method === 'use' ? 'every route under' : method.toUpperCase()
  const at = `${shown(path)}:${lineOf(text, index)}`
  if (method === 'use' && !literal) return `every later route of its app or router (${at})`
  return `${verb} ${literal ? literal[2] : 'a path worked out in code'} (${at})`
}

/**
 * The routes a gate guards: null when it is neither named nor inside a route call
 * (nothing to follow), [] when it is named and no route uses the name.
 */
function routesOf(path, text, index) {
  // Inline: app.get('/x', requirePlan(...), handler).
  const before = text.slice(Math.max(0, index - 400), index)
  const inline = [...before.matchAll(ROUTE_CALL)].at(-1)
  if (inline) {
    const open = Math.max(0, index - 400) + inline.index + inline[0].length - 1
    const written = argsAt(text, open)
    if (open + written.length + 1 > index) return [routeName(path, text, open, inline[1], written)]
  }
  // NestJS: @UseGuards(RequirePlan(...)) on a class or a method.
  if (/@UseGuards\s*\([^@]*$/.test(before)) {
    const rest = text.slice(index, index + 1500)
    const verb = rest.match(/@(Get|Post|Put|Patch|Delete|All)\s*\(\s*(?:(["'`])([^"'`]*)\2)?/)
    const controller = text.slice(0, index).match(/@Controller\s*\(\s*(?:(["'`])([^"'`]*)\1)?[^)]*\)(?![\s\S]*@Controller)/)
    const base = controller?.[2] ? `/${controller[2].replace(/^\/+/, '')}` : ''
    if (verb) return [`${verb[1].toUpperCase()} ${`${base}/${verb[3] ?? ''}`.replace(/\/+/g, '/').replace(/(.)\/$/, '$1') || '/'} (${shown(path)}:${lineOf(text, index + verb.index)})`]
    return null
  }
  const declared = before.match(/(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=\s*(?:await\s+)?$/)
  if (!declared) return null
  const name = declared[1]
  // Next: export const GET = withMesub(...) in app/**/route.ts.
  if (METHODS.test(name)) {
    const url = nextPath(path)
    return url ? [`${name} ${url} (${shown(path)}:${lineOf(text, index)})`] : null
  }
  const uses = []
  const used = new RegExp(`(^|[^\\w$.])${name.replace(/\$/g, '\\$')}(?![\\w$])(?!\\s*[(:=])`)
  for (const file of everyFile) {
    for (const call of file.text.matchAll(ROUTE_CALL)) {
      const open = call.index + call[0].length - 1
      const written = argsAt(file.text, open)
      if (used.test(written)) uses.push(routeName(file.path, file.text, call.index, call[1], written))
    }
  }
  return uses
}

const guards = []
for (const file of server) {
  const { path, text } = file
  for (const guard of GUARDS) {
    for (const match of text.matchAll(guard.call)) {
      // A definition or an import, not a call.
      if (/\b(function|import|export)\s+$/.test(text.slice(Math.max(0, match.index - 12), match.index))) continue
      const open = match.index + match[0].length - 1
      const written = argsAt(text, open)
      const where = `${shown(path)}:${lineOf(text, match.index)}`
      guards.push({ ...guard, path, text, written, where })

      const plans = listedPlans(written, guard.planFirst)
      const single = guard.planFirst ? written.match(/^\s*(["'`])([^"'`]+)\1/) : written.match(/\bplan\s*:\s*(["'`])([^"'`]+)\1/)
      const named = plans ? plans.join(', ') : single ? single[2] : 'a plan worked out in code'
      const routes = routesOf(path, text, match.index)
      if (routes === null) {
        report('PASS', `gate: ${guard.name} on ${named} (${where})`)
      } else if (routes.length === 0) {
        report('WARN', `gate: ${guard.name} on ${named} (${where}) is defined but guards no route this check can find: mount it on the paid routes, or check by hand where it runs`)
      } else {
        report('PASS', `gate: ${guard.name} on ${named} (${where}), guards ${routes.join(', ')}`)
      }

      if (plans && plans.length > MAX_PLANS) {
        report('FAIL', `${where} asks about ${plans.length} plans: a guard takes ${MAX_PLANS} at most and throws when it is built`)
      }
      if (/\{/.test(written) && !/\bcustomer\b/.test(written)) {
        report('FAIL', `${where} gives ${guard.name} no customer: it throws when it is built, since it cannot tell who is asking`)
      }
    }
  }
}

const asks = []
for (const { path, text } of server) {
  for (const match of text.matchAll(/\.\s*(hasAccess|accessList|access)\s*\(/g)) {
    // `access(` only on something that is clearly the client.
    if (match[1] === 'access' && !/\bmesub\w*\s*$/i.test(text.slice(Math.max(0, match.index - 24), match.index))) continue
    asks.push({ path, text, index: match.index, end: match.index + match[0].length, name: match[1], where: `${shown(path)}:${lineOf(text, match.index)}` })
  }
}
for (const ask of asks.filter((item) => item.name === 'hasAccess')) report('PASS', `gate: hasAccess (${ask.where})`)

if (guards.length === 0 && !asks.some((ask) => ask.name === 'hasAccess')) {
  report('FAIL', 'nothing is gated: no requirePlan, withMesub, RequirePlan or hasAccess call in the server code')
}

// --- A promise is not an answer ---
for (const ask of asks.filter((item) => item.name === 'hasAccess')) {
  const before = ask.text.slice(Math.max(0, ask.index - 160), ask.index).split(/[;{}\n]/).at(-1)
  const after = ask.text.slice(ask.end, ask.end + 400)
  if (/\bawait\b/.test(before)) continue
  if (/^[^;]*?\)\s*\.then\s*\(/.test(after)) continue
  if (/(\bif\s*\(|\bwhile\s*\(|!|&&|\|\||\?)[\s(]*[\w.$]*$/.test(before)) {
    report('FAIL', `${ask.where} reads hasAccess without await: a promise is always truthy, so everyone is let in`)
  }
}
// Kept in a variable without await, then read as if it were the answer: `const ok = mesub.hasAccess(...)`, `if (!ok)`.
for (const ask of asks) {
  const before = ask.text.slice(Math.max(0, ask.index - 160), ask.index).split(/[;{}\n]/).at(-1)
  const kept = before.match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*[\w$.]*$/)
  if (!kept || /\bawait\b/.test(before)) continue
  const name = kept[1].replace(/\$/g, '\\$')
  const rest = ask.text.slice(ask.end, ask.end + 1500)
  if (/^[^;\n]*?\)\s*\.then\s*\(/.test(rest)) continue
  const read = rest.match(new RegExp(`(?:\\bif\\s*\\(\\s*!?\\s*|!\\s*|&&\\s*|\\|\\|\\s*|\\breturn\\s+|=\\s*)${name}(?:\\s*[)?&|]|\\.\\s*(?:access|allowed|grants|plans)\\b)`))
  if (!read) continue
  // Awaited before that read: `const ok = await pending` is the answer, not the promise.
  if (new RegExp(`\\bawait\\s+${name}\\b`).test(rest.slice(0, read.index))) continue
  const at = `${shown(ask.path)}:${lineOf(ask.text, ask.end + read.index)}`
  report('FAIL', `${ask.where} keeps ${ask.name} in ${kept[1]} without await and reads it as an answer (${at}): a promise is always truthy and has no access field, so the gate is wrong for everyone. Await it`)
}

// --- An error is not a "no" ---
/** Whether a `try {` opens before the call with no `catch` between the two. */
function inTry(ask) {
  const before = ask.text.slice(Math.max(0, ask.index - 600), ask.index)
  const opened = [...before.matchAll(/\btry\s*\{/g)].at(-1)
  return opened !== undefined && !/\bcatch\b/.test(before.slice(opened.index))
}
/** The block of the first catch in `after`, braces inside it included, or null. */
function catchBody(after) {
  const opened = after.match(/\bcatch\s*(?:\([^)]*\))?\s*\{/)
  return opened ? argsAt(after, opened.index + opened[0].length - 1) : null
}
/** Whether a catch block answers "no": false, null, a bare return, or a 402 "not subscribed". */
const answersNo = (body) => body !== null && /\b(return\s+false|=\s*false|return\s*;|return\s+null|status\s*\(\s*402\b|status\s*:\s*402\b)/.test(body)
for (const ask of asks) {
  const after = ask.text.slice(ask.end, ask.end + 600)
  const swallowed = after.match(/^[^;]*?\)\s*\.catch\s*\(\s*(?:async\s*)?\(?[^)]*\)?\s*=>\s*\(?\s*(false|null|undefined)\b/)
  if (swallowed) {
    report('FAIL', `${ask.where} turns every error of ${ask.name} into "${swallowed[1]}": a refused key or a wrong slug would lock every subscriber out, silently`)
  } else if (inTry(ask) && answersNo(catchBody(ask.text.slice(ask.end, ask.end + 1500)))) {
    report('WARN', `${ask.where} sits in a try whose catch seems to answer "no": only an outage is a fallback, and ${ask.name === 'hasAccess' ? 'hasAccess already handles it' : 'a bad key or slug must stay loud'}`)
  }
}

// --- Who is asking ---
let suspicious = 0
for (const { path, text } of server) {
  for (const match of text.matchAll(/\bcustomer\b\s*[:=(]/g)) {
    const body = text.slice(match.index, match.index + 320)
    if (/\b(req|request)\.(query|body|params)\b|searchParams|\.headers\.get\(\s*["'`]x-|\.headers\[\s*["'`]x-/.test(body)) {
      suspicious += 1
      report('WARN', `${shown(path)}:${lineOf(text, match.index)} seems to take the customer from the request itself: it must come from a verified session`)
      break
    }
  }
}
for (const ask of asks) {
  const written = argsAt(ask.text, ask.end - 1)
  if (/\b(req|request)\.(query|body|params)\b|searchParams/.test(written)) {
    suspicious += 1
    report('WARN', `${ask.where} asks ${ask.name} about someone named by the request itself: it must be the signed-in user`)
  }
}
if (suspicious === 0 && (guards.length > 0 || asks.length > 0)) {
  report('PASS', 'no customer read from the query, the body or a custom header (a reading of the code, not a proof)')
}

// --- One client ---
const clients = []
for (const { path, text } of server) {
  for (const match of text.matchAll(/\bnew\s+Mesub\s*\(/g)) {
    const lineStart = text.lastIndexOf('\n', match.index) + 1
    const written = argsAt(text, match.index + match[0].length - 1)
    const nested = /^[ \t]+\S/.test(text.slice(lineStart, match.index))
    clients.push({ where: `${shown(path)}:${lineOf(text, match.index)}`, nested, written })
  }
}
for (const client of clients.filter((item) => item.nested)) {
  report('WARN', `${client.where} builds a Mesub client inside a function: built per request, its cache and its outage fallback start empty every time`)
}
if (clients.length > 1) {
  report('WARN', `${clients.length} Mesub clients are built (${clients.map((client) => client.where).join(', ')}): unless they share one cache store, each keeps its own answers`)
}
const tuned = clients.find((client) => /\b(cache|maxStaleMs|guardTimeout)\b\s*[:,}]/.test(client.written))
if (tuned) {
  for (const guard of guards) {
    if (/\{/.test(guard.written) && !/\bclient\b/.test(guard.written)) {
      report('WARN', `${guard.where} passes no client: this guard uses a default one, not the client configured at ${tuned.where}, so its cache, maxStaleMs and guardTimeout do not apply`)
    }
  }
}
for (const client of clients) {
  if (/\bmaxStaleMs\s*:\s*0\b(?!\s*[.\d*x])/.test(client.written)) {
    report('WARN', `${client.where} sets maxStaleMs to 0: the outage fallback is off, so an outage keeps every subscriber out`)
  }
}

// --- Gate on access, not on status ---
for (const { path, text } of server) {
  const match = text.match(/\.status\s*[!=]==?\s*["'`](active|cancelled|unpaid)["'`]/)
  if (match && /\b(hasAccess|access|accessList|requirePlan|withMesub|RequirePlan)\b/.test(text)) {
    report('WARN', `${shown(path)}:${lineOf(text, match.index)} compares a status to "${match[1]}": gate on the answer's access field, a cancelled subscription still grants and an unpaid one may`)
  }
}

// --- A custom refusal ---
for (const guard of guards) {
  if (guard.custom !== 'replaces' || !/\bonDenied\b/.test(guard.written)) continue
  if (!/retry-after/i.test(guard.text)) {
    report('WARN', `${guard.where} passes onDenied and the file never sets Retry-After: onDenied replaces the whole default answer, so say when to retry on "unavailable"`)
  }
  if (!/unavailable|\.status\b/.test(guard.text)) {
    report('WARN', `${guard.where} passes onDenied and the file never reads the reason or the status: an outage would be answered like "not subscribed"`)
  }
}

// --- The wrong place ---
for (const guard of guards) {
  if (guard.name === 'withMesub' && /^middleware\.[cm]?[jt]s$/.test(basename(guard.path))) {
    report('FAIL', `${guard.where} uses withMesub in middleware: it wraps App Router route handlers only`)
  }
}
for (const { path, text } of server) {
  if (!/^\s*["']use client["']/m.test(text)) continue
  if (/@mesub\/node(?!\/situations)["'/]/.test(text) || asksMesub({ text })) {
    report('FAIL', `${shown(path)} is client code that asks Mesub or imports ${NODE_SDK}: the check and the API key stay on the server`)
  }
}

if (files.length >= MAX_FILES) report('WARN', `stopped reading at ${MAX_FILES} files: run this from the app's own folder for a full check`)

for (const { level, message } of results) process.stdout.write(`${level.padEnd(4)}  ${message}\n`)
const count = (level) => results.filter((result) => result.level === level).length
process.stdout.write(`\n${count('PASS')} passed, ${count('FAIL')} failed, ${count('WARN')} to look at\n`)
process.exit(count('FAIL') > 0 ? 1 : 0)
