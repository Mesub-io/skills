// Everything written from catalog.yaml: README blocks, manifests, and inside each
// shipped skill the hand-off block, the licence line and the kit directory.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parse } from 'yaml'
import { docsLink, isShipped, shippedSkills, skillById } from './catalog.mjs'
import { renderers } from './distributions/index.mjs'
import { replaceBlock } from './markdown.mjs'
import { DIRECTORY_FILE } from './mould.mjs'

const NOTE = '<!-- Rendered from catalog.yaml by `pnpm render`. Do not edit. -->'

const distributionsOf = (catalog) => catalog.distributions.map((distribution) => renderers[distribution.renderer])

/** One skill as a hand-off: territory, is it there, how to get it alone, where to read instead. */
export function handOff(catalog, skill) {
  if (!isShipped(skill)) {
    return [
      `### \`${skill.id}\` (not available yet)`,
      '',
      `- Territory: ${skill.description}`,
      `- It cannot be installed yet. Read ${docsLink(catalog, skill)} instead.`,
    ].join('\n')
  }
  return [
    `### \`${skill.id}\``,
    '',
    `- Territory: ${skill.description}`,
    `- Installed if \`${skill.id}\` is among your available skills, or if \`npx -y skills list\` names it.`,
    ...distributionsOf(catalog).map((renderer) => `- ${renderer.installOne(catalog, skill)}`),
    `- If it cannot be installed, read ${docsLink(catalog, skill)} instead.`,
  ].join('\n')
}

/** The "Related skills" block of one skill, from its delegates_to. */
export function relatedBlock(catalog, skill, delegates) {
  const lines = [NOTE]
  const neighbours = delegates.map((id) => skillById(catalog, id)).filter(Boolean)
  if (neighbours.length === 0) {
    lines.push('This skill works alone and hands off to no other skill.')
  } else {
    lines.push(
      'This skill works alone: never assume a neighbour is installed. When the task leaves this territory, check the neighbour is there, install it if not, or read its docs.',
    )
    for (const neighbour of neighbours) lines.push('', handOff(catalog, neighbour))
  }
  if (catalog.directory === skill.id) {
    lines.push('', `Every skill of the kit, with the same three answers for each: \`${DIRECTORY_FILE}\`.`)
  }
  return lines.join('\n')
}

/** The kit directory, a whole file carried by one skill. */
export function directoryFile(catalog) {
  return [
    NOTE,
    '',
    '# Kit directory',
    '',
    `Every skill of the ${catalog.name} kit. Each one installs alone and works alone: for a task outside the skill you are reading, find its owner here, check it is installed, install it if not, or read its docs.`,
    '',
    ...catalog.skills.flatMap((skill) => [handOff(catalog, skill).replace(/^###/, '##'), '']),
  ].join('\n')
}

function skillsTable(catalog) {
  const shipped = shippedSkills(catalog).length
  const total = catalog.skills.length
  const status = (skill) =>
    isShipped(skill)
      ? `${skill.status} ${skill.version}`
      : `coming${skill.issue ? ` ([#${skill.issue}](${catalog.repository}/issues/${skill.issue}))` : ''}`
  const rows = catalog.groups.flatMap((group) =>
    catalog.skills
      .filter((skill) => skill.group === group.id)
      .map((skill) => {
        const name = isShipped(skill) ? `[\`${skill.id}\`](skills/${skill.id})` : `\`${skill.id}\``
        return `| ${group.title} | ${name} | ${skill.description} | ${status(skill)} | [docs](${docsLink(catalog, skill)}) |`
      }),
  )
  const count =
    shipped === 0
      ? `No skill is installable yet: the ${total} below are coming.`
      : `${shipped} of ${total} skills are installable today. A skill marked coming cannot be installed yet.`
  return [NOTE, count, '', '| Group | Skill | Territory | Status | Fallback |', '|---|---|---|---|---|', ...rows].join('\n')
}

function installSection(catalog) {
  const parts = [NOTE]
  if (shippedSkills(catalog).length === 0) {
    parts.push('Nothing to install yet: no skill has shipped. The commands below are the ones that will work once one has.', '')
  }
  parts.push(distributionsOf(catalog).map((renderer) => renderer.install(catalog)).join('\n\n'))
  parts.push(
    '',
    '### Clone or copy',
    '',
    'Without the CLI, a skill is a folder: copy the whole folder into the place your agent reads skills from. Nothing in it points outside itself.',
    '',
    '```bash',
    `git clone --depth 1 --branch vX.Y.Z ${catalog.repository}.git ${catalog.name}`,
    `cp -R ${catalog.name}/skills/<skill-id> <your agent's skills folder>/`,
    '```',
  )
  if (catalog.license) parts.push('', '### Licence', '', `${catalog.license}. See [LICENSE](LICENSE).`)
  return parts.join('\n')
}

/** Sets or removes the frontmatter licence, last line before the closing ---. */
function withLicence(content, license) {
  const lines = content.split('\n')
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
  if (lines[0]?.trim() !== '---' || end === -1) return content
  const head = lines.slice(0, end).filter((line) => !/^license:/.test(line))
  if (license) head.push(`license: ${license}`)
  return [...head, ...lines.slice(end)].join('\n')
}

const read = (root, path) => (existsSync(join(root, path)) ? readFileSync(join(root, path), 'utf8') : null)

/**
 * What every rendered file must contain. null means the file must not exist.
 * @returns {{ files: Record<string, string | null>, problems: { file: string, message: string }[] }}
 */
export function renderAll(root, catalog) {
  /** @type {Record<string, string | null>} */
  const files = {}
  const problems = []

  for (const renderer of distributionsOf(catalog)) Object.assign(files, renderer.files(catalog))

  const readme = read(root, 'README.md')
  if (readme === null) problems.push({ file: 'README.md', message: 'missing' })
  else {
    let next = readme
    for (const [name, body] of [['skills', skillsTable(catalog)], ['install', installSection(catalog)]]) {
      const replaced = replaceBlock(next, name, body)
      if (replaced === null) problems.push({ file: 'README.md', message: `markers <!-- ${name}:start --> and <!-- ${name}:end --> are missing` })
      else next = replaced
    }
    files['README.md'] = next
  }

  for (const skill of shippedSkills(catalog)) {
    const path = `skills/${skill.id}/SKILL.md`
    const content = read(root, path)
    if (content === null) continue
    let delegates = []
    try {
      delegates = parse(read(root, `skills/${skill.id}/skill.yaml`) ?? '')?.delegates_to ?? []
    } catch {
      // The validator reports the broken skill.yaml.
    }
    if (!Array.isArray(delegates)) delegates = []
    const replaced = replaceBlock(withLicence(content, catalog.license), 'related', relatedBlock(catalog, skill, delegates))
    if (replaced === null) problems.push({ file: path, message: 'markers <!-- related:start --> and <!-- related:end --> are missing' })
    else files[path] = replaced
    if (catalog.directory === skill.id) files[`skills/${skill.id}/${DIRECTORY_FILE}`] = directoryFile(catalog)
  }
  return { files, problems }
}

/** Rendered files whose content on disk differs. */
export function staleFiles(root, catalog) {
  const { files, problems } = renderAll(root, catalog)
  const stale = Object.entries(files)
    .filter(([path, content]) => read(root, path) !== content)
    .map(([path, content]) => ({ file: path, message: content === null ? 'must not exist' : 'differs from catalog.yaml' }))
  return { stale, problems }
}

/** Writes every rendered file. Returns the paths that changed. */
export function writeAll(root, catalog) {
  const { files, problems } = renderAll(root, catalog)
  const changed = []
  for (const [path, content] of Object.entries(files)) {
    if (read(root, path) === content) continue
    if (content === null) rmSync(join(root, path))
    else {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), content)
    }
    changed.push(path)
  }
  return { changed, problems }
}

