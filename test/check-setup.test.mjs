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
