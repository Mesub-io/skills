/** "Mesub-io/skills" from the repository URL. */
export const slug = (catalog) => catalog.repository.replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '')

export const json = (value) => JSON.stringify(value, null, 2) + '\n'
