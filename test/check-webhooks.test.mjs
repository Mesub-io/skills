import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('../skills/mesub-webhooks/scripts/check-webhooks.mjs', import.meta.url))

/** Runs the check in a project with @mesub/node installed and these files. */
function check(files) {
  const root = mkdtempSync(join(tmpdir(), 'check-webhooks-'))
  try {
    const all = {
      'package.json': JSON.stringify({ dependencies: { '@mesub/node': '0.1.0' } }),
      'node_modules/@mesub/node/package.json': JSON.stringify({ version: '0.1.0' }),
      ...files,
    }
    for (const [path, text] of Object.entries(all)) {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), text)
    }
    const ran = spawnSync('node', [SCRIPT], { cwd: root, encoding: 'utf8' })
    return { status: ran.status, out: ran.stdout }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const ROUTE = [
  `app.post('/webhooks/mesub', express.raw({ type: 'application/json' }), async (req, res) => {`,
  `  try { const event = await mesub.webhooks.verify(req.body, req.headers); seen(event.id) } catch (error) { if (error instanceof MesubError) return res.sendStatus(400); throw error }`,
  `  res.sendStatus(200)`,
  `})`,
].join('\n')

test('a route registered before the global JSON parser, in the same file, passes', () => {
  const { out } = check({ 'src/app.ts': [`import { MesubError } from '@mesub/node'`, ROUTE, 'app.use(express.json())', ''].join('\n') })
  assert.match(out, /PASS  src\/app\.ts:3 is registered before the global JSON parser \(src\/app\.ts:6\)/)
})

test('a route registered after it warns that the body is consumed', () => {
  const { out } = check({ 'src/app.ts': [`import { MesubError } from '@mesub/node'`, 'app.use(express.json())', ROUTE, ''].join('\n') })
  assert.match(out, /WARN  src\/app\.ts:4 is registered after the global JSON parser \(src\/app\.ts:2\): the parser consumes the body first/)
})

test('a route mounted from another file is followed by its imported name', () => {
  const route = `import { MesubError } from '@mesub/node'\nexport function mountWebhook(app) {\n${ROUTE}\n}\n`
  const before = check({
    'src/webhook.ts': route,
    'src/app.ts': `import { mountWebhook } from './webhook.js'\nmountWebhook(app)\napp.use(express.json())\n`,
  })
  assert.match(before.out, /PASS  src\/webhook\.ts:4 is registered before the global JSON parser \(src\/app\.ts:3\)/)
  const after = check({
    'src/webhook.ts': route,
    'src/app.ts': `import { mountWebhook } from './webhook.js'\napp.use(express.json())\nmountWebhook(app)\n`,
  })
  assert.match(after.out, /WARN  src\/webhook\.ts:4 is registered after the global JSON parser/)
})

test('an order it cannot read gets the softer note', () => {
  const { out } = check({
    'src/webhook.ts': `import { MesubError } from '@mesub/node'\nexport function mountWebhook(app) {\n${ROUTE}\n}\n`,
    'src/server.ts': `app.use(express.json())\n`,
  })
  assert.match(out, /WARN  the app also has a global JSON parser \(src\/server\.ts:1\): check that the route of src\/webhook\.ts:4 is registered before it \(the order cannot be read here\)/)
})
