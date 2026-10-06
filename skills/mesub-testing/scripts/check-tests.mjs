#!/usr/bin/env node
// Usage: node "<skill-dir>/scripts/check-tests.mjs" [--help]
//
// Reads the project in the current directory and reports how its tests use
// Mesub: whether the fake of @mesub/node/testing is there, whether the SDK is
// mocked instead, whether the fake or a test door leaked into the code that
// ships, and which cases no test covers. Run it from the project root.
//
// It only reads files. No write, no install, no network, and it runs no test.
// It never shows the value of a key or of a signing secret: only the file and
// the line where it found one.
//
// Exit 0: no FAIL. Exit 1: at least one FAIL. Exit 2: arguments not understood.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const HELP = `Usage: node "<skill-dir>/scripts/check-tests.mjs" [--help]

Checks, from the project root, how the tests use Mesub.
Reads files only: no write, no install, no network, no test run, no key shown.

  --help          show this text

Each line is PASS, FAIL, WARN or SKIP. Exit 0 when nothing FAILs, 1 otherwise.`

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
const TEST_NAME = /[.-](test|spec|e2e)\.[cm]?[jt]sx?$/
const TEST_DIRS = new Set(['test', 'tests', '__tests__', '__mocks__', 'e2e', 'spec', 'specs'])
const SETUP_NAME = /^(?:(?:vitest|jest|playwright)\.(?:setup|config)|setup[.-]?tests?|tests?[.-]?setup)[\w.-]*\.[cm]?[jt]s$/i
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

/** A test, or a file only tests load: by its name, or by a folder on its path. */
function isTest(path) {
  const parts = shown(path).split('/')
  const name = parts.pop() ?? ''
  return TEST_NAME.test(name) || SETUP_NAME.test(name) || parts.some((part) => TEST_DIRS.has(part))
}

/** Every match of a pattern in a text, as 1-based line numbers. */
function linesOf(text, pattern) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`
  return [...text.matchAll(new RegExp(pattern.source, flags))].map(
    (match) => text.slice(0, match.index).split('\n').length,
  )
}

const files = walk(root)
if (!existsSync(join(root, 'package.json'))) {
  process.stderr.write('No package.json here. Run this from the project root.\n')
  process.exit(2)
}
const sources = files.filter((path) => SOURCE.test(path)).map((path) => ({ path, text: read(path), test: isTest(path) }))
const tests = sources.filter((source) => source.test)
const shipped = sources.filter((source) => !source.test)

// --- The package and its testing entry ---
const manifestPath = join(root, 'node_modules', '@mesub', 'node', 'package.json')
if (!existsSync(manifestPath)) {
  report('FAIL', '@mesub/node is not installed here (no node_modules/@mesub/node): the fake ships inside it, and nothing else may stand in for it')
} else {
  let manifest = {}
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch {
    // Reported below as an entry that is missing.
  }
  const version = manifest.version ?? 'unknown version'
  if (manifest.exports?.['./testing']) report('PASS', `@mesub/node ${version} is installed and has its testing entry`)
  else report('FAIL', `@mesub/node ${version} is installed but has no "./testing" entry: this version has no fake, tell the user`)
}

// --- Who imports the fake ---
const FAKE = /['"]@mesub\/node\/testing['"]/
const withFake = tests.filter(({ text }) => FAKE.test(text))
const leaked = shipped.filter(({ text }) => FAKE.test(text))
if (withFake.length > 0) report('PASS', `${withFake.length} test file(s) use the fake of @mesub/node/testing`)
else report('FAIL', 'no test file imports @mesub/node/testing: nothing tests the integration against the fake')
for (const { path, text } of leaked) {
  report('FAIL', `${shown(path)}:${linesOf(text, FAKE)[0]} imports @mesub/node/testing from code that ships: the fake grants whatever it is told`)
}

// --- The SDK mocked, or its methods stubbed ---
const MODULE_MOCK = /\b(?:vi|jest|vitest|mock)\.(?:mock|doMock|unstable_mockModule|module)\(\s*['"]@mesub\/(?:node|react)(?:\/[\w-]+)?['"]/
const STUB = /spyOn\(\s*[\w.]*(?:mesub|webhooks)[\w.]*\s*,\s*['"](?:hasAccess|access|accessList|verify)['"]|\b(?:hasAccess|verifyWebhook|requirePlan|withMesub|RequirePlan)\s*[:=]\s*(?:vi|jest)\.fn\(/i
let mocked = 0
for (const { path, text } of tests) {
  for (const line of linesOf(text, MODULE_MOCK)) {
    mocked += 1
    report('FAIL', `${shown(path)}:${line} mocks the SDK's module: the guard, the cache and the signature check no longer run, so the test proves nothing about them`)
  }
  for (const line of linesOf(text, STUB)) {
    mocked += 1
    report('WARN', `${shown(path)}:${line} stubs a function of the SDK: say what Mesub answers with the fake instead, and let the real function run`)
  }
}
if (mocked === 0 && withFake.length > 0) report('PASS', 'no test mocks the SDK or stubs one of its functions')

// --- A door for tests in the code that ships ---
const TEST_HEADER = /['"]x-test-[\w-]+['"]/i
const TEST_BRANCH = /NODE_ENV\s*[!=]==?\s*['"]test['"]|['"]test['"]\s*[!=]==?\s*process\.env\.NODE_ENV/
let doors = 0
for (const { path, text } of shipped) {
  const header = linesOf(text, TEST_HEADER)[0]
  if (header) {
    doors += 1
    report('FAIL', `${shown(path)}:${header} reads a test header in code that ships: whoever sends it is that user. A test says who is signed in by handing the app its own customer function`)
  }
  const branch = linesOf(text, TEST_BRANCH)[0]
  if (branch && /@mesub\/node|\bmesub\b/i.test(text)) {
    doors += 1
    report('WARN', `${shown(path)}:${branch} branches on NODE_ENV being "test" in a file that uses Mesub: check that the branch can never skip a guard or a signature in production`)
  }
}
if (doors === 0) report('PASS', 'no test header and no test branch in the Mesub code that ships')

// --- The real Mesub reached from a test, or a key written in one ---
const LITERAL_KEY = /\bSUB_[A-Za-z0-9]{8,}\b/
const LITERAL_SECRET = /\bwhsec_[A-Za-z0-9+/=]{16,}/
const envTests = files.filter((path) => /(^|[\\/])\.env\.test(\.[\w.-]+)?$/.test(path)).map((path) => ({ path, text: read(path) }))
let exposed = 0
for (const { path, text } of [...tests, ...envTests]) {
  const key = linesOf(text, LITERAL_KEY)[0]
  if (key) {
    exposed += 1
    report('FAIL', `${shown(path)}:${key} holds what looks like a real API key: a test uses the fake's own (fake.apiKey). If it is real, it must be rotated`)
  }
  const secret = linesOf(text, LITERAL_SECRET)[0]
  if (secret) {
    exposed += 1
    report('WARN', `${shown(path)}:${secret} holds a signing secret written out: a test signs with the fake's own (fake.webhookSecret). If it is an endpoint's, it must be rotated`)
  }
}
for (const { path, text } of tests) {
  const real = linesOf(text, /api\.mesub\.io/)[0]
  if (real && !FAKE.test(text)) {
    exposed += 1
    report('WARN', `${shown(path)}:${real} names the real Mesub API without the fake: a test must never reach it`)
  }
}
if (exposed === 0) report('PASS', 'no key, no signing secret and no call to the real Mesub in the tests')

// --- How the fake is used ---
if (withFake.length > 0) {
  const all = withFake.map(({ text }) => text).join('\n')

  for (const { path, text } of withFake) {
    const cases = linesOf(text, /^\s*(?:it|test)(?:\.\w+)*\(/m).length
    if (cases > 1 && !/\.reset\(\)/.test(text) && !/^\s+(?:const|let)\s+\w+\s*=\s*new FakeMesub\(/m.test(text)) {
      report('WARN', `${shown(path)} has ${cases} tests on one fake and never calls reset(): what one test grants, the next one still sees`)
    }
    const shared = linesOf(text, /^(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*\w+\.client\(/m)[0]
    if (shared && cases > 1 && /\.fail\(|revalidate_after/.test(text)) {
      report('WARN', `${shown(path)}:${shared} builds the client once for every test: it keeps its cache, which reset() does not empty, so an outage test may be served another test's answer. Build it in the per-test setup`)
    }
  }

  if (/\.grant\(/.test(all) && (/\.deny\(/.test(all) || /\b402\b/.test(all))) report('PASS', 'a test grants access and a test covers the refusal')
  else report('WARN', 'no test covers both a subscriber let through (grant) and a refusal (402): a guard that lets everybody in would pass')

  if (/\b401\b/.test(all)) report('PASS', 'a test covers a signed-out request (401)')
  else report('WARN', 'no test covers a signed-out request: it must answer 401, never 200')

  if (/\.fail\(/.test(all)) report('PASS', 'a test makes the fake fail (an outage or a refusal of Mesub)')
  else report('WARN', 'no test calls fail(): what the routes answer when Mesub is down is untested')

  const verifies = shipped.some(({ text }) => /webhooks\.verify\(|\bverifyWebhook\(/.test(text))
  const signs = /\.webhook\(|\bsignWebhook\(/.test(all)
  if (signs) report('PASS', 'a test sends a signed webhook')
  else if (verifies) report('WARN', 'the app verifies webhooks but no test sends a signed one: fake.webhook() builds it')
  else report('SKIP', 'no webhook handler found in the app, so no webhook test is expected')
  if (signs && verifies && !/\b400\b/.test(all)) {
    report('WARN', 'no webhook test expects a 400: send a changed body, so a handler that verifies nothing does not pass')
  }
}

if (files.length >= MAX_FILES) report('WARN', `stopped reading at ${MAX_FILES} files: run this from the app's own folder for a full check`)

for (const { level, message } of results) process.stdout.write(`${level.padEnd(4)}  ${message}\n`)
const count = (level) => results.filter((result) => result.level === level).length
process.stdout.write(`\n${count('PASS')} passed, ${count('FAIL')} failed, ${count('WARN')} to look at, ${count('SKIP')} skipped\n`)
process.exit(count('FAIL') > 0 ? 1 : 0)
