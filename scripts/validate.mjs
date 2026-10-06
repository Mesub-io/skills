#!/usr/bin/env node
// Usage: node scripts/validate.mjs [--base <git ref>] [--docs-site <path>]
// Checks the whole kit against catalog.yaml and the mould. Exits 1 on any finding.
// --base: the commit skill versions are compared with (default: origin/main).
// --docs-site: a clone of the docs repository, to check each skill's sources exist.
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { validateKit } from './lib/validate.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// A first push has no commit before it: GitHub then sends zeros, which name nothing.
const { values } = parseArgs({ options: { base: { type: 'string' }, 'docs-site': { type: 'string' } } })
const { findings, notes } = validateKit(root, {
  base: [values.base, process.env.MESUB_SKILLS_BASE].find((ref) => ref && !/^0+$/.test(ref)),
  docsSite: values['docs-site'] ? resolve(values['docs-site']) : undefined,
})

for (const note of notes) console.log(`note: ${note}`)
for (const finding of findings) console.error(`${finding.rule}  ${finding.file}: ${finding.message}`)
if (findings.length > 0) {
  console.error(`\n${findings.length} problem(s)`)
  process.exit(1)
}
console.log('the kit is valid')
