// What no skill may say. Each rule is mechanical: it catches the written form,
// review catches the rest.
import { fences } from './markdown.mjs'
import { PACKAGES } from './mould.mjs'

const EM_DASH = String.fromCharCode(0x2014)
const PUBLIC_PREFIX = '(?:NEXT_PUBLIC|VITE|REACT_APP|EXPO_PUBLIC|NUXT_PUBLIC|GATSBY|PUBLIC)'
// A use of the key's value, not of its name in a sentence.
const KEY_VALUE = /process\.env\.MESUB_API_KEY|\$\{?MESUB_API_KEY|(?<!["'`\w])apiKey\b(?!["'`:])/
const LOG_CALL = /\b(console\.\w+|logger\.\w+|log\.\w+|print|printf|echo)\b/
// One kit for every agent: no vendor, none of their tools or folders.
const VENDORS = /\b(Claude|Anthropic|Codex|OpenAI|ChatGPT|Cursor|Copilot|Gemini|Windsurf|Cline|OpenCode)\b/
const VENDOR_TOOLS = /\b(TodoWrite|AskUserQuestion|WebFetch|WebSearch|apply_patch)\b|\.(claude|cursor|codex|gemini)\/|\b(CLAUDE|GEMINI)\.md\b|\.cursorrules\b/
const CLIENT_CODE = /["']use client["']|from\s+["']@mesub\/react/

/** Em dashes: the one rule applied to every file of the repository. */
export function emDashes(text) {
  const found = []
  text.split('\n').forEach((line, index) => {
    if (line.includes(EM_DASH)) found.push({ rule: 'content/em-dash', line: index + 1, message: 'em dash: use a comma, a colon or a full stop' })
  })
  return found
}

/** @returns {{ rule: string, line: number, message: string }[]} */
export function contentFindings(text) {
  const found = emDashes(text)
  const add = (rule, line, message) => found.push({ rule, line, message })

  text.split('\n').forEach((raw, index) => {
    const line = index + 1
    if (/secret[\s_-]?key/i.test(raw)) add('content/secret-key', line, 'say "API key", never "secret key"')
    const vendor = raw.match(VENDORS) ?? raw.match(VENDOR_TOOLS)
    if (vendor) add('content/vendor', line, `"${vendor[0]}": write for "the agent", whichever it is`)
    if (/\b(devnet|mainnet)\b/i.test(raw)) add('content/network', line, 'a skill names neither devnet nor mainnet')

    for (const match of raw.matchAll(/@mesub[\w-]*\/[\w-]+/gi)) {
      if (!PACKAGES.includes(match[0])) add('content/package-name', line, `"${match[0]}": the packages are exactly ${PACKAGES.join(' and ')}`)
    }
    if (/(?<![\w/])@?mesub-(node|react)\b/i.test(raw)) add('content/package-name', line, `the packages are exactly ${PACKAGES.join(' and ')}`)

    if (/\bSUB_[A-Za-z0-9]{8,}\b/.test(raw)) add('content/api-key-exposure', line, 'a literal API key: read it from the server environment (MESUB_API_KEY)')
    if (new RegExp(`\\b${PUBLIC_PREFIX}_[A-Z0-9_]*API_KEY\\b`).test(raw)) {
      add('content/api-key-exposure', line, 'an API key in a variable the bundler ships to the browser')
    }
    if (LOG_CALL.test(raw) && KEY_VALUE.test(raw)) add('content/api-key-exposure', line, 'an API key written to a log')
  })

  // Client code that reads the API key, fence by fence, or the whole file for an asset.
  const { blocks } = fences(text)
  const units = blocks.length > 0 ? blocks.map((block) => block.text) : [text]
  for (const unit of units) {
    if (CLIENT_CODE.test(unit) && /MESUB_API_KEY|\bapiKey\b/.test(unit)) {
      const line = text.split('\n').findIndex((raw) => /MESUB_API_KEY|\bapiKey\b/.test(raw) && unit.includes(raw)) + 1
      add('content/api-key-exposure', line, 'an API key in client code: only the publishable key may reach the browser')
    }
  }
  return found
}
