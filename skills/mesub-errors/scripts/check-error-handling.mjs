#!/usr/bin/env node
// Usage: node "<skill-dir>/scripts/check-error-handling.mjs" [--help]
//
// Reads the project in the current directory and reports the ways its handling
// of Mesub's errors is silently broken: a code that can never match, a reason
// spelt the way another field spells it or an older Mesub spelt it, a branch on
// a message or on the sentence of a `reason`, a wait counted in the wrong unit,
// a loop or a helper that retries a Mesub call (on `retryable` or on any error),
// an access check whose error becomes "no".
// Run it from the project root.
//
// It only reads the files that import @mesub/node or @mesub/react, that ask
// Mesub through the app's own client (hasAccess, retryable, MesubError), or that
// define a helper a Mesub call is handed to (`withRetry(() => mesub...)`). No write, no
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
  'invalid_request', 'unsupported_version', 'missing_api_key', 'invalid_api_key', 'forbidden',
  'not_found', 'conflict', 'payload_too_large', 'rate_limited', 'internal_error', 'unavailable',
  'network_unavailable',
  'plan_not_found', 'plan_not_on_chain', 'plan_sunset', 'plan_ended', 'plan_removed', 'plan_replaced',
  'plan_mismatch', 'receiver_account_missing', 'receiver_account_frozen', 'mint_not_on_chain',
  'already_subscribed', 'insufficient_balance', 'seat_cap_reached', 'pending_cap_reached',
  'wallet_mismatch', 'payment_pending', 'subscription_cancelled', 'subscription_stopped',
  'subscription_terms_changed', 'comeback_in_flight', 'comeback_landed', 'comeback_period_rolling',
  'terms_missing', 'terms_expired', 'invalid_terms_signature', 'terms_used', 'terms_changed',
  'not_our_transaction', 'transaction_not_built', 'transaction_expired', 'transaction_refused',
  'not_awaiting_signature', 'subscription_changed',
  'subscription_not_found', 'subscription_not_active', 'subscription_not_cancelled',
  'subscription_ended', 'close_too_early', 'subscription_not_on_chain', 'nothing_to_confirm',
  'retry_deadline_passed', 'retry_too_soon', 'retries_spent', 'retry_cannot_succeed',
  'subscription_not_late', 'subscription_paused', 'pull_running', 'event_not_found',
  'end_date_too_soon', 'end_date_too_far', 'end_date_stale',
])
// Two codes renamed before the first integrator: Mesub no longer answers the old names.
const RENAMED_CODES = { plan_deleted: 'plan_removed', plan_rebuilt: 'plan_replaced' }
const LATE_REASONS = new Set(['insufficient_balance', 'approval_revoked', 'authority_closed'])
const END_REASONS = new Set([
  'cancelled', 'plan_removed', 'plan_replaced', 'plan_ended', 'closed_elsewhere', 'closed',
])
// An end_reason renamed: the subscription account closed outside Mesub was `authority_closed`.
const RENAMED_END_REASONS = { authority_closed: 'closed_elsewhere' }
const STOP_REASONS = new Set(['out_of_retries', 'retry_deadline_passed', 'authority_closed'])
const OUTCOMES = new Set(['paid', 'skipped', 'rejected', 'blocked'])
// An attempt's reasons, in snake case, and the three a guard gives for a refusal.
const REASONS = new Set([
  'insufficient_balance', 'token_account_reassigned', 'token_account_frozen', 'authority_closed',
  'cancelled', 'closed_elsewhere', 'plan_removed', 'plan_replaced', 'plan_ended',
  'receiver_not_allowed', 'receiver_account_missing', 'receiver_account_frozen', 'puller_not_allowed',
  'period_already_paid', 'period_missed', 'terms_missing', 'puller_missing', 'mint_gone',
  'gone_unconfirmed', 'send_unconfirmed', 'landing_unknown', 'transport', 'retry_deadline_passed',
  'unauthenticated', 'no_access', 'unavailable',
])
// An attempt's reasons as Mesub named them before it gave each fact one word.
const RENAMED_REASONS = {
  plan_gone: 'plan_removed', delegation_gone: 'closed_elsewhere', subscription_cancelled: 'cancelled',
  grace_ended: 'retry_deadline_passed',
}
// The reason_code of a submit or a confirm: an open family, these known today.
const REASON_CODES = new Set([
  'not_our_transaction', 'transaction_failed', 'transaction_expired', 'nothing_landed',
  'subscription_not_on_chain', 'subscription_mismatch', 'dev_not_running',
  'earlier_subscription_running', 'subscription_remade', 'cancellation_not_landed',
  'resume_not_landed', 'close_not_landed', 'subscription_changed', 'subscription_not_cancelled',
  'cancelled_subscription_remade', 'resume_unverified',
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
// A helper that imports the app's own client, not the package, still asks Mesub.
const ASKS_MESUB = /\.\s*(hasAccess|accessList)\s*\(|\bmesub\w*\s*\.\s*access\s*\(|\bretryable\b|\bMesubError\b/i
const FIELDS = 'apiCode|code|late_reason|end_reason|stop_reason|outcome|reason_code|reason|status'
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

const snake = (value) => value.replace(/-/g, '_')
// An attempt's reason as Mesub serves it now: `insufficient-balance` and `program:4` were the old ones.
const served = (value) => value.replace(/[-:]/g, '_')

/** One literal a field is compared with: is it one that field can hold? */
function judge(field, value, file, line, raw) {
  if (value === '') return
  if (field === 'apiCode') {
    if (API_CODES.has(value)) return
    if (Object.hasOwn(RENAMED_CODES, value)) {
      find('WARN', 'codes', file, line, `apiCode '${value}' was renamed '${RENAMED_CODES[value]}' and Mesub no longer answers it: compare with '${RENAMED_CODES[value]}'`)
      return
    }
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
    const renamed = RENAMED_END_REASONS[snake(value)]
    const hint = renamed
      ? `: a subscription account closed outside Mesub ends with '${renamed}' now (authority_closed is a late_reason and a stop_reason)`
      : END_REASONS.has(snake(value)) ? `: it is spelt '${snake(value)}', with underscores` : ''
    find('FAIL', 'reasons', file, line, `end_reason is never '${value}'${hint}`)
  } else if (field === 'stop_reason') {
    if (STOP_REASONS.has(value)) return
    const now = RENAMED_REASONS[snake(value)] ?? snake(value)
    const hint = STOP_REASONS.has(now) ? `: it is spelt '${now}'` : ': it is out_of_retries, retry_deadline_passed or authority_closed'
    find('FAIL', 'reasons', file, line, `stop_reason is never '${value}'${hint}`)
  } else if (field === 'reason_code') {
    if (REASON_CODES.has(value)) return
    if (REASON_CODES.has(snake(value))) {
      find('FAIL', 'reasons', file, line, `reason_code is never '${value}': it is spelt '${snake(value)}', with underscores`)
    } else {
      find('WARN', 'reasons', file, line, `reason_code is compared with '${value}', which is no code this skill knows: a typo never matches, a newer code needs the installed package's word`)
    }
  } else if (field === 'outcome') {
    if (OUTCOMES.has(value)) return
    find('WARN', 'reasons', file, line, `outcome is compared with '${value}': an attempt's outcome is paid, skipped, rejected or blocked`)
  } else if (field === 'reason') {
    if (REASONS.has(value) || /^(program|solana)_\d+$/.test(value)) return
    if (/\s/.test(value)) {
      find('WARN', 'reasons', file, line, 'reason is compared with a sentence: the reason of a submit or a confirm is reworded, branch on its reason_code and read the subscription')
    } else if (REASON_CODES.has(snake(value))) {
      find('WARN', 'reasons', file, line, `'${snake(value)}' is a reason_code: the reason of a submit or a confirm is a sentence, compare reason_code`)
    } else if (Object.hasOwn(RENAMED_REASONS, served(value))) {
      find('WARN', 'reasons', file, line, `an attempt's reason reads '${RENAMED_REASONS[served(value)]}' now, not '${value}' (the word an older Mesub used): compare with both while old rows may be read`)
    } else if (value !== served(value) && (REASONS.has(served(value)) || /^(program|solana)_\d+$/.test(served(value)))) {
      find('WARN', 'reasons', file, line, `an attempt's reason is spelt '${served(value)}' now, not '${value}' (an older Mesub's spelling): compare after turning - and : into _`)
    }
  } else if (field === 'status' && value === 'canceled') {
    find('WARN', 'reasons', file, line, "status is never 'canceled': Mesub spells it 'cancelled'")
  }
}

/** The text with its comments blanked, same length and same lines. */
function withoutComments(text) {
  const blank = (match) => match.replace(/[^\n]/g, ' ')
  return text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (match, lead) => lead + blank(match.slice(lead.length)))
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length

/** The index just past the block that opens at `open` (a `{`), or the end of the text. */
function blockEnd(text, open) {
  let depth = 0
  for (let index = open; index < text.length; index++) {
    if (text[index] === '{') depth += 1
    else if (text[index] === '}' && (depth -= 1) === 0) return index + 1
  }
  return text.length
}

// A call to Mesub: the client's methods, or `mesub.<anything>`.
const MESUB_CALL = /\.\s*(hasAccess|accessList)\s*\(|\bmesub\w*\s*\.\s*\w+/i
// Calls that wait or fetch, never the call a retry helper was handed.
const NOT_A_TASK = new Set(['setTimeout', 'sleep', 'delay', 'wait', 'fetch', 'resolve', 'reject', 'Promise', 'Error', 'String', 'Number', 'Boolean', 'console', 'if', 'for', 'while', 'switch', 'catch', 'return'])
const DENIES = /\breturn\s+(false|null|undefined)\b|\breturn\s*(;|\}|$)|=\s*false\b/m
const DISCRIMINATES = /\bretryable\b|\.\s*(code|apiCode|status|statusCode|name)\b|\binstanceof\b/
const RETRYABLE = /\bretryable\b/

/** The `catch` blocks of a piece of code: the text of each block. */
function catchBlocks(text) {
  const found = []
  for (const match of text.matchAll(/\bcatch\s*(\([^)]*\))?\s*\{/g)) {
    const open = match.index + match[0].length - 1
    found.push(text.slice(open, blockEnd(text, open)))
  }
  return found
}

/** A catch block with its conditional statements taken out: what it always does. */
function unconditional(block) {
  let rest = block.slice(1, -1)
  for (let index = rest.search(/\bif\s*\(/); index !== -1; index = rest.search(/\bif\s*\(/)) {
    let depth = 0
    let close = rest.indexOf('(', index)
    for (; close < rest.length; close++) {
      if (rest[close] === '(') depth += 1
      else if (rest[close] === ')' && (depth -= 1) === 0) break
    }
    const after = rest.slice(close + 1)
    const lead = after.match(/^\s*/)[0].length
    let stop
    if (after[lead] === '{') stop = close + 1 + blockEnd(after, lead)
    else stop = close + 1 + (after.slice(lead).search(/[;\n}]/) + lead + 1 || after.length)
    let tail = rest.slice(stop)
    const otherwise = tail.match(/^\s*else\b\s*/)
    if (otherwise) {
      const more = tail.slice(otherwise[0].length)
      const end = more[0] === '{' ? blockEnd(more, 0) : more.search(/[;\n}]/) + 1 || more.length
      tail = tail.slice(otherwise[0].length + end)
    }
    rest = rest.slice(0, index) + tail
  }
  return rest
}

/** The parameter names of the function that encloses `index`, as far as text tells. */
function parametersAround(text, index) {
  const before = text.slice(Math.max(0, index - 800), index)
  const heads = [...before.matchAll(/\bfunction\b[^(]*\(([^)]*)\)|\(([^()]*)\)\s*(?::\s*[^=;{]+)?=>/g)]
  const head = heads.at(-1)
  if (!head) return new Set()
  const list = head[1] ?? head[2] ?? ''
  return new Set(list.split(',').map((part) => part.trim().match(/^[.\s]*([A-Za-z_$][\w$]*)/)?.[1]).filter(Boolean))
}

/** Does this try, or the loop around it, call Mesub or the task a helper was handed? */
function callsTheTask(code, params, wrapper) {
  if (MESUB_CALL.test(code)) return true
  for (const call of code.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
    if (NOT_A_TASK.has(call[1])) continue
    if (params.has(call[1]) || wrapper) return true
  }
  return false
}

/**
 * Judges how a retry handles a failed call: `catches` are its catch blocks.
 * Returns true when it said something.
 */
function judgeRetry(file, line, catches, what) {
  for (const block of catches) {
    const always = unconditional(block)
    if (DENIES.test(block)) {
      find('FAIL', 'loop', file, line, `${what} whose catch answers false or null: a failed call then reads as "not subscribed" and hides a broken key or slug. Let it throw; the SDK already retried what is safe and serves its last answer in an outage`)
      return true
    }
    if (/\b(throw|return)\b/.test(always)) continue
    if (!DISCRIMINATES.test(block)) {
      find('FAIL', 'loop', file, line, `${what} that sends every error again: a refused key, a bad request or a wrong slug is retried for nothing, and a write sent again is a second write. Let it throw, and branch on apiCode`)
      return true
    }
    if (RETRYABLE.test(block)) {
      find('WARN', 'loop', file, line, 'a loop on retryable: the SDK already retried what is safe to retry, and a write sent again is a second write. Show the wait (retryAfter) instead')
      return true
    }
  }
  return false
}

/** The loops and helpers that retry Mesub calls, and the access checks whose error becomes "no". */
function judgeFlow(file, text, wrappers = new Set()) {
  // A loop: its head (the condition) and its body, or a do's body and its while.
  for (const match of text.matchAll(/\b(for|while)\s*\(|\bdo\s*\{/g)) {
    let head = ''
    let bodyStart
    if (match[1]) {
      let depth = 0
      let close = match.index + match[0].length - 1
      for (; close < text.length; close++) {
        if (text[close] === '(') depth += 1
        else if (text[close] === ')' && (depth -= 1) === 0) break
      }
      head = text.slice(match.index, close + 1)
      // `} while (x)` closing a do: judged with its do.
      if (match[1] === 'while' && /\}\s*$/.test(text.slice(Math.max(0, match.index - 20), match.index))) continue
      const rest = text.slice(close + 1).match(/^\s*\{/)
      if (!rest) {
        if (/\bretryable\b/.test(head)) find('WARN', 'loop', file, lineOf(text, match.index), 'a loop on retryable: the SDK already retried what is safe to retry, and a write sent again is a second write. Show the wait (retryAfter) instead')
        continue
      }
      bodyStart = close + 1 + rest[0].length - 1
    } else {
      bodyStart = match.index + match[0].length - 1
    }
    const end = blockEnd(text, bodyStart)
    let body = text.slice(bodyStart, end)
    if (!match[1]) body += (text.slice(end).match(/^\s*while\s*\([^)]*\)/) ?? [''])[0]
    // A for...of walks a list: only its head counts.
    const walksList = /^for\s*\(\s*(const|let|var)?\s*[\w{}\[\],\s]+\s+(of|in)\s/.test(head)
    const line = lineOf(text, match.index)
    if (!walksList) {
      const params = parametersAround(text, match.index)
      const inWrapper = [...wrappers].some((name) => new RegExp(`\\b${name}\\b`).test(text.slice(Math.max(0, match.index - 800), match.index)))
      if (/\btry\s*\{/.test(body) && callsTheTask(body, params, inWrapper) && judgeRetry(file, line, catchBlocks(body), 'a loop around a Mesub call')) continue
    }
    if (/\bretryable\b/.test(head) || (!walksList && /\bretryable\b/.test(body))) {
      find('WARN', 'loop', file, line, 'a loop on retryable: the SDK already retried what is safe to retry, and a write sent again is a second write. Show the wait (retryAfter) instead')
    }
  }

  // A helper that calls itself again from its catch: a loop written as recursion.
  for (const match of text.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)[^(]*\(|\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b[^(]*)?\(/g)) {
    const name = match[1] ?? match[2]
    const open = text.indexOf('{', match.index + match[0].length)
    if (open === -1) continue
    const body = text.slice(open, blockEnd(text, open))
    const again = catchBlocks(body).filter((block) => new RegExp(`(?<![.\\w$])${name}\\s*\\(`).test(block))
    if (again.length === 0) continue
    // The call again is the retry: judged as if the catch went round a loop.
    const asLoop = again.map((block) => block.replace(new RegExp(`\\breturn\\s+(await\\s+)?${name}\\s*\\(`, 'g'), `${name}(`))
    const params = parametersAround(text, open + 1)
    if (callsTheTask(body.replace(new RegExp(`\\b${name}\\s*\\(`, 'g'), ''), params, wrappers.has(name))) {
      judgeRetry(file, lineOf(text, match.index), asLoop, `${name} calls itself again`)
    }
  }

  // An access check whose every error is answered "no".
  for (const match of text.matchAll(/\.\s*(hasAccess|accessList|access)\s*\(/g)) {
    if (match[1] === 'access' && !/\bmesub\w*\s*$/i.test(text.slice(Math.max(0, match.index - 24), match.index))) continue
    const line = lineOf(text, match.index)
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 600)
    const swallowed = after.match(/^[^;]*?\)\s*\.catch\s*\(\s*(?:async\s*)?\(?[^)]*\)?\s*=>\s*\(?\s*(false|null|undefined)\b/)
    if (swallowed) {
      find('FAIL', 'fallback', file, line, `every error of ${match[1]} becomes "${swallowed[1]}": a refused key or a wrong slug would lock every subscriber out, silently. Let it throw; the client already serves its last answer in an outage`)
      continue
    }
    const before = text.slice(Math.max(0, match.index - 600), match.index)
    const opened = [...before.matchAll(/\btry\s*\{/g)].at(-1)
    if (opened === undefined || /\bcatch\b/.test(before.slice(opened.index))) continue
    const block = catchBlocks(after)[0]
    if (!block || !DENIES.test(block)) continue
    // A "no" only under a condition may be judging the error: open it. One that answers "no" to the rest fails.
    if (!DENIES.test(unconditional(block))) {
      find('WARN', 'fallback', file, line, `${match[1]} sits in a try whose catch answers "no" to some errors: if one is an outage or a refused key, every subscriber is locked out. Rethrow what is not Mesub saying no; the client already serves its last answer in an outage`)
    } else {
      find('FAIL', 'fallback', file, line, `${match[1]} sits in a try whose catch answers "no" to every error: a refused key or a wrong slug would lock every subscriber out, silently. Let it throw; the client already serves its last answer in an outage`)
    }
  }
}

/** Names of helpers handed a Mesub call: `withRetry(() => mesub.hasAccess(...))`. */
function wrappersIn(text) {
  const names = new Set()
  for (const match of text.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g)) {
    const rest = text.slice(match.index + match[0].length, match.index + match[0].length + 300)
    const call = rest.match(/^\s*\{?[^;]*?(\.\s*(hasAccess|accessList)\s*\(|\bmesub\w*\s*\.\s*\w+)/i)
    if (call && !NOT_A_TASK.has(match[1])) names.add(match[1])
  }
  return names
}

const files = walk(root)
let read_ = 0

// First the helpers a Mesub call is handed to, wherever they are defined.
const texts = new Map()
const wrappers = new Set()
for (const file of files) {
  const text = read(file)
  if (text === null) continue
  texts.set(file, text)
  if (USES_MESUB.test(text) || ASKS_MESUB.test(text)) for (const name of wrappersIn(withoutComments(text))) wrappers.add(name)
}
const DEFINES = (name) => new RegExp(`\\bfunction\\s+${name}\\b|\\b(?:const|let|var)\\s+${name}\\s*=`)

for (const file of files) {
  const text = texts.get(file)
  if (text === undefined) continue
  const mesubFile = USES_MESUB.test(text) || ASKS_MESUB.test(text)
  const defined = new Set([...wrappers].filter((name) => DEFINES(name).test(text)))
  if (!mesubFile && defined.size === 0) continue
  read_++
  judgeFlow(file, withoutComments(text), defined)
  if (!mesubFile) continue

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
  ['reasons', 'every outcome, reason, reason_code, late_reason, stop_reason and end_reason is spelt as Mesub serves it'],
  ['message', 'no branch on an error message'],
  ['wait', 'retryAfter is read in milliseconds'],
  ['loop', 'nothing loops on a retryable error'],
  ['fallback', 'no access check turns an error into "no"'],
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
