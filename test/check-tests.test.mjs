import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('../skills/mesub-testing/scripts/check-tests.mjs', import.meta.url))

/** Runs the check in a project with @mesub/node and its testing entry installed, and these files. */
function check(files) {
  const root = mkdtempSync(join(tmpdir(), 'check-tests-'))
  try {
    const all = {
      'package.json': JSON.stringify({ dependencies: { '@mesub/node': '0.1.0' } }),
      'node_modules/@mesub/node/package.json': JSON.stringify({ version: '0.1.0', exports: { './testing': './dist/testing.js' } }),
      'src/app.ts': `import { requirePlan } from '@mesub/node/express'\nexport const app = 1\n`,
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

const HELPER = [
  `import { FakeMesub } from '@mesub/node/testing'`,
  `export function setup() {`,
  `  return new FakeMesub({ plans: ['pro'] })`,
  `}`,
  `export const subscriber = (fake, id) => fake.grant({ external_id: id }, 'pro')`,
  `export const outage = (fake) => fake.fail('outage')`,
  '',
].join('\n')

const CASES = [
  `import { setup, subscriber, outage } from './helpers/mesub'`,
  `test('lets a subscriber through', async () => { const fake = setup(); subscriber(fake, 'ada'); await agent.get('/x').expect(200) })`,
  `test('refuses', async () => { await agent.get('/x').expect(402) })`,
  `test('signed out', async () => { await request(app).get('/x').expect(401) })`,
  `test('outage', async () => { const fake = setup(); outage(fake); await agent.get('/x').expect(503) })`,
  '',
].join('\n')

test('a fake reached through a shared helper counts, with its cases', () => {
  const { status, out } = check({ 'test/helpers/mesub.ts': HELPER, 'test/paid.test.ts': CASES })
  assert.equal(status, 0, out)
  assert.match(out, /PASS  2 test file\(s\) use the fake .*\(some through a local helper\)|PASS  1 test file\(s\) use the fake/)
  assert.doesNotMatch(out, /^WARN/m, out)
})

test('a helper outside a test folder that only tests import warns, not fails', () => {
  const { status, out } = check({
    'src/test-support.ts': HELPER,
    'test/paid.test.ts': CASES.replace('./helpers/mesub', '../src/test-support'),
  })
  assert.equal(status, 0, out)
  assert.match(out, /WARN  src\/test-support\.ts:1 imports @mesub\/node\/testing and only tests import it/)
})

test('the fake in code that ships still fails', () => {
  const { status, out } = check({ 'src/app.ts': `import { FakeMesub } from '@mesub/node/testing'\nexport const app = 1\n` })
  assert.equal(status, 1)
  assert.match(out, /FAIL  src\/app\.ts:1 imports @mesub\/node\/testing from code that ships/)
})

test('access given by a create then a submit counts as a subscriber let through', () => {
  const { out } = check({
    'test/subscribe.test.ts': [
      `import { FakeMesub } from '@mesub/node/testing'`,
      `const fake = new FakeMesub()`,
      `test('subscribes', async () => {`,
      `  const created = await agent.post('/api/mesub/subscriptions').send({ plan: 'pro' })`,
      `  await agent.post(\`/api/mesub/subscriptions/\${created.body.subscription.id}/submit\`).send({})`,
      `  await agent.get('/x').expect(200)`,
      `})`,
      `test('refused', async () => { fake.reset(); await agent.get('/x').expect(402) })`,
      '',
    ].join('\n'),
  })
  assert.match(out, /PASS  a test lets a subscriber through/)
})

test('no grant and no subscribe still warns', () => {
  const { out } = check({
    'test/paid.test.ts': `import { FakeMesub } from '@mesub/node/testing'\nconst fake = new FakeMesub()\ntest('refused', async () => { await agent.get('/x').expect(402) })\n`,
  })
  assert.match(out, /WARN  no test covers both a subscriber let through/)
})
