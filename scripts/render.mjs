#!/usr/bin/env node
// Usage: node scripts/render.mjs [--check]
// Writes every file rendered from catalog.yaml. --check writes nothing and exits 1 on drift.
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadCatalog, validateCatalog } from './lib/catalog.mjs'
import { renderers } from './lib/distributions/index.mjs'
import { staleFiles, writeAll } from './lib/render.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const check = process.argv.includes('--check')
const catalog = loadCatalog(root)
const broken = validateCatalog(catalog, renderers)
if (broken.length > 0) {
  for (const finding of broken) console.error(`${finding.rule}  ${finding.file}: ${finding.message}`)
  process.exit(1)
}

if (check) {
  const { stale, problems } = staleFiles(root, catalog)
  for (const item of [...problems, ...stale]) console.error(`${item.file}: ${item.message}`)
  if (stale.length + problems.length > 0) process.exit(1)
  console.log('rendered files are up to date')
} else {
  const { changed, problems } = writeAll(root, catalog)
  for (const problem of problems) console.error(`${problem.file}: ${problem.message}`)
  for (const path of changed) console.log(`rendered ${path}`)
  if (changed.length === 0) console.log('nothing to render')
  if (problems.length > 0) process.exit(1)
}
