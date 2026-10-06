// A small valid kit, written to a temporary folder: two shipped skills and a planned
// one. Built in code so no SKILL.md lies in this repository for an installer to find.
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { loadCatalog } from '../../scripts/lib/catalog.mjs'
import { writeAll } from '../../scripts/lib/render.mjs'

const CATALOG = `schema: v1
name: mesub-skills
version: 1.0.0
description: A kit for the tests.
repository: https://github.com/Mesub-io/skills
docs_url: https://docs.mesub.io
directory: mesub-alpha
distributions:
  - id: skills-cli
    name: skills CLI
    renderer: skills-cli
    manifests:
      - skills.sh.json
groups:
  - id: one
    title: Group one
    description: The first group.
skills:
  - id: mesub-alpha
    group: one
    status: stable
    version: 1.0.0
    docs: /docs/alpha
    description: Does the alpha thing.
  - id: mesub-beta
    group: one
    status: experimental
    version: 0.2.0
    docs: /docs/beta
    description: Does the beta thing.
  - id: mesub-gamma
    group: one
    status: planned
    issue: 3
    docs: /docs/gamma
    description: Will do the gamma thing.
`

const skillMd = (id, title, lists) => `---
name: ${id}
description: Use this skill when doing the ${id} thing, even if the user just says "make it work". Covers the thing.
compatibility: Needs @mesub/node, checked in package.json.
---

# ${title}

## Overview

What this skill is for. See https://docs.mesub.io/docs/${id.slice(6)} for the page.

## When to use this skill

- The task is the thing.

## Do not use this skill when

- The task is something else.

## Core guidance

Read the API key from the server environment.

\`\`\`ts
import { createMesub } from '@mesub/node'
const mesub = createMesub({ apiKey: process.env.MESUB_API_KEY })
\`\`\`

## Related skills

<!-- related:start -->
<!-- related:end -->

## References

${lists.references}

## Assets

${lists.assets}

## Scripts

${lists.scripts}

## Checks

- \`checks/verification.md\`: the runbook.
`

const skillYaml = (id, title, version, description, delegates) => `schema: v1
id: ${id}
version: ${version}
title: ${title}
description: ${description}
owns:
  - ${id} topic
use_when:
  - The task is the thing.
do_not_use_when:
  - The task is something else.
delegates_to: ${delegates}
packages:
  - "@mesub/node"
sources:
  - src/docs/${id.slice(6)}.mdx
`

const FILES = {
  'catalog.yaml': CATALOG,
  'README.md': '# Kit\n\n<!-- skills:start -->\n<!-- skills:end -->\n\n<!-- install:start -->\n<!-- install:end -->\n\nSee [the rules](AGENTS.md).\n',
  'AGENTS.md': '# Rules\n',
  'CONTRIBUTING.md': '# Contributing\n',
  'CHANGELOG.md': '# Changelog\n\n## 1.0.0\n\n- First.\n',
  'evals/README.md': '# Evals\n',
  'evals/mesub-alpha.md':
    '# Eval: mesub-alpha\n\n## Prompt 1: The thing\n\n> Do the thing.\n\n### Expected behaviours\n\n- [ ] Does it.\n\n### Must not\n\n- [ ] Breaks it.\n\n### Checks\n\n```bash\ntrue\n```\n',
  'skills/mesub-alpha/SKILL.md': skillMd('mesub-alpha', 'Alpha', {
    references: '- `references/guide.md`: the long version.\n- `references/kit-directory.md`: the kit.',
    assets: '- `assets/route.ts`: a route to copy.',
    scripts: '- `scripts/verify.sh`: checks the project.',
  }),
  'skills/mesub-alpha/skill.yaml': skillYaml('mesub-alpha', 'Alpha', '1.0.0', 'Does the alpha thing.', '[]'),
  'skills/mesub-alpha/checks/verification.md': '# Verification: Alpha\n\n## 1. It runs\n\nRun it.\n',
  'skills/mesub-alpha/references/guide.md': '# Guide\n\nBack to [the runbook](../checks/verification.md).\n',
  'skills/mesub-alpha/assets/route.ts': 'export const route = 1\n',
  'skills/mesub-alpha/scripts/verify.sh': '#!/usr/bin/env bash\n# Usage: bash "<skill-dir>/scripts/verify.sh" [--help]\nset -euo pipefail\necho ok\n',
  'skills/mesub-beta/SKILL.md': skillMd('mesub-beta', 'Beta', { references: 'None.', assets: 'None.', scripts: 'None.' }),
  'skills/mesub-beta/skill.yaml': skillYaml('mesub-beta', 'Beta', '0.2.0', 'Does the beta thing.', '\n  - mesub-alpha'),
  'skills/mesub-beta/checks/verification.md': '# Verification: Beta\n\n## 1. It runs\n\nRun it.\n',
}

export function write(root, path, content) {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), content)
}

/** Replaces `from` by `to` in a file, and fails loudly when `from` is not there. */
export function edit(root, path, from, to) {
  const content = readFileSync(join(root, path), 'utf8')
  if (!content.includes(from)) throw new Error(`fixture: "${from}" is not in ${path}`)
  writeFileSync(join(root, path), content.replace(from, to))
}

export const render = (root) => writeAll(root, loadCatalog(root))

/**
 * @param {{ before?: (root: string) => void, after?: (root: string) => void }} [change]
 * before: applied to the sources, then rendered. after: applied to the rendered kit.
 */
export function makeKit({ before, after } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'mesub-kit-'))
  for (const [path, content] of Object.entries(FILES)) write(root, path, content)
  chmodSync(join(root, 'skills/mesub-alpha/scripts/verify.sh'), 0o755)
  before?.(root)
  render(root)
  after?.(root)
  return root
}
