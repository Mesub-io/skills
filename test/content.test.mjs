import assert from 'node:assert/strict'
import { test } from 'node:test'
import { contentFindings } from '../scripts/lib/content.mjs'

const rules = (text) => contentFindings(text).map((finding) => finding.rule)

test('what a skill may say passes', () => {
  for (const line of [
    'Import from `@mesub/node/testing` and `@mesub/react/styles.css`.',
    'console.error("MESUB_API_KEY is missing")',
    'Keys look like `SUB_...` and `PUB_...`.',
    'Set `NEXT_PUBLIC_MESUB_PUBLISHABLE_KEY` for the widget.',
    'Verify with the signing secret in `MESUB_WEBHOOK_SECRET`.',
    'The list is paginated with a cursor.',
    'const mesub = createMesub({ apiKey: process.env.MESUB_API_KEY })',
  ]) assert.deepEqual(rules(line), [], line)
})

test('client code may hold the publishable key, never the API key', () => {
  const client = (key) => `\`\`\`tsx\n"use client"\nimport { MesubProvider } from '@mesub/react'\nconst key = ${key}\n\`\`\`\n`
  assert.deepEqual(rules(client('process.env.NEXT_PUBLIC_MESUB_PUBLISHABLE_KEY')), [])
  assert.deepEqual(rules(client('process.env.MESUB_API_KEY')), ['content/api-key-exposure'])
})

test('server code beside client code in the same file is judged fence by fence', () => {
  const text = '```ts\nconst mesub = createMesub({ apiKey: process.env.MESUB_API_KEY })\n```\n\n```tsx\n"use client"\nexport function Button() {}\n```\n'
  assert.deepEqual(rules(text), [])
})

test('every spelling of the forbidden wording is caught', () => {
  for (const line of ['the Secret Key', 'MESUB_SECRET_KEY', 'secretKey', 'on Mainnet', 'solana:devnet', '@mesub/Node', '@mesub-io/node', 'open .cursor/rules']) {
    assert.equal(rules(line).length > 0, true, line)
  }
})
