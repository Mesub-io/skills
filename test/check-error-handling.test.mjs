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
