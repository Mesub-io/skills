// The renderers a catalog distribution may name. Today there is one, on purpose:
// a new distribution is one module here and one entry in catalog.yaml.
import skillsCli from './skills-cli.mjs'

/**
 * @typedef {object} Renderer
 * @property {(catalog: any) => Record<string, string | null>} files Whole files, null when the file must not exist.
 * @property {(catalog: any) => string} install README section: installing the kit.
 * @property {(catalog: any, skill: any) => string} installOne Hand-off line: getting one skill.
 */

/** @type {Record<string, Renderer>} */
export const renderers = { 'skills-cli': skillsCli }
