// The mould of a skill folder. The validator and new-skill both read it, so a
// fresh skeleton cannot drift from what is validated.
export const SECTIONS = [
  'Overview',
  'When to use this skill',
  'Do not use this skill when',
  'Core guidance',
  'Related skills',
  'References',
  'Assets',
  'Scripts',
  'Checks',
]
export const REQUIRED_FILES = ['SKILL.md', 'skill.yaml', 'checks/verification.md']
export const ALLOWED_ENTRIES = ['SKILL.md', 'skill.yaml', 'references', 'assets', 'scripts', 'checks']
// Folders whose files must each be named in SKILL.md, or no agent will ever load them.
export const LISTED_FOLDERS = ['references', 'assets', 'scripts', 'checks']
// Agent Skills specification, agentskills.io/specification. Its allowed-tools is
// left out: it lists one vendor's tool names.
export const FRONTMATTER_FIELDS = ['name', 'description', 'license', 'compatibility', 'metadata']
export const SKILL_YAML_FIELDS = [
  'schema', 'id', 'version', 'title', 'description', 'owns', 'use_when', 'do_not_use_when',
  'delegates_to', 'packages', 'sources',
]
export const PACKAGES = ['@mesub/node', '@mesub/react']
export const MAX_SKILL_LINES = 500
// The tightest agent cuts a skill's main file at 8,000 bytes when it injects it.
export const MAX_SKILL_BYTES = 8000
export const PLACEHOLDER = 'TODO'
export const DIRECTORY_FILE = 'references/kit-directory.md'
// What a description must hold to trigger: the opening, and the casual phrasing.
export const DESCRIPTION_OPENING = 'Use this skill when'
export const DESCRIPTION_HABIT = 'even if the user just'

/**
 * The files of a new skill. Structure is final, every TODO is the author's.
 * @param {{ id: string, title: string, description: string, license?: string, carriesDirectory?: boolean }} skill
 * @returns {Record<string, string>}
 */
export function skeleton({ id, title, description, license, carriesDirectory = false }) {
  const skillMd = [
    '---',
    `name: ${id}`,
    `description: ${DESCRIPTION_OPENING} ${PLACEHOLDER} the task, ${DESCRIPTION_HABIT} says ${PLACEHOLDER} the casual phrasing. Covers ${PLACEHOLDER} the keywords.`,
    `compatibility: ${PLACEHOLDER} what must be installed, and how the agent checks it.`,
    ...(license ? [`license: ${license}`] : []),
    '---',
    '',
    `# ${title}`,
    '',
    '## Overview',
    '',
    `${PLACEHOLDER}: two or three sentences on what this skill makes an agent good at.`,
    '',
    '## When to use this skill',
    '',
    `- ${PLACEHOLDER}`,
    '',
    '## Do not use this skill when',
    '',
    `- ${PLACEHOLDER}`,
    '',
    '## Core guidance',
    '',
    `${PLACEHOLDER}: the rules and the steps, with the reason behind each rule. Start by checking what is installed.`,
    '',
    '## Related skills',
    '',
    '<!-- related:start -->',
    '<!-- related:end -->',
    '',
    '## References',
    '',
    ...(carriesDirectory ? [`- \`${DIRECTORY_FILE}\`: every skill of the kit, how to install each one alone, and its docs fallback.`] : ['None.']),
    '',
    '## Assets',
    '',
    'None.',
    '',
    '## Scripts',
    '',
    'None.',
    '',
    '## Checks',
    '',
    '- `checks/verification.md`: the runbook to go through before saying the work is done.',
    '',
  ].join('\n')

  const skillYaml = [
    'schema: v1',
    `id: ${id}`,
    'version: 0.1.0',
    `title: ${title}`,
    `description: ${JSON.stringify(description)}`,
    '# The artefacts and topics this skill owns. No other skill may list the same one.',
    'owns:',
    `  - ${PLACEHOLDER}`,
    'use_when:',
    `  - ${PLACEHOLDER}`,
    'do_not_use_when:',
    `  - ${PLACEHOLDER}`,
    '# Shipped skills this one hands off to. `pnpm render` writes the hand-off block from it.',
    'delegates_to: []',
    '# Which of @mesub/node and @mesub/react this skill makes the agent use.',
    'packages: []',
    '# The docs pages this skill is written from, as paths in the docs repository.',
    'sources:',
    '  - src/docs/TODO.mdx',
    '',
  ].join('\n')

  const verification = [
    `# Verification: ${title}`,
    '',
    'Go through every check before saying the work is done. Say which ones you could not run.',
    '',
    `## 1. ${PLACEHOLDER}`,
    '',
    `${PLACEHOLDER}: the command to run or the thing to read, and what a pass looks like.`,
    '',
  ].join('\n')

  return {
    'SKILL.md': skillMd,
    'skill.yaml': skillYaml,
    'checks/verification.md': verification,
  }
}
