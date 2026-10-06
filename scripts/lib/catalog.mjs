// Loads catalog.yaml and checks its shape. Everything rendered comes from here.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'

export const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
export const SKILL_ID = /^mesub-[a-z0-9]+(-[a-z0-9]+)*$/
export const STATUSES = ['stable', 'experimental', 'planned']

const TOP_KEYS = [
  'schema', 'name', 'version', 'description', 'repository', 'docs_url',
  'license', 'directory', 'distributions', 'groups', 'skills',
]
const SKILL_KEYS = ['id', 'group', 'status', 'version', 'issue', 'docs', 'description']

/** @typedef {{ rule: string, file: string, message: string }} Finding */

/** @param {string} root */
export function loadCatalog(root) {
  return parse(readFileSync(join(root, 'catalog.yaml'), 'utf8'))
}

export const isShipped = (skill) => skill.status !== 'planned'
export const shippedSkills = (catalog) => catalog.skills.filter(isShipped)
export const skillById = (catalog, id) => catalog.skills.find((skill) => skill.id === id)
export const docsLink = (catalog, skill) => catalog.docs_url + skill.docs

/** "1.2.3" as numbers, for comparisons. */
export const semverParts = (version) => String(version).split('.').map(Number)
export function semverGreater(a, b) {
  const [x, y] = [semverParts(a), semverParts(b)]
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]
  return false
}

const isText = (value) => typeof value === 'string' && value.trim() !== ''
const isUrl = (value) => isText(value) && /^https:\/\/\S+$/.test(value)

/**
 * @param {any} catalog
 * @param {Record<string, { files: (catalog: any) => Record<string, string | null> }>} renderers
 * @returns {Finding[]}
 */
export function validateCatalog(catalog, renderers) {
  /** @type {Finding[]} */
  const findings = []
  const add = (rule, message) => findings.push({ rule, file: 'catalog.yaml', message })

  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
    add('catalog/shape', 'must be a mapping')
    return findings
  }
  for (const key of Object.keys(catalog)) {
    if (!TOP_KEYS.includes(key)) add('catalog/shape', `unknown field "${key}"`)
  }
  if (catalog.schema !== 'v1') add('catalog/shape', 'schema must be v1')
  for (const key of ['name', 'description']) {
    if (!isText(catalog[key])) add('catalog/shape', `"${key}" must be a non-empty string`)
  }
  if (isText(catalog.name) && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(catalog.name)) {
    add('catalog/shape', '"name" must be kebab-case')
  }
  if (!SEMVER.test(String(catalog.version))) add('catalog/shape', '"version" must be X.Y.Z')
  for (const key of ['repository', 'docs_url']) {
    if (!isUrl(catalog[key])) add('catalog/shape', `"${key}" must be an https URL`)
  }
  if (isUrl(catalog.docs_url) && catalog.docs_url.endsWith('/')) {
    add('catalog/shape', '"docs_url" must not end with a slash')
  }
  if ('license' in catalog && !isText(catalog.license)) add('catalog/shape', '"license" must be an SPDX id')

  const groups = Array.isArray(catalog.groups) ? catalog.groups : []
  if (groups.length === 0) add('catalog/group', '"groups" must be a non-empty list')
  const groupIds = new Set()
  for (const group of groups) {
    const label = `group "${group?.id}"`
    if (!isText(group?.id) || groupIds.has(group.id)) add('catalog/group', `${label}: id missing or declared twice`)
    groupIds.add(group?.id)
    // Limits of the skills.sh schema, which the grouping is rendered into.
    if (!isText(group?.title) || group.title.length > 120) add('catalog/group', `${label}: title of 1 to 120 characters`)
    if (!isText(group?.description) || group.description.length > 500) {
      add('catalog/group', `${label}: description of 1 to 500 characters`)
    }
  }

  const skills = Array.isArray(catalog.skills) ? catalog.skills : []
  if (!Array.isArray(catalog.skills)) add('catalog/skill', '"skills" must be a list')
  const ids = new Set()
  for (const skill of skills) {
    const label = `skill "${skill?.id}"`
    if (!skill || typeof skill !== 'object') {
      add('catalog/skill', 'every skill must be a mapping')
      continue
    }
    for (const key of Object.keys(skill)) {
      if (!SKILL_KEYS.includes(key)) add('catalog/skill', `${label}: unknown field "${key}"`)
    }
    if (!isText(skill.id) || !SKILL_ID.test(skill.id)) add('catalog/skill', `${label}: id must match ${SKILL_ID}`)
    if (ids.has(skill.id)) add('catalog/skill', `${label}: declared twice`)
    ids.add(skill.id)
    if (!groupIds.has(skill.group)) add('catalog/group', `${label}: unknown group "${skill.group}"`)
    if (!STATUSES.includes(skill.status)) add('catalog/skill', `${label}: status must be one of ${STATUSES.join(', ')}`)
    if (!isText(skill.description) || skill.description.length > 200 || /\n/.test(skill.description)) {
      add('catalog/skill', `${label}: description must be one line of at most 200 characters`)
    }
    // The fallback an agent reads when the skill cannot be installed.
    if (!isText(skill.docs) || !/^\/(docs|reference)\/[a-z0-9/-]+$/.test(skill.docs)) {
      add('catalog/fallback', `${label}: "docs" must be a docs path such as /docs/webhooks`)
    }
    if (skill.status === 'planned' && 'version' in skill) add('catalog/skill', `${label}: a planned skill has no version`)
    if (STATUSES.includes(skill.status) && skill.status !== 'planned' && !SEMVER.test(String(skill.version))) {
      add('catalog/skill', `${label}: a shipped skill needs a version X.Y.Z`)
    }
    if ('issue' in skill && !Number.isInteger(skill.issue)) add('catalog/skill', `${label}: issue must be a number`)
  }
  for (const group of groups) {
    if (!skills.some((skill) => skill?.group === group?.id)) add('catalog/group', `group "${group?.id}" has no skill`)
  }
  if (!ids.has(catalog.directory)) add('catalog/skill', `"directory" must name a skill of the catalog`)

  const distributions = Array.isArray(catalog.distributions) ? catalog.distributions : []
  if (distributions.length === 0) add('catalog/distribution', '"distributions" must be a non-empty list')
  const seen = new Set()
  for (const distribution of distributions) {
    const label = `distribution "${distribution?.id}"`
    if (!isText(distribution?.id) || seen.has(distribution.id)) add('catalog/distribution', `${label}: id missing or declared twice`)
    seen.add(distribution?.id)
    if (!isText(distribution?.name)) add('catalog/distribution', `${label}: name missing`)
    const renderer = renderers[distribution?.renderer]
    if (!renderer) {
      add('catalog/distribution', `${label}: no renderer "${distribution?.renderer}" in scripts/lib/distributions`)
      continue
    }
    if (findings.length > 0) continue
    const written = Object.keys(renderer.files(catalog)).sort()
    const declared = [...(distribution.manifests ?? [])].sort()
    if (written.join() !== declared.join()) {
      add('catalog/distribution', `${label}: manifests must be exactly ${written.join(', ')}`)
    }
  }
  return findings
}
