import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { loadCatalog, skillById } from '../scripts/lib/catalog.mjs'
import { validateKit } from '../scripts/lib/validate.mjs'
import { newSkill } from '../scripts/new-skill.mjs'
import { makeKit, write } from './helpers/kit.mjs'

test('a new skill breaks no rule of the mould: only its TODOs are left', () => {
  const root = makeKit()
  newSkill(root, ['mesub-gamma', '--title', 'Gamma'])
  const rules = new Set(validateKit(root).findings.map((finding) => finding.rule))
  assert.deepEqual([...rules].sort(), ['skill-md/placeholder'])
})

test('it moves the planned entry to experimental 0.1.0 and keeps the catalog comments', () => {
  const root = makeKit()
  write(root, 'catalog.yaml', `# A comment to keep.\n${readFileSync(join(root, 'catalog.yaml'), 'utf8')}`)
  newSkill(root, ['mesub-gamma', '--title', 'Gamma'])
  const entry = skillById(loadCatalog(root), 'mesub-gamma')
  assert.equal(entry.status, 'experimental')
  assert.equal(entry.version, '0.1.0')
  assert.match(readFileSync(join(root, 'catalog.yaml'), 'utf8'), /^# A comment to keep\./)
  assert.match(readFileSync(join(root, 'README.md'), 'utf8'), /3 of 3 skills are installable/)
})

test('the skill that carries the directory gets it at once', () => {
  const root = makeKit({
    before: (dir) => write(dir, 'catalog.yaml', readFileSync(join(dir, 'catalog.yaml'), 'utf8').replace('directory: mesub-alpha', 'directory: mesub-gamma')),
  })
  newSkill(root, ['mesub-gamma', '--title', 'Gamma'])
  assert.match(readFileSync(join(root, 'skills/mesub-gamma/references/kit-directory.md'), 'utf8'), /# Kit directory/)
})

test('an id the catalog does not list needs its group, territory and docs', () => {
  const root = makeKit()
  assert.throws(() => newSkill(root, ['mesub-delta', '--title', 'Delta']), /--group, --description and --docs/)
  newSkill(root, ['mesub-delta', '--title', 'Delta', '--group', 'one', '--description', 'Does delta.', '--docs', '/docs/delta'])
  assert.equal(skillById(loadCatalog(root), 'mesub-delta').status, 'experimental')
})

test('it refuses a shipped skill, a bad id and a missing title', () => {
  const root = makeKit()
  assert.throws(() => newSkill(root, ['mesub-alpha', '--title', 'Alpha']), /already exists/)
  assert.throws(() => newSkill(root, ['gamma', '--title', 'Gamma']), /usage/)
  assert.throws(() => newSkill(root, ['mesub-gamma']), /usage/)
})
