import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('../skills/mesub-subscribe-and-manage/scripts/check-wallet-side.mjs', import.meta.url))

/** Runs the check in a Next project with both packages installed, the routes mounted and these files. */
function check(files) {
  const root = mkdtempSync(join(tmpdir(), 'check-wallet-side-'))
  try {
    const all = {
      'package.json': JSON.stringify({ dependencies: { '@mesub/node': '0.1.0', '@mesub/react': '0.1.0', next: '15.0.0' } }),
      'node_modules/@mesub/node/package.json': JSON.stringify({ version: '0.1.0' }),
      'node_modules/@mesub/react/package.json': JSON.stringify({ version: '0.1.0' }),
      'lib/mesub.ts': `import { Mesub } from '@mesub/node'\nexport const mesub = new Mesub()\n`,
      'app/api/mesub/[...mesub]/route.ts': `import { mesubRouteHandlers } from '@mesub/node/next'\nexport const { GET, POST } = mesubRouteHandlers({ customer: async () => null })\n`,
      'app/layout.tsx': `import '@mesub/react/styles.css'\nimport { MesubProvider } from '@mesub/react'\nexport default function L({ children }) { return <MesubProvider endpoint="/api/mesub" chain="solana:mainnet">{children}</MesubProvider> }\n`,
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

const BUTTON = (extra) => `'use client'\nimport { SubscribeButton } from '@mesub/react'\nexport function Pay() {\n  return <SubscribeButton plan="pro" onSubscribed={() => { ${extra} }} />\n}\n`

test('a provider with chain, a button that refetches and no cancel route pass', () => {
  const { status, out } = check({ 'components/pay.tsx': BUTTON('router.refresh()') })
  assert.equal(status, 0, out)
  assert.match(out, /PASS  app\/layout\.tsx:3 sets chain/)
  assert.match(out, /PASS  no access flag kept in localStorage/)
  assert.doesNotMatch(out, /cancel route/)
})

test('a provider without chain warns', () => {
  const { out } = check({
    'app/layout.tsx': `import '@mesub/react/styles.css'\nimport { MesubProvider } from '@mesub/react'\nexport default function L({ children }) { return <MesubProvider endpoint="/api/mesub">{children}</MesubProvider> }\n`,
  })
  assert.match(out, /WARN  app\/layout\.tsx:3 sets no chain, so the wallet signs on the test network/)
})

test('an unlock flag in localStorage or sessionStorage fails', () => {
  for (const store of ['localStorage', 'sessionStorage']) {
    const { status, out } = check({ 'components/pay.tsx': BUTTON(`${store}.setItem('unlocked', '1')`) })
    assert.equal(status, 1, out)
    assert.match(out, new RegExp(`FAIL  components/pay\\.tsx:4 keeps something about access in ${store}`))
  }
})

test('a page that reads an access flag from storage fails, an unrelated one passes', () => {
  const gated = check({ 'app/reports/view.tsx': `'use client'\nexport function View() { return localStorage.getItem('pro_unlocked') ? 'secret' : null }\n` })
  assert.equal(gated.status, 1, gated.out)
  assert.match(gated.out, /FAIL  app\/reports\/view\.tsx:2 keeps something about access in localStorage/)
  const theme = check({ 'app/theme.tsx': `'use client'\nexport const dark = () => localStorage.getItem('theme') === 'dark'\n` })
  assert.equal(theme.status, 0, theme.out)
})

test('a cancel route that hands nothing to the wallet fails, without any confirmCancel in sight', () => {
  const { status, out } = check({
    'app/api/cancel/route.ts': `import { mesub } from '@/lib/mesub'\nexport async function POST() {\n  await db.users.update({ cancelled: true })\n  return Response.json({ ok: true })\n}\n`,
  })
  assert.equal(status, 1, out)
  assert.match(out, /FAIL  app\/api\/cancel\/route\.ts:2 is a cancel route that hands no transaction to the wallet/)
})

test('a server cancel that drops its transaction fails, one that returns it passes', () => {
  const dropped = check({
    'server/app.ts': `import { mesub } from '../lib/mesub'\napp.post('/subscriptions/:id/stop', async (req, res) => {\n  await mesub.subscriptions.cancel(req.params.id)\n  res.json({ ok: true })\n})\n`,
  })
  assert.equal(dropped.status, 1, dropped.out)
  assert.match(dropped.out, /FAIL  server\/app\.ts:3 builds a cancellation and drops its transaction/)
  const handed = check({
    'server/app.ts': [
      `import { mesub } from '../lib/mesub'`,
      `app.post('/subscriptions/:id/cancel', async (req, res) => {`,
      `  const built = await mesub.subscriptions.cancel(req.params.id)`,
      `  res.json({ transaction: built.transaction })`,
      `})`,
      `app.post('/subscriptions/:id/cancel/confirm', async (req, res) => res.json(await mesub.subscriptions.confirmCancel(req.params.id, { signature: req.body.signature })))`,
      `// external_id checked in theirs(), reason_code read by the page`,
      '',
    ].join('\n'),
  })
  assert.doesNotMatch(handed.out, /FAIL .*cancel/, handed.out)
  assert.match(handed.out, /PASS  no server route claims to cancel without the wallet/)
})
