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

test('every skill names its neighbours and carries the directory with the three answers', () => {
  const root = makeKit()
  const beta = readFileSync(join(root, 'skills/mesub-beta/SKILL.md'), 'utf8')
  assert.match(beta, /name its owner, from `references\/kit-directory\.md`/)
  // When the owner is missing: stop and say so, or keep its one rule.
  assert.match(beta, /install it only on the user's yes, else stop and say so/)
  assert.match(beta, /^- `mesub-alpha`: never do the alpha thing by hand\.$/m)
  // A planned skill is never named in a SKILL.md: only the directory lists it, as not available.
  assert.doesNotMatch(beta, /mesub-gamma/)
  const directory = readFileSync(join(root, 'skills/mesub-beta/references/kit-directory.md'), 'utf8')
  assert.match(directory, /## `mesub-alpha`/)
  assert.match(directory, /Territory: Does the alpha thing\./)
  assert.match(directory, /npx -y skills add Mesub-io\/skills --skill mesub-alpha/)
  assert.match(directory, /read https:\/\/docs\.mesub\.io\/docs\/alpha instead/)
  assert.match(directory, /Without it, its one rule still holds: never do the alpha thing by hand\./)
})
