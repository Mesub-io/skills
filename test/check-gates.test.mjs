import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('../skills/mesub-gate-access/scripts/check-gates.mjs', import.meta.url))

/** Runs the check in a project with @mesub/node installed and these files. */
function check(files) {
  const root = mkdtempSync(join(tmpdir(), 'check-gates-'))
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

const MESUB = [
  `import type { RequestHandler } from 'express'`,
  `import { Mesub } from '@mesub/node'`,
  `import { requirePlan } from '@mesub/node/express'`,
  `export const mesub = new Mesub()`,
  `const customer = (req) => (req.user ? { external_id: req.user.id } : null)`,
  `export const requirePro: RequestHandler = requirePlan('pro', { client: mesub, customer })`,
  '',
].join('\n')

test('a named guard lists the routes it guards, in another file', () => {
  const { out } = check({
    'src/mesub.ts': MESUB,
    'src/app.ts': [
      `import { requirePro } from './mesub.js'`,
      `app.get('/api/reports', requireUser, list)`,
      `app.get('/api/exports', requireUser, requirePro, exports)`,
      `router.use(requirePro)`,
      '',
    ].join('\n'),
  })
  assert.match(out, /PASS  gate: requirePlan on pro \(src\/mesub\.ts:6\), guards GET \/api\/exports \(src\/app\.ts:3\), every later route of its app or router \(src\/app\.ts:4\)/)
  assert.doesNotMatch(out, /\/api\/reports/)
})

test('a named guard used by no route warns', () => {
  const { out } = check({ 'src/mesub.ts': MESUB })
  assert.match(out, /WARN  gate: requirePlan on pro \(src\/mesub\.ts:6\) is defined but guards no route/)
})

test('an inline guard names its route', () => {
  const { out } = check({
    'src/app.ts': `import { requirePlan } from '@mesub/node/express'\napp.get('/api/exports', requirePlan('pro', { customer }), handler)\n`,
  })
  assert.match(out, /gate: requirePlan on pro \(src\/app\.ts:2\), guards GET \/api\/exports \(src\/app\.ts:2\)/)
})

test('a Next route handler names its path', () => {
  const { out } = check({
    'app/(paid)/api/exports/route.ts': `import { withMesub } from '@mesub/node/next'\nexport const GET = withMesub({ plan: 'pro', customer }, handler)\n`,
  })
  assert.match(out, /gate: withMesub on pro \(app\/\(paid\)\/api\/exports\/route\.ts:2\), guards GET \/api\/exports/)
})

test('a NestJS guard names the decorated route', () => {
  const { out } = check({
    'src/analytics.controller.ts': [
      `import { RequirePlan } from '@mesub/node/nest'`,
      `@Controller('analytics')`,
      `export class AnalyticsController {`,
      `  @UseGuards(AuthGuard, RequirePlan('pro', { customer: (req) => ({ external_id: req.user.id }) }))`,
      `  @Get('export')`,
      `  export() {}`,
      `}`,
      '',
    ].join('\n'),
  })
  assert.match(out, /gate: RequirePlan on pro \(src\/analytics\.controller\.ts:4\), guards GET \/analytics\/export/)
})
