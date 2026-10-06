import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { validateKit } from '../scripts/lib/validate.mjs'

test('this repository is a valid kit', () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  assert.deepEqual(validateKit(root).findings, [])
})
