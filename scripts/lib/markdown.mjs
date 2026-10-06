// The little Markdown the kit needs to read: frontmatter, H2 sections, links, fences.
import { parse } from 'yaml'

/** @returns {{ data?: any, body: string, error?: string }} */
export function splitFrontmatter(content) {
  const lines = content.split('\n')
  if (lines[0]?.trim() !== '---') return { body: content, error: 'must start with ---' }
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
  if (end === -1) return { body: content, error: 'frontmatter is never closed' }
  try {
    const data = parse(lines.slice(1, end).join('\n'))
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { body: content, error: 'frontmatter must be a mapping' }
    return { data, body: lines.slice(end + 1).join('\n') }
  } catch (error) {
    return { body: content, error: `frontmatter is not valid YAML: ${error.message}` }
  }
}

/** Fenced blocks, and the same text with them blanked (line numbers kept). */
export function fences(content) {
  const blocks = []
  const prose = []
  let open = null
  for (const line of content.split('\n')) {
    const mark = line.match(/^\s*(```+|~~~+)\s*(\S*)/)
    if (open === null && mark) {
      open = { fence: mark[1], lang: mark[2], lines: [] }
      prose.push('')
    } else if (open !== null && mark && mark[1].startsWith(open.fence) && mark[2] === '') {
      blocks.push({ lang: open.lang, text: open.lines.join('\n') })
      open = null
      prose.push('')
    } else if (open !== null) {
      open.lines.push(line)
      prose.push('')
    } else {
      prose.push(line)
    }
  }
  return { blocks, prose: prose.join('\n') }
}

/** H1 and H2 headings outside code, in order. */
export function headings(content) {
  const { prose } = fences(content)
  const found = []
  prose.split('\n').forEach((line, index) => {
    const match = line.match(/^(#{1,2})\s+(.+?)\s*$/)
    if (match) found.push({ level: match[1].length, title: match[2], line: index })
  })
  return found
}

/** Text of one H2 section, heading excluded. */
export function section(content, title) {
  const all = headings(content)
  const at = all.findIndex((heading) => heading.level === 2 && heading.title === title)
  if (at === -1) return null
  const lines = content.split('\n')
  const next = all.slice(at + 1).find((heading) => heading.level <= 2)
  return lines.slice(all[at].line + 1, next ? next.line : lines.length).join('\n')
}

/** Targets of Markdown links and images outside code, with their line. */
export function links(content) {
  const found = []
  fences(content).prose.split('\n').forEach((line, index) => {
    for (const match of line.replace(/`[^`]*`/g, '').matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
      found.push({ target: match[1], line: index + 1 })
    }
  })
  return found
}

const START = (name) => `<!-- ${name}:start -->`
const END = (name) => `<!-- ${name}:end -->`

export const block = (name, body) => `${START(name)}\n${body}\n${END(name)}`

/** Replaces what sits between the two markers. null when a marker is missing. */
export function replaceBlock(content, name, body) {
  const from = content.indexOf(START(name))
  const to = content.indexOf(END(name))
  if (from === -1 || to === -1 || to < from) return null
  return content.slice(0, from) + block(name, body) + content.slice(to + END(name).length)
}

/** The same text without its rendered blocks, for rules about what an author wrote. */
export function withoutBlocks(content, names) {
  let out = content
  for (const name of names) out = replaceBlock(out, name, '') ?? out
  return out
}
