import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('../skills/mesub-errors/scripts/check-error-handling.mjs', import.meta.url))

/** Runs the check in a project holding one file that imports @mesub/node, with these lines. */
function check(...lines) {
  const root = mkdtempSync(join(tmpdir(), 'check-error-handling-'))
  try {
    writeFileSync(join(root, 'mesub.ts'), [`import { Mesub } from '@mesub/node'`, ...lines, ''].join('\n'))
    const ran = spawnSync('node', [SCRIPT], { cwd: root, encoding: 'utf8' })
    return { status: ran.status, out: ran.stdout }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const levels = (out) => out.split('\n').filter((line) => /^(FAIL|WARN) /.test(line))

test('the words Mesub serves today pass', () => {
  const { status, out } = check(
    `if (sub.end_reason === 'closed_elsewhere') close()`,
    `if (sub.end_reason === 'plan_removed' || sub.end_reason === 'plan_replaced') gone()`,
    `if (sub.stop_reason === 'authority_closed') closeNow()`,
    `if (sub.late_reason === 'authority_closed') cancel()`,
    `if (result.reason_code === 'transaction_expired') refresh()`,
    `if (error.apiCode === 'plan_removed' || error.apiCode === 'event_not_found') stop()`,
    `if (attempt.reason === 'closed_elsewhere') customer()`,
  )
  assert.equal(status, 0, out)
  assert.deepEqual(levels(out), [], out)
})

test('end_reason authority_closed fails and names closed_elsewhere', () => {
  const { status, out } = check(`if (sub.end_reason === 'authority_closed') close()`)
  assert.equal(status, 1)
  assert.match(out, /FAIL .*end_reason is never 'authority_closed'.*'closed_elsewhere'/)
})

test('a hyphenated reason still fails or warns', () => {
  const { status, out } = check(
    `if (sub.end_reason === 'plan-ended') x()`,
    `if (sub.end_reason === 'closed-elsewhere') x()`,
    `if (sub.stop_reason === 'out-of-retries') x()`,
    `if (attempt.reason === 'insufficient-balance') x()`,
  )
  assert.equal(status, 1)
  assert.match(out, /FAIL .*end_reason is never 'plan-ended': it is spelt 'plan_ended'/)
  assert.match(out, /FAIL .*end_reason is never 'closed-elsewhere': it is spelt 'closed_elsewhere'/)
  assert.match(out, /FAIL .*stop_reason is never 'out-of-retries': it is spelt 'out_of_retries'/)
  assert.match(out, /WARN .*spelt 'insufficient_balance' now, not 'insufficient-balance'/)
})

test('the old Free stop reason points at retry_deadline_passed', () => {
  const { out } = check(`if (sub.stop_reason === 'grace-ended') x()`, `if (detail.reason === 'grace-ended') y()`)
  assert.match(out, /FAIL .*stop_reason is never 'grace-ended': it is spelt 'retry_deadline_passed'/)
  assert.match(out, /WARN .*reads 'retry_deadline_passed' now, not 'grace-ended'/)
})

test('the renamed codes and attempt reasons warn', () => {
  const { status, out } = check(
    `if (error.apiCode === 'plan_deleted') x()`,
    `if (error.apiCode === 'plan_rebuilt') x()`,
    `if (attempt.reason === 'delegation_gone') x()`,
  )
  assert.equal(status, 0)
  assert.match(out, /WARN .*'plan_deleted' was renamed 'plan_removed'/)
  assert.match(out, /WARN .*'plan_rebuilt' was renamed 'plan_replaced'/)
  assert.match(out, /WARN .*reads 'closed_elsewhere' now, not 'delegation_gone'/)
})

test('a confirmation is read by its reason_code, never its reason', () => {
  const { out } = check(
    `if (result.reason === 'transaction_expired') x()`,
    `if (result.reason === 'The transaction expired before it landed.') x()`,
    `if (result.reason_code === 'transaction-expired') x()`,
    `if (result.reason_code === 'trasaction_expired') x()`,
  )
  assert.match(out, /WARN .*'transaction_expired' is a reason_code: .*compare reason_code/)
  assert.match(out, /WARN .*reason is compared with a sentence: .*reason_code/)
  assert.match(out, /FAIL .*reason_code is never 'transaction-expired': it is spelt 'transaction_expired'/)
  assert.match(out, /WARN .*reason_code is compared with 'trasaction_expired'/)
})

test('a switch on stop_reason is judged case by case', () => {
  const { out } = check(
    'switch (sub.stop_reason) {',
    `  case 'out_of_retries': break`,
    `  case 'grace_ended': break`,
    '}',
  )
  assert.match(out, /FAIL .*stop_reason is never 'grace_ended'/)
  assert.doesNotMatch(out, /'out_of_retries'/)
})

const LOOP = /WARN .*a loop on retryable/

test('a loop on retryable around an access check that falls back to false fails', () => {
  const { status, out } = check(
    `export async function hasPro(id) { for (;;) { try { return await mesub.hasAccess({ customer: { external_id: id }, plan: 'pro' }) } catch (error) { if (error instanceof MesubError && error.retryable) continue; return false } } }`,
  )
  assert.equal(status, 1, out)
  assert.match(out, /FAIL .*a loop around a Mesub call whose catch answers false or null/)
  assert.match(out, /FAIL .*hasAccess sits in a try whose catch answers "no" to every error/)
})

test('the try and catch to false alone fail', () => {
  const { status, out } = check(
    'export async function hasPro(id: string) {',
    '  try {',
    `    return await mesub.hasAccess({ customer: { external_id: id }, plan: 'pro' })`,
    '  } catch {',
    '    return false',
    '  }',
    '}',
  )
  assert.equal(status, 1, out)
  assert.match(out, /FAIL  mesub\.ts:4: hasAccess sits in a try whose catch answers "no" to every error/)
  assert.doesNotMatch(out, LOOP)
})

test('a catch that picks its errors before answering "no" only warns', () => {
  const { status, out } = check(
    `export async function hasPro(id) { try { return await mesub.hasAccess({ customer: { external_id: id }, plan: 'pro' }) } catch (error) { if (error.apiCode === 'plan_not_found') return false; throw error } }`,
  )
  assert.equal(status, 0, out)
  assert.match(out, /WARN .*hasAccess sits in a try whose catch answers "no" to some errors/)
})

test('a loop on retryable that rethrows the rest only warns', () => {
  const { status, out } = check(
    `export async function load(id) { while (true) { try { return await mesub.subscriptions.retrieve(id) } catch (error) { if (error.retryable) { await sleep(error.retryAfter); continue } throw error } } }`,
  )
  assert.equal(status, 0, out)
  assert.match(out, LOOP)
})

test('a helper that retries every error, in a file of its own, fails', () => {
  const root = mkdtempSync(join(tmpdir(), 'check-error-handling-'))
  try {
    writeFileSync(join(root, 'mesub.ts'), `import { Mesub } from '@mesub/node'\nimport { withRetry } from './retry'\nexport const mesub = new Mesub()\nexport const isPro = (id) => withRetry(() => mesub.hasAccess({ customer: { external_id: id }, plan: 'pro' }))\n`)
    writeFileSync(join(root, 'retry.ts'), [
      'export async function withRetry<T>(fn: () => Promise<T>, tries = 5): Promise<T | false> {',
      '  for (let attempt = 0; attempt < tries; attempt++) {',
      '    try {',
      '      return await fn()',
      '    } catch (error) {',
      '      console.error(error)',
      '      await new Promise((resolve) => setTimeout(resolve, 1000))',
      '    }',
      '  }',
      '  return false',
      '}',
      '',
    ].join('\n'))
    const ran = spawnSync('node', [SCRIPT], { cwd: root, encoding: 'utf8' })
    assert.equal(ran.status, 1, ran.stdout)
    assert.match(ran.stdout, /FAIL  retry\.ts:2: a loop around a Mesub call that sends every error again/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a helper that calls itself again from its catch fails', () => {
  const { status, out } = check(
    'export async function retryForever(task) {',
    '  try { return await task() } catch { await sleep(1000); return retryForever(task) }',
    '}',
  )
  assert.equal(status, 1, out)
  assert.match(out, /FAIL  mesub\.ts:2: retryForever calls itself again that sends every error again/)
})

test('a loop over pages with no retry, and a catch that rethrows, pass', () => {
  const { status, out } = check(
    'for (let page = 0; page < 3; page++) { try { await mesub.events.list({ limit: 100 }) } catch (error) { log(error); throw error } }',
    'while (queue.length) { try { await db.save(queue.shift()) } catch { continue } }',
  )
  assert.equal(status, 0, out)
  assert.match(out, /PASS  nothing loops on a retryable error/)
})

test('a catch to false on the promise fails', () => {
  const { status, out } = check(`const ok = await mesub.hasAccess({ customer, plan: 'pro' }).catch(() => false)`)
  assert.equal(status, 1)
  assert.match(out, /FAIL .*every error of hasAccess becomes "false"/)
})

test('a while and a do on retryable warn', () => {
  const { out } = check(
    'while (error?.retryable) { error = await attempt() }',
    'do { result = await attempt() } while (result.error?.retryable)',
  )
  assert.equal(out.split('\n').filter((line) => LOOP.test(line)).length, 2, out)
})

test('a loop not on retryable, and a for...of reading it, do not warn', () => {
  const { out } = check(
    'for (let page = 0; page < 3; page++) { await mesub.events.list({ limit: 100 }) }',
    'for (const failure of failures) { if (failure.retryable) later.push(failure) }',
    'try { return await mesub.hasAccess({ customer, plan }) } catch (error) { log(error); throw error }',
  )
  assert.doesNotMatch(out, LOOP)
  assert.match(out, /PASS  nothing loops on a retryable error/)
  assert.match(out, /PASS  no access check turns an error into "no"/)
})

test('a helper that uses the app client, not the package, is read', () => {
  const root = mkdtempSync(join(tmpdir(), 'check-error-handling-'))
  try {
    writeFileSync(join(root, 'mesub.ts'), `import { Mesub } from '@mesub/node'\nexport const mesub = new Mesub()\n`)
    writeFileSync(join(root, 'access.ts'), `import { mesub } from './mesub'\nexport async function ok(id) { try { return await mesub.hasAccess({ customer: { external_id: id }, plan: 'pro' }) } catch { return false } }\n`)
    const ran = spawnSync('node', [SCRIPT], { cwd: root, encoding: 'utf8' })
    assert.match(ran.stdout, /2 files importing a Mesub package read|2 files/)
    assert.match(ran.stdout, /FAIL  access\.ts:2: hasAccess sits in a try/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a helper with no loop whose catch answers false, handed an access check, fails', () => {
  const { status, out } = check(
    'export async function safeCall(fn) { try { return await fn() } catch (error) { console.error(error); return false } }',
    `export const isPro = (id) => safeCall(() => mesub.hasAccess({ external_id: id }, 'pro'))`,
  )
  assert.equal(status, 1, out)
  assert.match(out, /FAIL  mesub\.ts:2: safeCall is handed Mesub calls and its catch answers false or null/)
})
