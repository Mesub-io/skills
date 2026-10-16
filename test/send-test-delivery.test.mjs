import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHmac, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('../skills/mesub-webhooks/scripts/send-test-delivery.mjs', import.meta.url))
const SECRET = `whsec_${randomBytes(24).toString('base64')}`

/** A handler that checks the signature as Mesub signs, and keeps the bodies it accepted. */
async function withHandler(run) {
  const accepted = []
  const server = createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = Buffer.concat(chunks).toString('utf8')
    const id = req.headers['webhook-id']
    const timestamp = Number(req.headers['webhook-timestamp'])
    const expected = createHmac('sha256', Buffer.from(SECRET.slice(6), 'base64')).update(`${id}.${timestamp}.${body}`).digest('base64')
    const fresh = Math.abs(Date.now() / 1000 - timestamp) < 300
    if (req.headers['webhook-signature'] !== `v1,${expected}` || !fresh) return res.writeHead(400).end()
    accepted.push(JSON.parse(body))
    res.writeHead(200).end()
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    return await run(`http://127.0.0.1:${server.address().port}/webhooks/mesub`, accepted)
  } finally {
    server.close()
  }
}

/** Runs the script without blocking the handler, which lives in this process. */
function send(...args) {
  return new Promise((resolve) => {
    const child = spawn('node', [SCRIPT, ...args], { env: { ...process.env, MESUB_WEBHOOK_SECRET: SECRET } })
    let out = ''
    child.stdout.on('data', (chunk) => (out += chunk))
    child.on('close', (status) => resolve({ status, out }))
  })
}

test('by default the signed delivery is a test event', async () => {
  await withHandler(async (url, accepted) => {
    const { status, out } = await send(url)
    assert.equal(status, 0, out)
    assert.equal(accepted.length, 2)
    assert.equal(accepted[0].type, 'test')
    assert.equal(accepted[0].test, true)
    assert.equal(accepted[0].data.id, 'sub_test')
  })
})

test('--type sends a real event of that type, for that user', async () => {
  await withHandler(async (url, accepted) => {
    const { status, out } = await send(url, '--type', 'subscription.cancelled', '--external-id', 'user_ada', '--subscription', 'sub_42')
    assert.equal(status, 0, out)
    assert.match(out, /WARN  the signed deliveries are a real subscription\.cancelled about sub_42 \(external_id user_ada\)/)
    const [event] = accepted
    assert.equal(event.type, 'subscription.cancelled')
    assert.equal('test' in event, false)
    assert.equal(event.data.external_id, 'user_ada')
    assert.equal(event.data.id, 'sub_42')
    assert.equal(event.data.status, 'cancelled')
    assert.match(event.id, /^evt_local_/)
  })
})

test('an unknown type exits 2', () => {
  const ran = spawnSync('node', [SCRIPT, 'http://localhost:1/x', '--type', 'subscription.nope'], {
    encoding: 'utf8',
    env: { ...process.env, MESUB_WEBHOOK_SECRET: SECRET },
  })
  assert.equal(ran.status, 2)
  assert.match(ran.stderr, /Unknown event type: subscription\.nope/)
})

test('--type defaults to a subscription the handler does not drop as a test, and --sequence is sent', async () => {
  await withHandler(async (url, accepted) => {
    await send(url, '--type', 'subscription.access_revoked', '--sequence', '3')
    const event = accepted.find((one) => one.type === 'subscription.access_revoked')
    assert.notEqual(event.data.id, 'sub_test')
    assert.equal(event.sequence, 3)
  })
})
