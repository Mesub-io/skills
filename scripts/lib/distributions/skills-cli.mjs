// The skills CLI (npx skills) finds skills/ by itself. skills.sh.json only groups
// them on the kit's skills.sh page: schema at skills.sh/schemas/skills.sh.schema.json.
import { isShipped } from '../catalog.mjs'
import { slug, json } from './shared.mjs'

export default {
  files(catalog) {
    const groupings = catalog.groups
      .map((group) => ({
        title: group.title,
        description: group.description,
        skills: catalog.skills.filter((skill) => skill.group === group.id && isShipped(skill)).map((skill) => skill.id),
      }))
      .filter((group) => group.skills.length > 0)
    // The schema refuses an empty grouping: no shipped skill, no file.
    if (groupings.length === 0) return { 'skills.sh.json': null }
    const index = { $schema: 'https://skills.sh/schemas/skills.sh.schema.json', notGrouped: 'bottom', groupings }
    return { 'skills.sh.json': json(index) }
  },

  install(catalog) {
    const example = catalog.skills.find(isShipped)?.id ?? '<skill-id>'
    return [
      '### With the skills CLI',
      '',
      'The [skills CLI](https://skills.sh) installs the skills you pick, and only those, for whichever agents you use. You do not have to take the whole kit: each skill works alone.',
      '',
      '```bash',
      '# See what the kit holds, without installing',
      `npx skills add ${slug(catalog)} --list`,
      '',
      '# Pick skills and agents interactively',
      `npx skills add ${slug(catalog)}`,
      '',
      '# One skill, no prompt (add -g for your user folder instead of the project)',
      `npx skills add ${slug(catalog)} --skill ${example} --yes`,
      '',
      '# Every skill of the kit',
      `npx skills add ${slug(catalog)} --skill '*' --yes`,
      '',
      '# Stay on one release: replace vX.Y.Z with a tag of this repository',
      `npx skills add ${slug(catalog)}#vX.Y.Z --skill ${example} --yes`,
      '```',
    ].join('\n')
  },

  installOne(catalog, skill) {
    return `To install it alone: \`npx -y skills add ${slug(catalog)} --skill ${skill.id}\`.`
  },
}
