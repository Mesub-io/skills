#!/usr/bin/env node
// Usage: node "<skill-dir>/scripts/check-error-handling.mjs" [--help]
//
// Reads the project in the current directory and reports the ways its handling
// of Mesub's errors is silently broken: a code that can never match, a reason
// spelt the way another field spells it, a branch on a message, a wait counted
// in the wrong unit. Run it from the project root.
//
// It only reads the files that import @mesub/node or @mesub/react. No write, no
// install, no network. It prints file names, line numbers and the names of
// codes, never the content of an env file nor the value of a key.
//
// It reads text, not types: every finding names a line to open and judge.
//
// Exit 0: no FAIL. Exit 1: at least one FAIL. Exit 2: arguments not understood.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const HELP = `Usage: node "<skill-dir>/scripts/check-error-handling.mjs" [--help]

Checks, from the project root, how the code handles Mesub's errors.
Reads files only: no write, no install, no network, no key value shown.

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

// The ten codes of a MesubError: what `error.code` can be.
const SDK_CODES = new Set([
  'invalid_request', 'unauthorized', 'forbidden', 'not_found', 'plan_not_found', 'conflict',
  'rate_limited', 'unavailable', 'invalid_webhook', 'unexpected',
])
// Mesub's own codes: what `error.apiCode` can be. See references/api-error-codes.md.
const API_CODES = new Set([
  'invalid_request', 'missing_api_key', 'invalid_api_key', 'forbidden', 'not_found', 'conflict',
  'payload_too_large', 'rate_limited', 'internal_error', 'unavailable', 'network_unavailable',
  'plan_not_found', 'plan_not_on_chain', 'plan_deleted', 'plan_sunset', 'plan_ended', 'plan_rebuilt',
  'plan_mismatch', 'receiver_account_missing', 'mint_not_on_chain',
  'already_subscribed', 'insufficient_balance', 'seat_cap_reached', 'pending_cap_reached',
  'wallet_mismatch', 'payment_pending', 'subscription_cancelled', 'subscription_stopped',
  'subscription_terms_changed', 'comeback_in_flight', 'comeback_landed', 'comeback_period_rolling',
  'terms_missing', 'terms_expired', 'invalid_terms_signature', 'terms_used', 'terms_changed',
  'not_our_transaction', 'transaction_not_built', 'transaction_expired', 'transaction_refused',
  'not_awaiting_signature', 'subscription_changed',
  'subscription_not_found', 'subscription_not_active', 'subscription_not_cancelled',
  'subscription_ended', 'close_too_early', 'subscription_not_on_chain', 'nothing_to_confirm',
  'retry_deadline_passed',
])
const LATE_REASONS = new Set(['insufficient_balance', 'approval_revoked', 'authority_closed'])
const END_REASONS = new Set([
  'cancelled', 'plan_removed', 'plan_replaced', 'plan_ended', 'authority_closed', 'closed',
])
const OUTCOMES = new Set(['paid', 'skipped', 'rejected', 'blocked'])
// An attempt's reasons, hyphenated, and the three a guard gives for a refusal.
const REASONS = new Set([
  'insufficient-balance', 'token-account-reassigned', 'subscription-cancelled', 'delegation-gone',
  'plan-gone', 'plan-replaced', 'plan-ended', 'receiver-not-allowed', 'receiver-account-missing',
  'puller-not-allowed', 'period-already-paid', 'period-missed', 'terms-missing', 'puller-missing',
  'mint-gone', 'gone-unconfirmed', 'send-unconfirmed', 'landing-unknown', 'transport',
  'unauthenticated', 'no_access', 'unavailable',
])

const root = process.cwd()
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.next', '.nuxt', '.turbo', '.vercel',
  '.output', '.cache', '.agents', 'vendor', 'tmp',
])
const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/
const MAX_FILES = 6000
const MAX_BYTES = 512 * 1024

const shown = (path) => relative(root, path).split(sep).join('/') || '.'

/** Every source file of the project, generated and installed folders left out. */
function walk(dir, found = []) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return found
  }
  for (const entry of entries) {
    if (found.length >= MAX_FILES) break
    if (entry.isSymbolicLink()) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) walk(path, found)
    } else if (SOURCE.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      found.push(path)
    }
  }
  return found
}

function read(path) {
  try {
    if (statSync(path).size > MAX_BYTES) return null
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

const USES_MESUB = /(from\s+|require\(\s*|import\(\s*)['"]@mesub\/(node|react)/
const FIELDS = 'apiCode|code|late_reason|end_reason|outcome|reason|status'
// `x.apiCode === 'literal'`, either way round.
const COMPARED = new RegExp(
  `(?:\\b(${FIELDS})\\s*(?:===|!==|==|!=)\\s*(['"\`])([^'"\`]*)\\2)|(?:(['"\`])([^'"\`]*)\\4\\s*(?:===|!==|==|!=)\\s*[\\w.?]*?\\b(${FIELDS})\\b(?!\\s*\\())`,
  'g',
)
const SWITCHED = new RegExp(`\\bswitch\\s*\\(.*\\b(${FIELDS})\\s*\\)`)
const CASE = /\bcase\s+(['"`])([^'"`]*)\1\s*:/g
const MESSAGE_BRANCH = /\.message\s*(?:===|!==|==|!=)\s*['"`]|\.message\??\.(?:includes|startsWith|endsWith|match|indexOf|search)\(|\.test\(\s*\w+\.message\s*\)/
const WAIT_UNIT = /\bretryAfter\s*\*\s*1_?000\b/

/** @type {{ level: string, check: string, message: string }[]} */
const findings = []
const find = (level, check, file, line, message) =>
  findings.push({ level, check, message: `${shown(file)}:${line}: ${message}` })

const kebab = (value) => value.replace(/_/g, '-')
const snake = (value) => value.replace(/-/g, '_')

/** One literal a field is compared with: is it one that field can hold? */
function judge(field, value, file, line, raw) {
  if (value === '') return
  if (field === 'apiCode') {
    if (API_CODES.has(value)) return
    find('WARN', 'codes', file, line, `apiCode is compared with '${value}', which is no code this skill knows: a typo never matches, a newer code needs the installed package's word`)
  } else if (field === 'code') {
    // `code` is every library's word: only Mesub's own codes are judged.
    if (SDK_CODES.has(value) || !API_CODES.has(value)) return
    if (/\.error\??\.code|\bbody\b|\bjson\b/i.test(raw)) return
    find('WARN', 'codes', file, line, `'${value}' is an apiCode. On a MesubError, code is the coarse one and never holds it: compare error.apiCode (a refusal body of the widget routes does carry it as error.code)`)
  } else if (field === 'late_reason') {
    if (LATE_REASONS.has(value)) return
    const hint = LATE_REASONS.has(snake(value)) ? `: it is spelt '${snake(value)}', with underscores` : ''
    find('FAIL', 'reasons', file, line, `late_reason is never '${value}'${hint}`)
  } else if (field === 'end_reason') {
    if (END_REASONS.has(value)) return
    const hint = END_REASONS.has(snake(value)) ? `: it is spelt '${snake(value)}', with underscores` : ''
    find('FAIL', 'reasons', file, line, `end_reason is never '${value}'${hint}`)
  } else if (field === 'outcome') {
    if (OUTCOMES.has(value)) return
    find('WARN', 'reasons', file, line, `outcome is compared with '${value}': an attempt's outcome is paid, skipped, rejected or blocked`)
  } else if (field === 'reason') {
    if (REASONS.has(value) || /^(program|solana):/.test(value)) return
    if (/\s/.test(value)) {
      find('WARN', 'reasons', file, line, 'reason is compared with a sentence: the reason of a submit or a confirm is reworded, test that it is set and read the subscription')
    } else if (REASONS.has(kebab(value)) && value !== kebab(value)) {
      find('WARN', 'reasons', file, line, `an attempt's reason is spelt '${kebab(value)}', with hyphens, not '${value}'`)
    }
  } else if (field === 'status' && value === 'canceled') {
    find('WARN', 'reasons', file, line, "status is never 'canceled': Mesub spells it 'cancelled'")
  }
}

const files = walk(root)
let read_ = 0

for (const file of files) {
  const text = read(file)
  if (text === null || !USES_MESUB.test(text)) continue
  read_++

  // The field a `switch` is on, for the `case` lines under it.
  let switched = null
  let since = 0

  text.split('\n').forEach((raw, index) => {
    const line = index + 1
    if (/^\s*(\/\/|\*|\/\*)/.test(raw)) return

    const opened = raw.match(SWITCHED)
    if (opened) {
      switched = opened[1]
      since = line
    } else if (/\bswitch\s*\(/.test(raw) || line - since > 80) {
      switched = null
    }

    for (const match of raw.matchAll(COMPARED)) {
      judge(match[1] ?? match[6], match[3] ?? match[5], file, line, raw)
    }
    if (switched) {
      for (const match of raw.matchAll(CASE)) judge(switched, match[2], file, line, raw)
    }
    if (MESSAGE_BRANCH.test(raw)) {
      find('WARN', 'message', file, line, 'a branch on an error message: Mesub may reword it any day. If this is a Mesub error, branch on apiCode')
    }
    if (WAIT_UNIT.test(raw)) {
      find('WARN', 'wait', file, line, 'retryAfter times 1000: on a MesubError it is already milliseconds')
    }
  })
}

const CHECKS = [
  ['codes', 'every code compared with code or apiCode is one that field can hold'],
  ['reasons', 'every outcome, reason, late_reason and end_reason is spelt as Mesub serves it'],
  ['message', 'no branch on an error message'],
  ['wait', 'retryAfter is read in milliseconds'],
]

const out = []
if (read_ === 0) {
  out.push('SKIP  no file here imports @mesub/node or @mesub/react: is this the project root?')
} else {
  out.push(`      ${read_} file${read_ === 1 ? '' : 's'} importing a Mesub package read`)
  for (const [check, title] of CHECKS) {
    const mine = findings.filter((finding) => finding.check === check)
    if (mine.length === 0) out.push(`PASS  ${title}`)
    for (const finding of mine) out.push(`${finding.level}  ${finding.message}`)
  }
}

const failed = findings.filter((finding) => finding.level === 'FAIL').length
const warned = findings.filter((finding) => finding.level === 'WARN').length
out.push('', `${failed} FAIL, ${warned} WARN. Text is read, not types: open each line before changing it.`)
process.stdout.write(`${out.join('\n')}\n`)
process.exit(failed > 0 ? 1 : 0)
