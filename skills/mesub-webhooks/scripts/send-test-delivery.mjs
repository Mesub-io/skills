#!/usr/bin/env node
// Usage: node --env-file=.env "<skill-dir>/scripts/send-test-delivery.mjs" <url> [--help]
//
// Posts five made-up deliveries to a webhook handler running on THIS machine
// and reports how it answers: one unsigned, one signed with another secret,
// one signed an hour ago, one signed correctly, and that one again.
//
// Network: it calls the given URL, which must be on localhost. Nothing else.
// It reads MESUB_WEBHOOK_SECRET from the environment to sign, the way Mesub
// does, and never shows it. It writes no file. Every delivery is a `test`
// event with "test": true and the subscription sub_test, which a handler
// must ignore.
//
// Exit 0: no FAIL. Exit 1: at least one FAIL. Exit 2: arguments not understood,
// no secret, or the server cannot be reached.
import { createHmac, randomBytes, randomUUID } from 'node:crypto'

const HELP = `Usage: node --env-file=.env "<skill-dir>/scripts/send-test-delivery.mjs" <url> [--help]

Posts five made-up Mesub deliveries to a handler on this machine and reports
how it answers. <url> is the handler's, on localhost:
  http://localhost:3000/webhooks/mesub

It signs with MESUB_WEBHOOK_SECRET, read from the environment and never shown:
load the file the server itself reads with --env-file, as above.
Each delivery is a "test" event about the subscription sub_test.

  --help          show this text

Each line is PASS, FAIL or WARN. Exit 0 when nothing FAILs, 1 otherwise.`

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(`${HELP}\n`)
  process.exit(0)
}
const stop = (message) => {
  process.stderr.write(`${message}\n\n${HELP}\n`)
  process.exit(2)
}
if (args.length !== 1 || args[0].startsWith('-')) stop(args.length === 0 ? 'Missing the handler URL.' : `Unknown argument: ${args.find((arg) => arg.startsWith('-')) ?? args[1]}`)

let url
try {
  url = new URL(args[0])
} catch {
  stop(`Not a URL: ${args[0]}`)
}
if (!/^https?:$/.test(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
  stop('The URL must be on localhost: this script never posts to a deployed endpoint.')
}

const secret = process.env.MESUB_WEBHOOK_SECRET
if (!secret) stop('MESUB_WEBHOOK_SECRET is not in the environment: load the server\'s env file with --env-file.')
if (!secret.startsWith('whsec_')) stop('MESUB_WEBHOOK_SECRET does not start with whsec_: it is not a signing secret.')

// What the dashboard's "Send test" posts, spaced the way no JSON writer would
// write it again: a handler that parses then serializes fails the signature.
const body = JSON.stringify(
  {
    type: 'test',
    created_at: new Date().toISOString(),
    data: {
      id: 'sub_test',
      status: 'active',
      paused: false,
      end_reason: null,
      late_reason: null,
      access: true,
      payment_status: 'paid',
      plan: 'pro',
      wallet: '11111111111111111111111111111111',
      email: 'subscriber@example.com',
      external_id: 'user_123',
      current_period_start: '2026-01-01T00:00:00.000Z',
      current_period_end: '2026-01-31T00:00:00.000Z',
      next_charge_at: '2026-01-31T00:00:00.000Z',
      next_retry_at: null,
      retry_deadline: null,
      next_retry_number: null,
      retries_allowed: null,
      access_until: '2026-01-31T00:00:00.000Z',
      created_at: '2026-01-01T00:00:00.000Z',
      confirmed_at: '2026-01-01T00:00:00.000Z',
      detail: {},
    },
    test: true,
  },
  null,
  3,
)

/** Standard Webhooks: HMAC-SHA256 of `id.timestamp.body`, keyed with the bytes after whsec_. */
function headersFor(key, id, timestamp) {
  const digest = createHmac('sha256', Buffer.from(key.slice('whsec_'.length), 'base64'))
    .update(`${id}.${timestamp}.${body}`)
    .digest('base64')
  return { 'webhook-id': id, 'webhook-timestamp': String(timestamp), 'webhook-signature': `v1,${digest}` }
}

async function post(headers) {
  const started = Date.now()
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
  })
  await response.arrayBuffer().catch(() => {})
  return { status: response.status, ms: Date.now() - started }
}

const now = Math.floor(Date.now() / 1000)
const id = `msg_local_${randomUUID()}`
const good = headersFor(secret, id, now)
const refused = (status) => status >= 400 && status < 500
const ok = (status) => status >= 200 && status < 300

const results = []
const report = (level, message) => results.push({ level, message })

/** One delivery that must be refused: a 2xx means anyone can post events. */
async function mustRefuse(name, headers) {
  const { status } = await post(headers)
  if (ok(status)) report('FAIL', `${name}: answered ${status}. The handler accepts a delivery that is not Mesub's`)
  else if (status === 404 || status === 405) report('WARN', `${name}: answered ${status}. No POST route there, so this proves nothing`)
  else if (refused(status)) report('PASS', `${name}: refused with ${status}`)
  else report('WARN', `${name}: answered ${status}, not a 4xx. It is refused, but as a fault of the server: answer 400`)
}

try {
  await mustRefuse('unsigned', {})
  await mustRefuse('signed with another secret', headersFor(`whsec_${randomBytes(24).toString('base64')}`, `msg_local_${randomUUID()}`, now))
  await mustRefuse('signed an hour ago', headersFor(secret, `msg_local_${randomUUID()}`, now - 3600))

  const first = await post(good)
  if (ok(first.status)) {
    report('PASS', `signed correctly: answered ${first.status} in ${first.ms} ms`)
    if (first.ms > 5000) report('WARN', `the answer took ${first.ms} ms: Mesub waits 10 seconds, answer before any slow work`)
  } else if (first.status >= 300 && first.status < 400) {
    report('FAIL', `signed correctly: answered ${first.status}, a redirect. Mesub counts it as a failure: is the route behind a login or a trailing slash?`)
  } else if (first.status === 401 || first.status === 403) {
    report('FAIL', `signed correctly: answered ${first.status}. The route is behind the app's own login or CSRF check: Mesub has no session`)
  } else if (first.status === 404 || first.status === 405) {
    report('FAIL', `signed correctly: answered ${first.status}. No POST route at ${url.pathname}`)
  } else {
    report('FAIL', `signed correctly: answered ${first.status}. The body was parsed before the check, or the server runs with another signing secret than this environment`)
  }

  if (ok(first.status)) {
    const again = await post(good)
    if (ok(again.status)) report('PASS', `the same delivery again: answered ${again.status}. Whether it was handled once is for you to read in the handler`)
    else report('FAIL', `the same delivery again: answered ${again.status}. A repeat must be answered 2xx, or Mesub keeps sending it`)
  }
} catch (error) {
  const reason = error?.cause?.code ?? error?.name ?? 'error'
  process.stderr.write(`Could not reach ${url.origin}${url.pathname} (${reason}). Is the server running?\n`)
  process.exit(2)
}

for (const { level, message } of results) process.stdout.write(`${level.padEnd(4)}  ${message}\n`)
const count = (level) => results.filter((result) => result.level === level).length
process.stdout.write(`\n${count('PASS')} passed, ${count('FAIL')} failed, ${count('WARN')} to look at\n`)
process.exit(count('FAIL') > 0 ? 1 : 0)
