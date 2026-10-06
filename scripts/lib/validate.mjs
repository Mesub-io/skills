// Every rule of the kit. validateKit returns findings: an empty list is a pass.
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, normalize, relative, resolve, sep } from 'node:path'
import { parse } from 'yaml'
import { SEMVER, isShipped, loadCatalog, semverGreater, shippedSkills, skillById, validateCatalog } from './catalog.mjs'
import { contentFindings, emDashes } from './content.mjs'
import { renderers } from './distributions/index.mjs'
import { fences, headings, links, section, splitFrontmatter, withoutBlocks } from './markdown.mjs'
import {
  ALLOWED_ENTRIES, DESCRIPTION_HABIT, DESCRIPTION_OPENING, DIRECTORY_FILE, FRONTMATTER_FIELDS, LISTED_FOLDERS,
  MAX_SKILL_LINES, PACKAGES, PLACEHOLDER, REQUIRED_FILES, SECTIONS, SKILL_YAML_FIELDS,
} from './mould.mjs'
import { staleFiles } from './render.mjs'

/** @typedef {import('./catalog.mjs').Finding} Finding */

const SKIP = ['.git', 'node_modules', '.docs-site']
const ROOT_DOCS = ['README.md', 'AGENTS.md', 'CONTRIBUTING.md', 'CHANGELOG.md']
const EVAL_PARTS = ['Expected behaviours', 'Must not', 'Checks']

/** Files under dir, as paths relative to it. Symlinks are listed, never followed. */
function walk(dir, prefix = '') {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.includes(entry.name)) continue
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...walk(join(dir, entry.name), path))
    else out.push(path)
  }
  return out
}

/** A file's text, or null when it is binary or a symlink. */
function text(path) {
  if (lstatSync(path).isSymbolicLink()) return null
  const buffer = readFileSync(path)
  return buffer.includes(0) ? null : buffer.toString('utf8')
}

const isList = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim() !== '')
const inside = (parent, child) => child === parent || child.startsWith(parent + sep)

/** docs-site file behind a docs URL path: /docs/x is src/docs/x.mdx. */
const sourceOfDocs = (path) => (path.startsWith('/docs/') || path.startsWith('/reference/') ? `src${path}.mdx` : `public${path}`)
const docsOfSource = (source) => (source.startsWith('public/') ? source.slice(6) : source.replace(/^src/, '').replace(/\.mdx$/, ''))

function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
}

/** The commit to compare versions with, or a reason there is none. */
function resolveBase(root, asked) {
  try {
    git(root, 'rev-parse', '--git-dir')
  } catch {
    return { skipped: 'not a git repository' }
  }
  const ref = asked ?? 'origin/main'
  try {
    git(root, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`)
  } catch {
    return asked ? { error: `cannot resolve "${asked}"` } : { skipped: 'no origin/main to compare with' }
  }
  try {
    return { base: git(root, 'merge-base', ref, 'HEAD').trim() }
  } catch {
    return { base: ref }
  }
}

/**
 * @param {string} root The kit's root folder.
 * @param {{ base?: string, docsSite?: string }} [options]
 * @returns {{ findings: Finding[], notes: string[] }}
 */
export function validateKit(root, options = {}) {
  /** @type {Finding[]} */
  const findings = []
  const notes = []
  const add = (rule, file, message) => findings.push({ rule, file, message })

  let catalog
  try {
    catalog = loadCatalog(root)
  } catch (error) {
    add('catalog/parse', 'catalog.yaml', `missing or not valid YAML: ${error.message}`)
    return { findings, notes }
  }
  findings.push(...validateCatalog(catalog, renderers))
  // Nothing below can be trusted on a broken catalog.
  if (findings.length > 0) return { findings, notes }

  const all = walk(root)
  const shipped = shippedSkills(catalog)

  // --- Repository layout ---
  for (const path of all) {
    // iCloud leaves "name 2.md" beside a file it failed to merge.
    if (/ \d+(\.[^./]+)?$/.test(path)) add('layout/numbered-copy', path, 'numbered copy of a file: delete it')
    // The skills CLI installs any SKILL.md it finds when skills/ is empty.
    if (path.endsWith('SKILL.md') && !/^skills\/[^/]+\/SKILL\.md$/.test(path)) {
      add('layout/stray-skill', path, 'a SKILL.md outside skills/<id>/ would be installed as a skill')
    }
    const content = text(join(root, path))
    if (content === null) continue
    for (const found of emDashes(content)) add(found.rule, `${path}:${found.line}`, found.message)
  }
  const folders = existsSync(join(root, 'skills'))
    ? readdirSync(join(root, 'skills'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    : []
  for (const folder of folders) {
    const entry = skillById(catalog, folder)
    if (!entry) add('layout/uncatalogued', `skills/${folder}`, 'no entry in catalog.yaml')
    else if (!isShipped(entry)) add('layout/uncatalogued', `skills/${folder}`, 'catalog.yaml says planned: a planned skill has no folder')
  }

  // --- Each shipped skill against the mould ---
  const owners = new Map()
  for (const skill of shipped) {
    const dir = `skills/${skill.id}`
    if (!folders.includes(skill.id)) {
      add('layout/missing-folder', dir, `catalog.yaml says ${skill.status}, the folder does not exist`)
      continue
    }
    const files = walk(join(root, dir))
    for (const required of REQUIRED_FILES) {
      if (!files.includes(required)) add('layout/missing-file', `${dir}/${required}`, 'required by the mould')
    }
    for (const entry of readdirSync(join(root, dir))) {
      if (!ALLOWED_ENTRIES.includes(entry)) add('layout/unknown-entry', `${dir}/${entry}`, `a skill folder holds only ${ALLOWED_ENTRIES.join(', ')}`)
    }

    // skill.yaml
    let meta = null
    if (files.includes('skill.yaml')) {
      const file = `${dir}/skill.yaml`
      try {
        meta = parse(readFileSync(join(root, file), 'utf8'))
      } catch (error) {
        add('skill-yaml/shape', file, `not valid YAML: ${error.message}`)
      }
      if (meta !== null && (typeof meta !== 'object' || Array.isArray(meta))) {
        add('skill-yaml/shape', file, 'must be a mapping')
        meta = null
      }
      if (meta) {
        for (const field of SKILL_YAML_FIELDS) if (!(field in meta)) add('skill-yaml/shape', file, `missing field "${field}"`)
        for (const field of Object.keys(meta)) if (!SKILL_YAML_FIELDS.includes(field)) add('skill-yaml/shape', file, `unknown field "${field}"`)
        if (meta.schema !== 'v1') add('skill-yaml/shape', file, 'schema must be v1')
        if (typeof meta.title !== 'string' || meta.title.trim() === '') add('skill-yaml/shape', file, 'title must be a non-empty string')
        for (const field of ['owns', 'use_when', 'do_not_use_when']) {
          if (!isList(meta[field]) || meta[field].length === 0) add('skill-yaml/shape', file, `"${field}" must be a non-empty list of strings`)
        }
        for (const field of ['delegates_to', 'packages']) {
          if (!isList(meta[field])) add('skill-yaml/shape', file, `"${field}" must be a list of strings, empty or not`)
        }
        if (meta.id !== skill.id) add('skill-yaml/id', file, `id "${meta.id}" is not the folder and catalog id "${skill.id}"`)
        if (!SEMVER.test(String(meta.version)) || meta.version !== skill.version) {
          add('skill-yaml/version', file, `version "${meta.version}" is not the catalog's "${skill.version}"`)
        }
        if (meta.description !== skill.description) add('skill-yaml/description', file, 'description is not the catalog\'s, word for word')
        for (const owned of isList(meta.owns) ? meta.owns : []) {
          if (owners.has(owned)) add('skill-yaml/owns-overlap', file, `"${owned}" is already owned by ${owners.get(owned)}`)
          else owners.set(owned, skill.id)
        }
        for (const id of isList(meta.delegates_to) ? meta.delegates_to : []) {
          const target = skillById(catalog, id)
          if (id === skill.id) add('skill-yaml/delegates', file, 'a skill does not delegate to itself')
          else if (!target) add('skill-yaml/delegates', file, `delegates to "${id}", which is not in catalog.yaml`)
          else if (!isShipped(target)) add('skill-yaml/delegates', file, `delegates to "${id}", which is only planned`)
        }
        for (const name of isList(meta.packages) ? meta.packages : []) {
          if (!PACKAGES.includes(name)) add('skill-yaml/packages', file, `"${name}": packages are ${PACKAGES.join(' and ')}`)
        }
        if (!isList(meta.sources) || meta.sources.length === 0) add('skill-yaml/sources', file, '"sources" must list at least one docs file')
        for (const source of isList(meta.sources) ? meta.sources : []) {
          if (!/^(src\/(docs|reference)\/[\w/-]+\.mdx|public\/[\w.-]+)$/.test(source)) {
            add('skill-yaml/sources', file, `"${source}": a path of the docs repository under src/docs, src/reference or public`)
          } else if (options.docsSite && !existsSync(join(options.docsSite, source))) {
            add('skill-yaml/sources', file, `"${source}" does not exist in the docs repository`)
          }
        }
      }
    }

    // SKILL.md
    let skillMd = ''
    if (files.includes('SKILL.md')) {
      const file = `${dir}/SKILL.md`
      skillMd = readFileSync(join(root, file), 'utf8')
      const { data, error } = splitFrontmatter(skillMd)
      if (error) add('frontmatter/parse', file, error)
      if (data) {
        for (const field of Object.keys(data)) {
          if (!FRONTMATTER_FIELDS.includes(field)) add('frontmatter/field', file, `unsupported field "${field}"`)
        }
        if (data.name !== skill.id) add('frontmatter/name', file, `name "${data.name}" is not the folder and catalog id "${skill.id}"`)
        const description = data.description
        if (typeof description !== 'string' || description.trim() === '' || description.length > 1024) {
          add('frontmatter/description', file, 'description must be 1 to 1024 characters')
        } else {
          if (!description.startsWith(DESCRIPTION_OPENING)) add('frontmatter/description', file, `description must open with "${DESCRIPTION_OPENING}"`)
          if (!description.includes(DESCRIPTION_HABIT)) add('frontmatter/description', file, `description must hold a casual trigger: "${DESCRIPTION_HABIT} says..."`)
        }
        if ('compatibility' in data && (typeof data.compatibility !== 'string' || data.compatibility.length > 500)) {
          add('frontmatter/field', file, 'compatibility must be a string of at most 500 characters')
        }
      }
      const found = headings(skillMd)
      const h2 = found.filter((heading) => heading.level === 2).map((heading) => heading.title)
      if (h2.join('|') !== SECTIONS.join('|')) add('skill-md/sections', file, `the sections must be exactly, in order: ${SECTIONS.join(', ')}`)
      const h1 = found.filter((heading) => heading.level === 1).map((heading) => heading.title)
      if (meta && (h1.length !== 1 || h1[0] !== meta.title)) add('skill-md/title', file, `one H1, the title of skill.yaml: "${meta.title}"`)
      if (skillMd.split('\n').length > MAX_SKILL_LINES) add('skill-md/length', file, `more than ${MAX_SKILL_LINES} lines: move detail to references/`)
      for (const path of files) {
        if (LISTED_FOLDERS.includes(path.split('/')[0]) && !skillMd.includes(path)) {
          add('skill-md/unlisted', `${dir}/${path}`, 'not named in SKILL.md: no agent would load it')
        }
      }
      // A hand-off needs its fallback: the rendered block must name every neighbour.
      const related = section(skillMd, 'Related skills') ?? ''
      for (const id of meta && isList(meta.delegates_to) ? meta.delegates_to : []) {
        if (!related.includes(`\`${id}\``)) add('related/missing', file, `delegates to "${id}" but "Related skills" has no hand-off for it: run pnpm render`)
      }
      if (catalog.directory === skill.id && !files.includes(DIRECTORY_FILE)) {
        add('related/directory', `${dir}/${DIRECTORY_FILE}`, 'this skill carries the kit directory: run pnpm render')
      }
    }

    // Every text file of the skill: content rules, links, paths.
    const planned = catalog.skills.filter((other) => !isShipped(other)).map((other) => other.id)
    const allowedDocs = new Set((isList(meta?.sources) ? meta.sources : []).map(docsOfSource))
    const skillRoot = resolve(root, dir)
    for (const path of files) {
      const file = `${dir}/${path}`
      const raw = text(join(root, file))
      if (raw === null) continue
      if (path === DIRECTORY_FILE && catalog.directory === skill.id) continue
      // What the author wrote: the rendered hand-offs name planned skills and other docs on purpose.
      const written = withoutBlocks(raw, ['related'])
      for (const found of contentFindings(written)) {
        if (found.rule !== 'content/em-dash') add(found.rule, `${file}:${found.line}`, found.message)
      }
      if (written.includes(PLACEHOLDER)) add('skill-md/placeholder', file, `a ${PLACEHOLDER} of the skeleton is still there`)
      for (const id of path === 'skill.yaml' ? [] : planned) {
        if (new RegExp(`\\b${id}\\b`).test(written)) add('related/planned', file, `names "${id}", which is only planned: nothing can be handed to it yet`)
      }
      for (const match of written.matchAll(new RegExp(`${catalog.docs_url.replace(/[.]/g, '\\.')}(/[\\w./-]*[\\w/-])?`, 'g'))) {
        if (match[1] && !allowedDocs.has(match[1])) {
          add('content/docs-link', file, `${match[0]} is not one of this skill's "sources" (${sourceOfDocs(match[1])})`)
        }
      }
      // A skill is copied alone: nothing it points to may live outside its folder.
      const here = dirname(resolve(root, file))
      const check = (target, where) => {
        const clean = target.split('#')[0].split('?')[0]
        if (clean === '' || /^[a-z][a-z0-9+.-]*:/i.test(clean) || clean.startsWith('/')) return
        const full = normalize(resolve(here, clean))
        if (!inside(skillRoot, full)) add('links/escape', where, `"${target}" leaves the skill's folder: a skill is installed alone`)
        else if (!existsSync(full)) add('links/broken', where, `"${target}" does not exist`)
      }
      if (path.endsWith('.md')) {
        for (const link of links(written)) check(link.target, `${file}:${link.line}`)
        // Paths written as code, the way SKILL.md names its own files.
        for (const match of fences(written).prose.matchAll(/`((?:references|assets|scripts|checks)\/[^`\s]+)`/g)) {
          if (!existsSync(join(skillRoot, match[1]))) add('links/broken', file, `"${match[1]}" does not exist in the skill`)
        }
      }
      written.split('\n').forEach((line, index) => {
        if (/(^|[\s"'`(=])\.\.\/[\w.-]/.test(line) && !path.endsWith('.md')) {
          add('links/escape', `${file}:${index + 1}`, 'a path with ../ leaves the skill\'s folder: a skill is installed alone')
        } else if (path.endsWith('.md') && /`[^`]*\.\.\/(mesub-|\.\.\/)[^`]*`/.test(line)) {
          add('links/escape', `${file}:${index + 1}`, 'a path into another skill: a skill is installed alone')
        }
      })
    }

    // scripts/: what an agent runs in someone's project.
    for (const path of files.filter((name) => name.startsWith('scripts/'))) {
      const file = `${dir}/${path}`
      const raw = text(join(root, file)) ?? ''
      const head = raw.split('\n').slice(0, 12)
      if ((statSync(join(root, file)).mode & 0o111) === 0) add('scripts/executable', file, 'not executable: chmod +x, and commit the mode')
      if (!head[0]?.startsWith('#!')) add('scripts/shebang', file, 'first line must be a shebang')
      if (!head.some((line) => /^\s*(#|\/\/|\*)\s*Usage:\s*\S/.test(line))) add('scripts/usage', file, 'needs a "Usage:" comment in its first lines')
    }
  }

  // --- Root docs: local links ---
  const evalFiles = all.filter((path) => /^evals\/[^/]+\.md$/.test(path))
  for (const path of [...ROOT_DOCS, ...evalFiles]) {
    if (!existsSync(join(root, path))) {
      add('layout/missing-file', path, 'required at the root of the kit')
      continue
    }
    for (const link of links(readFileSync(join(root, path), 'utf8'))) {
      const clean = link.target.split('#')[0]
      if (clean === '' || /^[a-z][a-z0-9+.-]*:/i.test(clean)) continue
      if (!existsSync(resolve(root, dirname(path), clean))) add('links/broken', `${path}:${link.line}`, `"${link.target}" does not exist`)
    }
  }

  // --- Evals ---
  for (const skill of shipped) {
    if (skill.status === 'stable' && !evalFiles.includes(`evals/${skill.id}.md`)) {
      add('evals/missing', `evals/${skill.id}.md`, 'a stable skill needs its eval file')
    }
  }
  for (const path of evalFiles) {
    const id = path.slice(6, -3)
    if (id === 'README') continue
    const target = skillById(catalog, id)
    if (!target || !isShipped(target)) {
      add('evals/orphan', path, 'no shipped skill of that id in catalog.yaml')
      continue
    }
    const content = readFileSync(join(root, path), 'utf8')
    const { prose } = fences(content)
    if (!prose.startsWith(`# Eval: ${id}\n`)) add('evals/format', path, `must open with "# Eval: ${id}"`)
    const prompts = prose.split(/^## /m).slice(1)
    if (prompts.length === 0) add('evals/format', path, 'needs at least one "## Prompt N: title"')
    prompts.forEach((prompt, index) => {
      const label = `prompt ${index + 1}`
      if (!new RegExp(`^Prompt ${index + 1}: \\S`).test(prompt)) add('evals/format', path, `${label}: heading must be "## Prompt ${index + 1}: title"`)
      if (!/^> \S/m.test(prompt)) add('evals/format', path, `${label}: the prompt itself, as a quote, is missing`)
      const parts = [...prompt.matchAll(/^### (.+?)\s*$/gm)].map((match) => match[1])
      if (parts.join('|') !== EVAL_PARTS.join('|')) add('evals/format', path, `${label}: parts must be, in order: ${EVAL_PARTS.join(', ')}`)
      for (const part of EVAL_PARTS.slice(0, 2)) {
        const body = prompt.split(`### ${part}`)[1]?.split(/^### /m)[0] ?? ''
        if (!/^- \[ \] \S/m.test(body)) add('evals/format', path, `${label}: "${part}" needs at least one "- [ ]" line`)
      }
    })
  }

  // --- Rendered files ---
  const { stale, problems } = staleFiles(root, catalog)
  for (const problem of problems) add('render/markers', problem.file, problem.message)
  for (const file of stale) add('render/drift', file.file, `${file.message}: run pnpm render`)

  // --- Release ---
  const changelog = existsSync(join(root, 'CHANGELOG.md')) ? readFileSync(join(root, 'CHANGELOG.md'), 'utf8') : ''
  if (!new RegExp(`^## \\[?${catalog.version.replace(/\./g, '\\.')}\\]?(\\s|$)`, 'm').test(changelog)) {
    add('release/changelog', 'CHANGELOG.md', `no "## ${catalog.version}" entry for the catalog's version`)
  }
  if (catalog.license && !existsSync(join(root, 'LICENSE'))) add('release/license', 'LICENSE', `catalog.yaml says ${catalog.license}, the file is missing`)

  // --- Versions against the base branch ---
  const { base, skipped, error } = resolveBase(root, options.base)
  if (error) add('version/base', 'catalog.yaml', error)
  if (skipped) notes.push(`version check skipped: ${skipped}`)
  if (base) {
    const changed = new Set([
      ...git(root, 'diff', '--name-only', base, '--', 'skills').split('\n'),
      ...git(root, 'ls-files', '--others', '--exclude-standard', '--', 'skills').split('\n'),
    ].filter(Boolean).map((path) => path.split('/')[1]))
    for (const skill of shipped) {
      if (!changed.has(skill.id)) continue
      let before
      try {
        before = parse(git(root, 'show', `${base}:skills/${skill.id}/skill.yaml`))?.version
      } catch {
        continue // New skill: any valid version will do.
      }
      if (SEMVER.test(String(before)) && SEMVER.test(String(skill.version)) && !semverGreater(skill.version, before)) {
        add('version/not-bumped', `skills/${skill.id}/skill.yaml`, `content changed since ${base.slice(0, 7)} but the version is still ${skill.version} (was ${before}): raise it here and in catalog.yaml`)
      }
    }
  }

  return { findings, notes }
}
