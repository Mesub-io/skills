import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { validateKit } from '../scripts/lib/validate.mjs'
import { makeKit } from './helpers/kit.mjs'

test('the good kit passes every rule', () => {
  const { findings } = validateKit(makeKit())
  assert.deepEqual(findings, [])
})

test('its rendered hand-off carries the three answers', () => {
  const root = makeKit()
  const beta = readFileSync(join(root, 'skills/mesub-beta/SKILL.md'), 'utf8')
  assert.match(beta, /### `mesub-alpha`/)
  assert.match(beta, /Territory: Does the alpha thing\./)
  assert.match(beta, /npx -y skills add Mesub-io\/skills --skill mesub-alpha/)
  assert.match(beta, /read https:\/\/docs\.mesub\.io\/docs\/alpha instead/)
})
