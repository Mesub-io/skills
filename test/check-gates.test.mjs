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

test('hasAccess kept in a variable without await and read as a boolean fails', () => {
  const { status, out } = check({
    'src/app.ts': [
      `import { mesub } from './mesub.js'`,
      `app.get('/api/exports', async (req, res) => {`,
      `  const ok = mesub.hasAccess({ external_id: req.user.id }, 'pro')`,
      `  if (!ok) return res.status(402).end()`,
      `  res.json(await exports())`,
      `})`,
      `export async function isPro(id) {`,
      `  const answer = mesub.access({ external_id: id }, 'pro')`,
      `  return answer.access`,
      `}`,
      '',
    ].join('\n'),
  })
  assert.equal(status, 1, out)
  assert.match(out, /FAIL  src\/app\.ts:3 keeps hasAccess in ok without await and reads it as an answer \(src\/app\.ts:4\): a promise is always truthy/)
  assert.match(out, /FAIL  src\/app\.ts:8 keeps access in answer without await and reads it as an answer \(src\/app\.ts:9\)/)
})

test('a promise kept in a variable and awaited later, or returned, passes', () => {
  const { out } = check({
    'src/app.ts': [
      `import { mesub } from './mesub.js'`,
      `export async function isPro(id) {`,
      `  const pending = mesub.hasAccess({ external_id: id }, 'pro')`,
      `  const ok = await pending`,
      `  if (!ok) return false`,
      `  return true`,
      `}`,
      `export const check = (id) => mesub.hasAccess({ external_id: id }, 'pro')`,
      '',
    ].join('\n'),
  })
  assert.doesNotMatch(out, /without await/)
})

test('a try over several lines whose catch answers "no" warns, nested braces and a 402 included', () => {
  const { out } = check({
    'src/app.ts': [
      `import { mesub } from './mesub.js'`,
      `export async function hasPro(id) {`,
      `  try {`,
      `    return await mesub.hasAccess({ external_id: id }, 'pro')`,
      `  } catch (error) {`,
      `    if (error instanceof Error) { log(error.message) }`,
      `    return false`,
      `  }`,
      `}`,
      `app.get('/api/exports', async (req, res) => {`,
      `  try {`,
      `    const ok = await mesub.hasAccess({ external_id: req.user.id }, 'pro')`,
      `    if (!ok) return res.status(402).end()`,
      `    res.json(await exports())`,
      `  } catch (error) {`,
      `    res.status(402).json({ error: 'subscribe first' })`,
      `  }`,
      `})`,
      '',
    ].join('\n'),
  })
  assert.match(out, /WARN  src\/app\.ts:4 sits in a try whose catch seems to answer "no"/)
  assert.match(out, /WARN  src\/app\.ts:12 sits in a try whose catch seems to answer "no"/)
})

test('a try whose catch rethrows or answers 503 does not warn', () => {
  const { out } = check({
    'src/app.ts': [
      `import { mesub } from './mesub.js'`,
      `app.get('/api/exports', async (req, res) => {`,
      `  try {`,
      `    const ok = await mesub.hasAccess({ external_id: req.user.id }, 'pro')`,
      `    if (!ok) return res.status(402).end()`,
      `    res.json(await exports())`,
      `  } catch (error) {`,
      `    if (error instanceof Error) { log(error.message) }`,
      `    res.status(503).end()`,
      `  }`,
      `})`,
      '',
    ].join('\n'),
  })
  assert.doesNotMatch(out, /seems to answer "no"/)
})
