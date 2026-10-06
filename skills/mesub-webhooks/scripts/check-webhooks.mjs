#!/usr/bin/env node
// Usage: node "<skill-dir>/scripts/check-webhooks.mjs" [--help]
//
// Reads the project in the current directory and reports whether its Mesub
// webhook handler is wired safely: the package, the signing secret, the raw
// body, the answer to a bad signature, the deduplication. Run it from the
// project root.
//
// It only reads files. No write, no install, no network. It never shows the
// value of a signing secret or of a key: only the file and the line.
//
// Exit 0: no FAIL. Exit 1: at least one FAIL. Exit 2: arguments not understood.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const HELP = `Usage: node "<skill-dir>/scripts/check-webhooks.mjs" [--help]

Checks, from the project root, that a Mesub webhook handler is wired safely.
Reads files only: no write, no install, no network, no secret value shown.

  --help          show this text

Each line is PASS, FAIL, WARN or SKIP. Exit 0 when nothing FAILs, 1 otherwise.
A PASS is a reading of the code, not a proof: the runbook has the live checks.`

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
/** The text without its comments, so a rule quoted in a comment is not read as code. */
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

const files = walk(root)
const sources = files.filter((path) => SOURCE.test(path)).map((path) => ({ path, text: read(path) }))
const manifests = files.filter((path) => path.endsWith(`${sep}package.json`) || path === join(root, 'package.json'))
const envFiles = files.filter((path) => /(^|[\\/])\.env(\.[\w.-]+)?$/.test(path))
const isExample = (path) => /\.(example|sample|template|dist)$/.test(path)
const isTest = (path) => /(\.|-)(test|spec)\.[a-z]+$|(^|[\\/])(__tests__|tests?|e2e)[\\/]/.test(shown(path))

if (manifests.length === 0) {
  process.stderr.write('No package.json here. Run this from the project root.\n')
  process.exit(2)
}

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

const entry = declared.get('@mesub/node')
if (!entry) {
  report('FAIL', '@mesub/node is not in any package.json: the handler needs it to verify a delivery')
} else {
  const folder = [join(entry.manifest, '..'), root]
    .map((start) => join(start, 'node_modules', '@mesub', 'node'))
    .find((path) => existsSync(join(path, 'package.json')))
  if (!folder) {
    report('FAIL', `@mesub/node is in ${shown(entry.manifest)} but not installed: run the project's install`)
  } else {
    let version = 'unknown version'
    try {
      version = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')).version ?? version
    } catch {
      // Left unknown.
    }
    const types = read(join(folder, 'dist', 'index.d.ts'))
    if (types && !/\bverifyWebhook\b/.test(types)) {
      report('FAIL', `@mesub/node ${version} is installed but exports no verifyWebhook: this version cannot verify a delivery`)
    } else {
      report('PASS', `@mesub/node ${version} is installed (${shown(entry.manifest)})`)
    }
    if (entry.group === 'devDependencies') {
      report('WARN', `@mesub/node is a devDependency in ${shown(entry.manifest)}: a production install would leave it out`)
    }
  }
}

// --- The signing secret ---
const SECRET_NAME = 'MESUB_WEBHOOK_SECRET'
const SECRET_LITERAL = /whsec_[A-Za-z0-9+/=_-]{16,}/
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

let secretFound = false
for (const path of envFiles) {
  for (const pair of pairs(read(path))) {
    const where = `${shown(path)}:${pair.line}`
    const isSecret = SECRET_LITERAL.test(pair.value)

    if (isExample(path)) {
      if (isSecret) report('FAIL', `${where} holds a real signing secret in an example file: replace it with a placeholder and treat the secret as leaked`)
      continue
    }
    if (pair.name === SECRET_NAME && pair.value !== '') {
      secretFound = true
      if (/^(SUB|PUB)_/.test(pair.value)) {
        report('FAIL', `${where} sets ${SECRET_NAME} to an API key or a publishable key: it is the endpoint's signing secret, whsec_...`)
      } else if (!pair.value.startsWith('whsec_')) {
        report('FAIL', `${where} sets ${SECRET_NAME} to something that does not start with whsec_: new Mesub() throws on it`)
      } else if (tracked(path)) {
        report('FAIL', `${where} sets ${SECRET_NAME} in a file git tracks: untrack it, ignore it, and treat the secret as leaked`)
      } else {
        report('PASS', `${SECRET_NAME} is set in ${shown(path)}, which git does not track`)
      }
    } else if (isSecret && new RegExp(`^${PUBLIC_NAME.source}$`).test(pair.name)) {
      report('FAIL', `${where} puts a signing secret in ${pair.name}, a variable the bundler ships to the browser`)
    }
  }
}
if (!secretFound) {
  report('WARN', `${SECRET_NAME} is in no env file here: fine if the host sets it, otherwise verifying throws a TypeError`)
}

let leaks = 0
for (const { path, text } of sources) {
  const literal = text.match(SECRET_LITERAL)
  if (literal) {
    const where = `${shown(path)}:${lineOf(text, literal.index)}`
    if (isTest(path)) {
      report('WARN', `${where} holds a literal whsec_ value in a test: fine only if it is a made-up one, never an endpoint's`)
    } else {
      leaks += 1
      report('FAIL', `${where} holds a literal signing secret: read it from the environment and treat the secret as leaked`)
    }
  }
  for (const match of text.matchAll(PUBLIC_NAME)) {
    if (/WEBHOOK/.test(match[0]) && /SECRET/.test(match[0])) {
      leaks += 1
      report('FAIL', `${shown(path)}:${lineOf(text, match.index)} reads ${match[0]}: that prefix ships the value to the browser`)
      break
    }
  }
  const client = /^\s*["']use client["']/m.test(text) || /from\s+["']@mesub\/react["']/.test(text)
  const reads = text.indexOf(SECRET_NAME)
  if (client && reads !== -1) {
    leaks += 1
    report('FAIL', `${shown(path)}:${lineOf(text, reads)} is client code that names ${SECRET_NAME}: it stays on the server`)
  }
  const clean = code(text)
  const logged = clean.match(/\b(console|logger|log)\.\w+\([^;\n]*(MESUB_WEBHOOK_SECRET|webhookSecret|webhook-signature)/)
  if (logged) {
    leaks += 1
    report('FAIL', `${shown(path)}:${lineOf(clean, logged.index)} writes the signing secret or a signature to a log`)
  }
}
if (leaks === 0) report('PASS', 'no signing secret in source files, in a log or under a browser prefix')

// --- The handler ---
const VERIFY = /\bverifyWebhook\s*\(|\.webhooks\s*\.\s*verify\s*\(/g
const handlers = sources.filter(({ path, text }) => !isTest(path) && code(text).search(VERIFY) !== -1)
const allCode = sources.filter(({ path }) => !isTest(path)).map(({ text }) => code(text)).join('\n')

if (handlers.length === 0) {
  report('FAIL', 'no handler verifies a delivery: nothing calls verifyWebhook( or mesub.webhooks.verify(')
}

/** The text between a call's opening parenthesis and its matching close. */
function argsOf(text, open) {
  let depth = 0
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === '(') depth += 1
    else if (text[index] === ')' && (depth -= 1) === 0) return text.slice(open + 1, index)
  }
  return text.slice(open + 1, open + 200)
}

for (const { path, text } of handlers) {
  const clean = code(text)
  const file = shown(path)
  const calls = [...clean.matchAll(VERIFY)]
  const first = calls[0]
  const where = `${file}:${lineOf(clean, first.index)}`
  report('PASS', `a delivery is verified (${where})`)

  // The raw body.
  let rawProblem = false
  for (const call of calls) {
    const body = argsOf(clean, call.index + call[0].length - 1).split(',')[0].trim()
    const at = `${file}:${lineOf(clean, call.index)}`
    if (/JSON\.stringify\s*\(/.test(body)) {
      rawProblem = true
      report('FAIL', `${at} verifies a body written again with JSON.stringify: the signature is over the bytes as sent`)
    } else if (/\.json\s*\(\s*\)/.test(body)) {
      rawProblem = true
      report('FAIL', `${at} verifies a parsed body: read it with request.text()`)
    } else if (/^\w+\.body$/.test(body)) {
      const raw = /\b(express|bodyParser)\s*\.\s*raw\s*\(|\braw\s*\(\s*\{/.test(clean) || /\b(express|bodyParser)\s*\.\s*raw\s*\(/.test(allCode)
      if (!raw) {
        rawProblem = true
        report('FAIL', `${at} verifies ${body}, and nothing reads it raw: put express.raw({ type: 'application/json' }) on this route`)
      } else if (/\.use\(\s*(express|bodyParser)\s*\.\s*json\s*\(/.test(allCode)) {
        report('WARN', `${at} verifies ${body} and the app also has a global JSON parser: the webhook route must be registered before it`)
      }
    } else if (/\brawBody\b/.test(body) && !/rawBody\s*:\s*true/.test(allCode)) {
      rawProblem = true
      report('FAIL', `${at} verifies rawBody, and nothing turns it on: NestFactory.create(AppModule, { rawBody: true })`)
    }
  }
  const early = clean.slice(0, first.index).match(/\b(request|req)\s*\.\s*json\s*\(\s*\)/)
  if (early) {
    rawProblem = true
    report('FAIL', `${file}:${lineOf(clean, early.index)} reads the body as JSON before it is verified: a body can be read once, and only the verified event is trusted`)
  }
  if (!rawProblem) report('PASS', `${file} hands the body to the check as received (a reading of the code)`)

  // The answer to a delivery that is not Mesub's.
  if (/invalid_webhook|MesubError/.test(clean) && /\b400\b|BadRequestException/.test(clean)) {
    report('PASS', `${file} answers 400 to a delivery that fails the check`)
  } else {
    report('WARN', `${file} does not seem to answer 400 when the check throws a MesubError: an unsigned call would read as a server fault`)
  }
  if (/catch\s*(\([^)]*\))?\s*\{\s*\}/.test(clean)) {
    report('WARN', `${file} has an empty catch: a delivery that fails the check must never be handled as if it had passed`)
  }

  // Deduplication, in this file or in one it hands the event to.
  if (/\b\w+\.id\b/.test(clean.slice(first.index)) || /\bevent\.id\b|webhook-id/.test(allCode)) {
    report('PASS', `the event id is read (deduplicate on it with one atomic write)`)
  } else {
    report('WARN', `${file} never reads event.id: the same event can arrive more than once and would be handled twice`)
  }
}

// A switch on the type keeps a default branch.
for (const { path, text } of sources) {
  if (isTest(path)) continue
  const clean = code(text)
  for (const match of clean.matchAll(/switch\s*\(\s*[\w.]*\btype\s*\)\s*\{/g)) {
    if (!/['"`]subscription\.\w+['"`]/.test(clean.slice(match.index, match.index + 4000))) continue
    const rest = clean.slice(match.index, match.index + 6000)
    if (!/\bdefault\s*:/.test(rest)) {
      report('WARN', `${shown(path)}:${lineOf(clean, match.index)} switches on the event type with no default branch: Mesub may add a type`)
    }
  }
}

if (files.length >= MAX_FILES) report('WARN', `stopped reading at ${MAX_FILES} files: run this from the app's own folder for a full check`)

for (const { level, message } of results) process.stdout.write(`${level.padEnd(4)}  ${message}\n`)
const count = (level) => results.filter((result) => result.level === level).length
process.stdout.write(`\n${count('PASS')} passed, ${count('FAIL')} failed, ${count('WARN')} to look at, ${count('SKIP')} skipped\n`)
process.exit(count('FAIL') > 0 ? 1 : 0)
