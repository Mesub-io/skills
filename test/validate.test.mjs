// One broken kit per rule: the good kit with a single thing wrong. Each must fail
// with its own rule and no other, which proves the rule bites and why.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { validateKit } from '../scripts/lib/validate.mjs'
import { edit, makeKit, render, write } from './helpers/kit.mjs'

const ALPHA = 'skills/mesub-alpha'
const BETA = 'skills/mesub-beta'
const EM_DASH = '\u2014'
// Appends a line to the Overview of alpha's SKILL.md.
const say = (line) => (root) => edit(root, `${ALPHA}/SKILL.md`, 'What this skill is for.', `What this skill is for. ${line}`)
const code = (lines) => (root) => edit(root, `${ALPHA}/SKILL.md`, 'const mesub =', `${lines}\nconst mesub =`)

/** @type {[string, string | string[], { before?: Function, after?: Function }, RegExp?][]} */
const CASES = [
  // Catalog
  ['catalog that is not YAML', 'catalog/parse', { after: (root) => write(root, 'catalog.yaml', 'a: [') }],
  ['unknown catalog field', 'catalog/shape', { after: (root) => edit(root, 'catalog.yaml', 'schema: v1', 'schema: v1\nlicence: MIT') }, /unknown field "licence"/],
  ['kit version that is not X.Y.Z', 'catalog/shape', { after: (root) => edit(root, 'catalog.yaml', 'version: 1.0.0\ndescription', 'version: 1.0\ndescription') }],
  ['skill id outside the pattern', 'catalog/skill', { after: (root) => edit(root, 'catalog.yaml', 'id: mesub-gamma', 'id: Gamma') }],
  ['unknown status', 'catalog/skill', { after: (root) => edit(root, 'catalog.yaml', 'status: planned', 'status: soon') }],
  ['shipped skill without a version', 'catalog/skill', { after: (root) => edit(root, 'catalog.yaml', '    version: 0.2.0\n', '') }],
  ['skill in a group that does not exist', 'catalog/group', { after: (root) => edit(root, 'catalog.yaml', 'group: one\n    status: planned', 'group: two\n    status: planned') }],
  ['skill without its docs fallback', 'catalog/fallback', { after: (root) => edit(root, 'catalog.yaml', '    docs: /docs/gamma\n', '') }],
  ['distribution with no renderer', 'catalog/distribution', { after: (root) => edit(root, 'catalog.yaml', 'renderer: skills-cli', 'renderer: cursor') }],
  ['manifest list that is not what the renderer writes', 'catalog/distribution', { after: (root) => edit(root, 'catalog.yaml', '- skills.sh.json', '- skills.json') }],

  // Layout
  ['folder the catalog does not list', 'layout/uncatalogued', { after: (root) => mkdirSync(join(root, 'skills/mesub-delta')) }],
  ['folder for a planned skill', 'layout/uncatalogued', { after: (root) => mkdirSync(join(root, 'skills/mesub-gamma')) }, /planned/],
  ['shipped skill without its folder', ['layout/missing-folder', 'links/broken'], { after: (root) => rmSync(join(root, BETA), { recursive: true }) }],
  ['missing checks/verification.md', ['layout/missing-file', 'links/broken'], { after: (root) => rmSync(join(root, BETA, 'checks'), { recursive: true }) }],
  ['per-vendor file in a skill folder', 'layout/unknown-entry', { after: (root) => write(root, `${BETA}/agents/openai.yaml`, 'interface: {}\n') }],
  ['SKILL.md outside skills/', 'layout/stray-skill', { after: (root) => write(root, 'examples/demo/SKILL.md', '# Demo\n') }],
  ['numbered copy of a file', 'layout/numbered-copy', { after: (root) => write(root, 'AGENTS 2.md', '# Rules\n') }],

  // Frontmatter
  ['frontmatter never closed', 'frontmatter/parse', { after: (root) => edit(root, `${BETA}/SKILL.md`, 'checked in package.json.\n---', 'checked in package.json.') }],
  ['frontmatter name that is not the folder', 'frontmatter/name', { after: (root) => edit(root, `${BETA}/SKILL.md`, 'name: mesub-beta', 'name: beta') }],
  ['unsupported frontmatter field', 'frontmatter/field', { after: (root) => edit(root, `${BETA}/SKILL.md`, 'name: mesub-beta', 'name: mesub-beta\nallowed-tools: Read') }],
  ['description that does not open the way a trigger does', 'frontmatter/description', { after: (root) => edit(root, `${BETA}/SKILL.md`, 'description: Use this skill when', 'description: Helps when') }, /open with/],
  ['description without a casual trigger', 'frontmatter/description', { after: (root) => edit(root, `${BETA}/SKILL.md`, ', even if the user just says "make it work"', '') }, /casual trigger/],
  ['licence in a skill when the kit has none', 'render/drift', { after: (root) => edit(root, `${BETA}/SKILL.md`, 'name: mesub-beta', 'name: mesub-beta\nlicense: MIT') }],

  // SKILL.md
  ['missing section', 'skill-md/sections', { after: (root) => edit(root, `${BETA}/SKILL.md`, '## Assets\n\nNone.\n\n', '') }],
  ['sections out of order', 'skill-md/sections', { after: (root) => edit(root, `${BETA}/SKILL.md`, '## Assets\n\nNone.\n\n## Scripts\n\nNone.', '## Scripts\n\nNone.\n\n## Assets\n\nNone.') }],
  ['H1 that is not the title', 'skill-md/title', { after: (root) => edit(root, `${BETA}/SKILL.md`, '# Beta', '# Something else') }],
  ['SKILL.md over 500 lines', 'skill-md/length', { after: (root) => edit(root, `${BETA}/SKILL.md`, 'Read the API key', `${'A\n'.repeat(500)}Read the API key`) }],
  ['SKILL.md over 8,000 bytes', 'skill-md/bytes', { after: (root) => edit(root, `${BETA}/SKILL.md`, 'Read the API key', `${'a'.repeat(8000)} Read the API key`) }],
  ['reference no SKILL.md names', 'skill-md/unlisted', { after: (root) => write(root, `${BETA}/references/extra.md`, '# Extra\n') }],
  ['skeleton left unfilled', 'skill-md/placeholder', { after: say('TODO: say more.') }],

  // skill.yaml
  ['skill.yaml missing a field', 'skill-yaml/shape', { after: (root) => edit(root, `${BETA}/skill.yaml`, 'use_when:\n  - The task is the thing.\n', '') }, /missing field "use_when"/],
  ['skill.yaml with an unknown field', 'skill-yaml/shape', { after: (root) => edit(root, `${BETA}/skill.yaml`, 'schema: v1', 'schema: v1\ninterface: {}') }],
  ['skill.yaml id that is not the folder', 'skill-yaml/id', { after: (root) => edit(root, `${BETA}/skill.yaml`, 'id: mesub-beta', 'id: mesub-b') }],
  ['skill.yaml version that is not the catalog one', 'skill-yaml/version', { after: (root) => edit(root, `${BETA}/skill.yaml`, 'version: 0.2.0', 'version: 0.3.0') }],
  ['skill.yaml description that is not the catalog one', 'skill-yaml/description', { after: (root) => edit(root, `${BETA}/skill.yaml`, 'Does the beta thing.', 'Does beta.') }],
  ['two skills owning the same thing', 'skill-yaml/owns-overlap', { after: (root) => edit(root, `${BETA}/skill.yaml`, '- mesub-beta topic', '- mesub-alpha topic') }],
  ['delegating to a skill that does not exist', ['skill-yaml/delegates', 'related/missing'], { after: (root) => edit(root, `${ALPHA}/skill.yaml`, 'delegates_to: []', 'delegates_to:\n  - mesub-omega') }, /not in catalog/],
  ['delegating to a planned skill', 'skill-yaml/delegates', { before: (root) => edit(root, `${ALPHA}/skill.yaml`, 'delegates_to: []', 'delegates_to:\n  - mesub-gamma') }, /only planned/],
  ['delegating to itself', 'skill-yaml/delegates', { before: (root) => edit(root, `${ALPHA}/skill.yaml`, 'delegates_to: []', 'delegates_to:\n  - mesub-alpha') }, /itself/],
  ['package that is not one of the two', 'skill-yaml/packages', { after: (root) => edit(root, `${BETA}/skill.yaml`, '- "@mesub/node"', '- "express"') }],
  ['source outside the docs layout', ['skill-yaml/sources', 'content/docs-link'], { after: (root) => edit(root, `${BETA}/skill.yaml`, '- src/docs/beta.mdx', '- docs/beta') }],

  // Hand-offs: a skill works alone
  ['hand-off block edited by hand', 'render/drift', { after: (root) => edit(root, `${BETA}/SKILL.md`, '- Territory: Does the alpha thing.', '- Territory: Alpha.') }],
  ['delegate added without rendering its hand-off', ['related/missing', 'render/drift'], { after: (root) => edit(root, `${ALPHA}/skill.yaml`, 'delegates_to: []', 'delegates_to:\n  - mesub-beta') }],
  ['hand-off markers removed', 'render/markers', { after: (root) => edit(root, `${ALPHA}/SKILL.md`, '<!-- related:start -->', '') }],
  ['kit directory missing from the skill that carries it', ['related/directory', 'render/drift', 'links/broken'], { after: (root) => rmSync(join(root, ALPHA, 'references/kit-directory.md')) }],
  ['kit directory edited by hand', 'render/drift', { after: (root) => edit(root, `${ALPHA}/references/kit-directory.md`, '# Kit directory', '# Directory') }],
  ['naming a planned skill as if it were there', 'related/planned', { after: say('Then use `mesub-gamma`.') }],
  ['link into another skill', 'links/escape', { after: say('See [the other guide](../mesub-beta/SKILL.md).') }],
  ['code path into another skill', 'links/escape', { after: say('Read `../mesub-beta/checks/verification.md`.') }],
  ['script reaching out of its folder', 'links/escape', { after: (root) => edit(root, `${ALPHA}/scripts/verify.sh`, 'echo ok', 'source ../../mesub-beta/scripts/lib.sh') }],
  ['link to a file that is not there', 'links/broken', { after: say('See [more](references/nope.md).') }],
  ['code path to a file that is not there', 'links/broken', { after: say('Copy `assets/nope.ts`.') }],
  ['broken link in a root doc', 'links/broken', { after: (root) => edit(root, 'README.md', '(AGENTS.md)', '(RULES.md)') }],

  // Scripts
  ['script that is not executable', 'scripts/executable', { after: (root) => chmodSync(join(root, ALPHA, 'scripts/verify.sh'), 0o644) }],
  ['script without a shebang', 'scripts/shebang', { after: (root) => edit(root, `${ALPHA}/scripts/verify.sh`, '#!/usr/bin/env bash\n', '') }],
  ['script without a usage line', 'scripts/usage', { after: (root) => edit(root, `${ALPHA}/scripts/verify.sh`, '# Usage: bash', '# Run: bash') }],

  // Content
  ['"secret key"', 'content/secret-key', { after: say('Keep the secret key safe.') }],
  ['a network name', 'content/network', { after: say('It runs on devnet.') }],
  ['an em dash', 'content/em-dash', { after: say(`One thing ${EM_DASH} another.`) }],
  ['an em dash outside the skills', 'content/em-dash', { after: (root) => edit(root, 'AGENTS.md', '# Rules', `# Rules ${EM_DASH} all`) }],
  ['a package name that is not exact', 'content/package-name', { after: say('Install `@mesub/sdk`.') }],
  ['a package name without its scope', 'content/package-name', { after: say('Install mesub-node.') }],
  ['one vendor\'s agent addressed', 'content/vendor', { after: say('Claude should read this first.') }],
  ['one vendor\'s tool relied on', 'content/vendor', { after: say('Track the steps with TodoWrite.') }],
  ['a literal API key', 'content/api-key-exposure', { after: code('const key = "SUB_a1b2c3d4e5f6g7h8"') }, /literal/],
  ['an API key in a browser variable', 'content/api-key-exposure', { after: say('Set `NEXT_PUBLIC_MESUB_API_KEY`.') }, /browser/],
  ['an API key written to a log', 'content/api-key-exposure', { after: code('console.log(process.env.MESUB_API_KEY)') }, /log/],
  ['an API key in client code', 'content/api-key-exposure', { after: code('"use client"') }, /client code/],
  ['a docs link that is not a declared source', 'content/docs-link', { after: say('See https://docs.mesub.io/docs/pricing too.') }],

  // Evals
  ['stable skill without an eval', 'evals/missing', { after: (root) => rmSync(join(root, 'evals/mesub-alpha.md')) }],
  ['eval for a skill that is not shipped', 'evals/orphan', { after: (root) => write(root, 'evals/mesub-gamma.md', '# Eval: mesub-gamma\n') }],
  ['eval without its checklist', 'evals/format', { after: (root) => edit(root, 'evals/mesub-alpha.md', '- [ ] Does it.', 'Does it.') }],
  ['eval without a prompt', 'evals/format', { after: (root) => edit(root, 'evals/mesub-alpha.md', '> Do the thing.', 'Do the thing.') }],

  // Rendered files and release
  ['README table edited by hand', 'render/drift', { after: (root) => edit(root, 'README.md', 'Does the alpha thing.', 'Alpha!') }],
  ['catalog changed without rendering', 'render/drift', { after: (root) => { edit(root, 'catalog.yaml', 'description: Does the beta thing.', 'description: Beta, reworded.'); edit(root, `${BETA}/skill.yaml`, 'Does the beta thing.', 'Beta, reworded.') } }],
  ['skills.sh.json edited by hand', 'render/drift', { after: (root) => edit(root, 'skills.sh.json', 'Group one', 'Group 1') }],
  ['README without its markers', 'render/markers', { after: (root) => edit(root, 'README.md', '<!-- install:start -->', '') }],
  ['licence set without a LICENSE file', ['release/license', 'links/broken'], { before: (root) => edit(root, 'catalog.yaml', 'schema: v1', 'schema: v1\nlicense: MIT') }],
]

for (const [name, rules, change, message] of CASES) {
  test(`fails on: ${name}`, () => {
    const { findings } = validateKit(makeKit(change))
    const expected = [rules].flat().sort()
    assert.deepEqual([...new Set(findings.map((finding) => finding.rule))].sort(), expected, JSON.stringify(findings, null, 2))
    if (message) assert.ok(findings.some((finding) => message.test(finding.message)), JSON.stringify(findings, null, 2))
  })
}

test('a source or a fallback that the docs repository does not hold fails when it is given', () => {
  const root = makeKit()
  const docs = makeKit()
  for (const page of ['alpha', 'gamma']) write(docs, `src/docs/${page}.mdx`, '# Page\n')
  const { findings } = validateKit(root, { docsSite: docs })
  assert.deepEqual(findings.map((finding) => [finding.rule, finding.file]), [
    ['catalog/fallback', 'catalog.yaml'],
    ['skill-yaml/sources', 'skills/mesub-beta/skill.yaml'],
  ])
})

// Version rules need a history: the good kit committed, then changed.
function committedKit() {
  const root = makeKit()
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'ignore' })
  git('init', '-q', '-b', 'main')
  git('add', '.')
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'base')
  return root
}

test('fails on: stable skill changed since the base with the same version', () => {
  const root = committedKit()
  edit(root, `${ALPHA}/SKILL.md`, 'The task is the thing.', 'The task is exactly the thing.')
  const { findings } = validateKit(root, { base: 'main' })
  assert.deepEqual(findings.map((finding) => finding.rule), ['version/not-bumped'])
})

test('fails on: new file in a stable skill with the same version', () => {
  const root = committedKit()
  write(root, `${ALPHA}/references/more.md`, '# More\n')
  edit(root, `${ALPHA}/SKILL.md`, '\n\n## Assets', '\n- `references/more.md`: more.\n\n## Assets')
  assert.deepEqual(validateKit(root, { base: 'main' }).findings.map((finding) => finding.rule), ['version/not-bumped'])
})

test('passes when the changed stable skill raises its version in both places', () => {
  const root = committedKit()
  edit(root, `${ALPHA}/SKILL.md`, 'The task is the thing.', 'The task is exactly the thing.')
  edit(root, `${ALPHA}/skill.yaml`, 'version: 1.0.0', 'version: 1.0.1')
  edit(root, 'catalog.yaml', 'status: stable\n    version: 1.0.0', 'status: stable\n    version: 1.0.1')
  render(root)
  assert.deepEqual(validateKit(root, { base: 'main' }).findings, [])
})

test('passes when an experimental skill changes without raising its version', () => {
  const root = committedKit()
  edit(root, `${BETA}/SKILL.md`, 'The task is the thing.', 'The task is exactly the thing.')
  assert.deepEqual(validateKit(root, { base: 'main' }).findings, [])
})

test('fails on: a base that cannot be resolved', () => {
  const { findings } = validateKit(committedKit(), { base: 'nope' })
  assert.deepEqual(findings.map((finding) => finding.rule), ['version/base'])
})

test('skips the version check, and says so, outside a git repository', () => {
  const { findings, notes } = validateKit(makeKit())
  assert.deepEqual(findings, [])
  assert.match(notes.join(), /version check skipped/)
})
