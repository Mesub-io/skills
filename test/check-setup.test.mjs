import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('../skills/mesub-quickstart/scripts/check-setup.mjs', import.meta.url))

/** Runs the check in a server-only project with @mesub/node installed and these files. */
function check(files, ...flags) {
  const root = mkdtempSync(join(tmpdir(), 'check-setup-'))
  try {
    const all = {
      'package.json': JSON.stringify({ dependencies: { '@mesub/node': '0.1.0', express: '5.0.0' } }),
      'node_modules/@mesub/node/package.json': JSON.stringify({ version: '0.1.0' }),
      ...files,
    }
    for (const [path, text] of Object.entries(all)) {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), text)
    }
    const ran = spawnSync('node', [SCRIPT, '--server-only', ...flags], { cwd: root, encoding: 'utf8' })
    return { status: ran.status, out: ran.stdout }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const EMPTY = { 'src/app.ts': `import express from 'express'\nexport const app = express()\n` }
const ROUTES = {
  'src/app.ts': [
    `import express from 'express'`,
    `import { Mesub } from '@mesub/node'`,
    `import { mesubRoutes } from '@mesub/node/express'`,
    `const mesub = new Mesub()`,
    `export const app = express()`,
    `app.use('/api/mesub', mesubRoutes({ client: mesub, customer: (req) => ({ external_id: req.user.id }) }))`,
    '',
  ].join('\n'),
}
const GATE = {
  'src/app.ts': ROUTES['src/app.ts'] + `import { requirePlan } from '@mesub/node/express'\napp.get('/x', requirePlan('pro', { client: mesub, customer: (req) => ({ external_id: req.user.id }) }))\n`,
}

test('a project with no widget routes and no gate fails, even with --no-gate-yet', () => {
  for (const flags of [[], ['--no-gate-yet']]) {
    const { status, out } = check(EMPTY, ...flags)
    assert.equal(status, 1, out)
    assert.match(out, /FAIL  nothing is wired/)
  }
})

test('routes but no gate fail, unless --no-gate-yet', () => {
  const failed = check(ROUTES)
  assert.equal(failed.status, 1, failed.out)
  assert.match(failed.out, /FAIL  no route is gated: .*--no-gate-yet/)
  const allowed = check(ROUTES, '--no-gate-yet')
  assert.match(allowed.out, /WARN  no route is gated yet \(--no-gate-yet\)/)
  assert.doesNotMatch(allowed.out, /FAIL  no route is gated/)
})

test('routes and a gate pass that check', () => {
  const { out } = check(GATE)
  assert.match(out, /PASS  a route asks Mesub for access/)
})

test('a missing key says when it throws', () => {
  const { out } = check(GATE)
  assert.match(out, /WARN  MESUB_API_KEY is in no env file here: .*at import \(at build under Next\).*first request/)
})

test('an unknown flag exits 2', () => {
  const ran = spawnSync('node', [SCRIPT, '--nope'], { encoding: 'utf8' })
  assert.equal(ran.status, 2)
})

const CLIENT = `import { Mesub } from '@mesub/node'\nexport const mesub = new Mesub()\n`

test('a gate that imports the app client through a tsconfig path counts', () => {
  const { out } = check({
    ...ROUTES,
    'tsconfig.json': `{\n  // comments are allowed here\n  "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["./src/*"], }, },\n}\n`,
    'src/lib/mesub.ts': CLIENT,
    'src/app/reports/page.tsx': `import { mesub } from '@/lib/mesub'\nexport default async function Page() { if (!(await mesub.hasAccess({ external_id: 'x' }, 'pro'))) return null; return 'ok' }\n`,
  })
  assert.match(out, /PASS  a route asks Mesub for access \(src\/app\/reports\/page\.tsx\)/)
})

test('a gate that imports the app client by a relative path counts, .js specifier included', () => {
  const { out } = check({
    ...ROUTES,
    'src/mesub.ts': CLIENT,
    'src/reports.ts': `import { mesub } from './mesub.js'\nexport const ok = (id: string) => mesub.hasAccess({ external_id: id }, 'pro')\n`,
  })
  assert.match(out, /PASS  a route asks Mesub for access \(src\/reports\.ts\)/)
})

test('a file that only names hasAccess, without reaching the client, is not a gate', () => {
  const { status, out } = check({ ...ROUTES, 'src/other.ts': `export const hasAccess = () => true\nhasAccess()\n` })
  assert.equal(status, 1, out)
  assert.match(out, /FAIL  no route is gated/)
})

test('a customer read from the query string or the path fails, from the body warns', () => {
  const query = check({
    'src/app.ts': ROUTES['src/app.ts'].replace('req.user.id', 'req.query.user'),
  })
  assert.equal(query.status, 1, query.out)
  assert.match(query.out, /FAIL  src\/app\.ts:6 takes the customer from the URL/)
  const search = check({
    'src/mesub.ts': CLIENT,
    'src/route.ts': `import { mesub } from './mesub'\nimport { mesubRouteHandlers } from '@mesub/node/next'\nexport const h = { customer: (request) => ({ external_id: new URL(request.url).searchParams.get('id') }) }\n`,
  }, '--no-gate-yet')
  assert.match(search.out, /FAIL  src\/route\.ts:3 takes the customer from the URL/)
  const body = check({ 'src/app.ts': ROUTES['src/app.ts'].replace('req.user.id', 'req.body.user') })
  assert.match(body.out, /WARN  src\/app\.ts:6 seems to take the customer from the request body/)
})
