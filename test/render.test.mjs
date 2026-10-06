import assert from 'node:assert/strict'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { loadCatalog } from '../scripts/lib/catalog.mjs'
import { staleFiles } from '../scripts/lib/render.mjs'
import { validateKit } from '../scripts/lib/validate.mjs'
import { edit, makeKit, render, write } from './helpers/kit.mjs'

const read = (root, path) => readFileSync(join(root, path), 'utf8')

test('rendering twice changes nothing', () => {
  const root = makeKit()
  assert.deepEqual(render(root).changed, [])
  assert.deepEqual(staleFiles(root, loadCatalog(root)).stale, [])
})

test('skills.sh.json groups the shipped skills only', () => {
  const index = JSON.parse(read(makeKit(), 'skills.sh.json'))
  assert.deepEqual(index.groupings, [{ title: 'Group one', description: 'The first group.', skills: ['mesub-alpha', 'mesub-beta'] }])
})

test('the README lists a planned skill as coming, never as a folder', () => {
  const readme = read(makeKit(), 'README.md')
  assert.match(readme, /2 of 3 skills are installable today/)
  assert.match(readme, /\| `mesub-gamma` \| Will do the gamma thing\. \| coming \(\[#3\]/)
  assert.doesNotMatch(readme, /skills\/mesub-gamma/)
  assert.match(readme, /\[`mesub-alpha`\]\(skills\/mesub-alpha\).*stable 1\.0\.0/)
})

test('the kit directory gives every skill, and no install command for a planned one', () => {
  const directory = read(makeKit(), 'skills/mesub-alpha/references/kit-directory.md')
  for (const id of ['mesub-alpha', 'mesub-beta', 'mesub-gamma']) assert.match(directory, new RegExp(`## \`${id}\``))
  assert.match(directory, /--skill mesub-beta/)
  assert.doesNotMatch(directory, /--skill mesub-gamma/)
  assert.match(directory, /`mesub-gamma` \(not available yet\)[\s\S]*https:\/\/docs\.mesub\.io\/docs\/gamma/)
})

test('a kit with no shipped skill is valid and claims nothing installable', () => {
  const planned = (root) => {
    const catalog = read(root, 'catalog.yaml')
      .replace('status: stable\n    version: 1.0.0', 'status: planned')
      .replace('status: experimental\n    version: 0.2.0', 'status: planned')
    write(root, 'catalog.yaml', catalog)
  }
  const root = makeKit({
    before: (dir) => {
      planned(dir)
      for (const path of ['skills', 'evals/mesub-alpha.md']) rmSync(join(dir, path), { recursive: true })
    },
  })
  assert.deepEqual(validateKit(root).findings, [])
  assert.equal(existsSync(join(root, 'skills.sh.json')), false)
  const readme = read(root, 'README.md')
  assert.match(readme, /No skill is installable yet/)
  assert.match(readme, /Nothing to install yet/)
  assert.doesNotMatch(readme, /\]\(skills\//)
})

test('a skills.sh.json left behind when nothing ships is drift', () => {
  const root = makeKit()
  const catalog = read(root, 'catalog.yaml')
    .replace('status: stable\n    version: 1.0.0', 'status: planned')
    .replace('status: experimental\n    version: 0.2.0', 'status: planned')
  write(root, 'catalog.yaml', catalog)
  const { stale } = staleFiles(root, loadCatalog(root))
  assert.ok(stale.some((file) => file.file === 'skills.sh.json' && file.message === 'must not exist'))
})

test('a licence set in the catalog reaches the README and every frontmatter', () => {
  const root = makeKit({
    before: (dir) => {
      edit(dir, 'catalog.yaml', 'schema: v1', 'schema: v1\nlicense: MIT')
      write(dir, 'LICENSE', 'MIT\n')
    },
  })
  assert.deepEqual(validateKit(root).findings, [])
  assert.match(read(root, 'README.md'), /### Licence\n\nMIT\. See \[LICENSE\]/)
  for (const id of ['mesub-alpha', 'mesub-beta']) assert.match(read(root, `skills/${id}/SKILL.md`), /\nlicense: MIT\n---\n/)
})
