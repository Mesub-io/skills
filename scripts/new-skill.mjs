#!/usr/bin/env node
// Usage: node scripts/new-skill.mjs <skill-id> --title "Title" [--group <id> --description "..." --docs /docs/page]
// Writes skills/<skill-id>/ from the mould and marks the skill experimental 0.1.0 in
// catalog.yaml. --group, --description and --docs are for an id the catalog does not list yet.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { parseDocument } from 'yaml'
import { SKILL_ID, loadCatalog, validateCatalog } from './lib/catalog.mjs'
import { renderers } from './lib/distributions/index.mjs'
import { skeleton } from './lib/mould.mjs'
import { writeAll } from './lib/render.mjs'

/** @param {string} root @param {string[]} argv */
export function newSkill(root, argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { title: { type: 'string' }, group: { type: 'string' }, description: { type: 'string' }, docs: { type: 'string' } },
  })
  const id = positionals[0]
  if (!id || !SKILL_ID.test(id) || !values.title) throw new Error('usage: new-skill <skill-id> --title "Title" (the id starts with mesub-)')
  if (existsSync(join(root, 'skills', id))) throw new Error(`skills/${id} already exists`)

  // The Document keeps the catalog's comments and layout.
  const path = join(root, 'catalog.yaml')
  const document = parseDocument(readFileSync(path, 'utf8'))
  const skills = document.get('skills')
  let entry = skills.items.find((item) => item.get('id') === id)
  if (entry && entry.get('status') !== 'planned') throw new Error(`${id} is already ${entry.get('status')} in catalog.yaml`)
  if (!entry) {
    if (!values.group || !values.description || !values.docs) throw new Error(`${id} is not in catalog.yaml: give --group, --description and --docs`)
    entry = document.createNode({ id, group: values.group, status: 'planned', docs: values.docs, description: values.description })
    skills.add(entry)
  }
  entry.set('status', 'experimental')
  entry.set('version', '0.1.0')
  const catalog = document.toJS()
  const broken = validateCatalog(catalog, renderers)
  if (broken.length > 0) throw new Error(broken.map((finding) => finding.message).join('; '))

  const files = skeleton({
    id,
    title: values.title,
    description: entry.get('description'),
    license: catalog.license,
  })
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, 'skills', id, name)), { recursive: true })
    writeFileSync(join(root, 'skills', id, name), content)
  }
  writeFileSync(path, document.toString({ lineWidth: 0 }))
  writeAll(root, loadCatalog(root))
  return Object.keys(files).map((name) => `skills/${id}/${name}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
    for (const path of newSkill(root, process.argv.slice(2))) console.log(`wrote ${path}`)
    console.log('catalog.yaml and the rendered files are updated. Fill every TODO, then: pnpm validate')
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}
