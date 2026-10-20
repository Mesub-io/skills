#!/usr/bin/env node
// Usage: node --env-file=.env "<skill-dir>/scripts/send-test-delivery.mjs" <url> [--type <event type>] [--external-id <id>] [--subscription <id>] [--network <cluster>] [--help]
//
// Posts five made-up deliveries to a webhook handler running on THIS machine
// and reports how it answers: one unsigned, one signed with another secret,
// one signed an hour ago, one signed correctly, and that one again.
//
// Network: it calls the given URL, which must be on localhost. Nothing else.
// It reads MESUB_WEBHOOK_SECRET from the environment to sign, the way Mesub
// does, and never shows it. It writes no file. By default every delivery is a
// `test` event with "test": true and the subscription sub_test, which a
// handler must ignore, in the body Mesub sends since api_version 2026-10-02.
// With --type, the body is a real event of that type, without "test": the
// handler acts on it, so run it against a development database only.
//
// Exit 0: no FAIL. Exit 1: at least one FAIL. Exit 2: arguments not understood,
// no secret, or the server cannot be reached.
import { createHmac, randomBytes, randomUUID } from 'node:crypto'

// The types @mesub/node reads, `test` aside: its WebhookEvent.
const TYPES = [
  'subscription.created', 'subscription.renewal_upcoming', 'subscription.renewed',
  'subscription.payment_failed', 'subscription.stopped', 'subscription.cancelled',
  'subscription.resumed', 'subscription.ended', 'subscription.expired',
  'subscription.access_granted', 'subscription.access_revoked', 'subscription.paused',
  'subscription.unpaused',
]

const HELP = `Usage: node --env-file=.env "<skill-dir>/scripts/send-test-delivery.mjs" <url> [options]

Posts five made-up Mesub deliveries to a handler on this machine and reports
how it answers. <url> is the handler's, on localhost:
  http://localhost:3000/webhooks/mesub

It signs with MESUB_WEBHOOK_SECRET, read from the environment and never shown:
load the file the server itself reads with --env-file, as above.
By default each delivery is a "test" event about the subscription sub_test,
which a handler must ignore: it proves the check, not a branch.

  --type <event type>     send a real event of that type instead, without
                          "test": true, so the handler's branch for it runs.
                          It acts on it: use a development database. One of
                          ${TYPES.join(', ')}.
  --external-id <id>      the subscription's external_id (default user_123),
                          to reach a user of the development database
  --subscription <id>     the subscription's id (default sub_test, or sub_local_1
                          with --type: a handler drops sub_test as a test delivery)
  --sequence <n>          the event's sequence, 1 or more (default 1): raise it to
                          send a later access event about the same subscription
  --network <cluster>     the body's "network": the Solana cluster the project
                          runs on, as Solana names it. Left out, mainnet-beta,
                          production's; devnet for a project of the dev
                          environment. @mesub/node refuses a body without it.
  --help                  show this text

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
/** The value of `--name value`, taken out of args, or the fallback. */
function option(name, fallback) {
  const at = args.indexOf(name)
  if (at === -1) return fallback
  const value = args[at + 1]
  if (!value || value.startsWith('-')) stop(`${name} needs a value.`)
  args.splice(at, 2)
  return value
}
// Production's cluster by default. A project of the dev environment (api-dev.mesub.io) is on devnet.
const network = option('--network', 'mainnet-beta')
const type = option('--type', 'test')
const externalId = option('--external-id', 'user_123')
if (type !== 'test' && !TYPES.includes(type)) stop(`Unknown event type: ${type}. One of: ${TYPES.join(', ')}.`)
const real = type !== 'test'
const subscriptionId = option('--subscription', real ? 'sub_local_1' : 'sub_test')
const sequence = Number(option('--sequence', '1'))
if (!Number.isInteger(sequence) || sequence < 1) stop('--sequence takes a whole number, 1 or more.')
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

const now = new Date()
const iso = (days) => new Date(now.getTime() + days * 86_400_000).toISOString()
const AMOUNT = '9990000'
// A made-up mint: the handler must not need a real one to run its branch.
const MINT = 'So11111111111111111111111111111111111111112'

/** The subscription as the event carries it: active and paid, then moved by the type. */
const subscription = {
  id: subscriptionId,
  status: 'active',
  paused: false,
  end_reason: null,
  late_reason: null,
  stop_reason: null,
  access: true,
  payment_status: 'paid',
  blocked_since: null,
  blocked_reason: null,
  plan: 'pro',
  wallet: '11111111111111111111111111111111',
  email: 'subscriber@example.com',
  external_id: externalId,
  current_period_start: iso(-10),
  current_period_end: iso(20),
  next_charge_at: iso(20),
  next_retry_at: null,
  retry_deadline: null,
  next_retry_number: null,
  retries_allowed: null,
  access_until: iso(20),
  closable: false,
  closable_from: null,
  created_at: iso(-10),
  confirmed_at: iso(-10),
}
const over = { access: false, next_charge_at: null, access_until: null }
/** Per type: what moves on the subscription, and the event's detail. */
const SHAPES = {
  test: [{}, {}],
  'subscription.created': [{}, { first_payment: { amount: AMOUNT, mint: MINT, signature: null } }],
  'subscription.renewal_upcoming': [{}, { can_pay: true, renewal_issue: null, amount: AMOUNT, mint: MINT, due_at: iso(20) }],
  'subscription.renewed': [{}, { amount: AMOUNT, mint: MINT, period_start: iso(-10), period_end: iso(20), signature: 'made_up_signature' }],
  'subscription.payment_failed': [
    { status: 'unpaid', payment_status: 'late', late_reason: 'insufficient_balance', next_retry_at: iso(1), retry_deadline: iso(7), next_retry_number: 1, retries_allowed: 3 },
    { reason: 'insufficient_balance', amount: AMOUNT, mint: MINT, period_start: iso(-10), period_end: iso(20), next_retry_at: iso(1), retry_deadline: iso(7), retries_left: 3, retry_mode: 'scheduled' },
  ],
  'subscription.stopped': [{ status: 'stopped', payment_status: 'late', stop_reason: 'out_of_retries', ...over }, { reason: 'out_of_retries' }],
  'subscription.cancelled': [{ status: 'cancelled', next_charge_at: null }, {}],
  'subscription.resumed': [{}, {}],
  'subscription.ended': [{ status: 'ended', end_reason: 'cancelled', ...over }, { changed_at: now.toISOString(), end_reason: 'cancelled' }],
  'subscription.expired': [{ status: 'expired', payment_status: 'none', confirmed_at: null, ...over }, {}],
  'subscription.access_granted': [{}, { changed_at: now.toISOString(), blocked_reason: null, access_until: iso(20) }],
  'subscription.access_revoked': [{ status: 'ended', end_reason: 'cancelled', ...over }, { changed_at: now.toISOString(), blocked_reason: null, access_until: null }],
  'subscription.paused': [{ paused: true, next_charge_at: null }, {}],
  'subscription.unpaused': [{}, {}],
}
const [moved, detail] = SHAPES[type]

// What the dashboard's "Send test" posts, spaced the way no JSON writer would
// write it again: a handler that parses then serializes fails the signature.
// `detail` sits at the top of the body, beside `data`, not inside it.
const body = JSON.stringify(
  {
    id: real ? `evt_local_${randomUUID()}` : 'evt_test',
    object: 'event',
    type,
    created_at: now.toISOString(),
    network,
    api_version: '2026-10-02',
    // Always 1 on a test delivery, as Mesub sends it.
    sequence,
    data: { ...subscription, ...moved },
    detail,
    // A real event carries no "test": the handler must act on it.
    ...(real ? {} : { test: true }),
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

const seconds = Math.floor(Date.now() / 1000)
const id = `msg_local_${randomUUID()}`
const good = headersFor(secret, id, seconds)
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

if (real) report('WARN', `the signed deliveries are a real ${type} about ${subscriptionId} (external_id ${externalId}), without "test": the handler's branch for it ran unless the handler skips it (an id it treats as a test, a sequence at or below one applied). Check its effect in the development database`)

try {
  await mustRefuse('unsigned', {})
  await mustRefuse('signed with another secret', headersFor(`whsec_${randomBytes(24).toString('base64')}`, `msg_local_${randomUUID()}`, seconds))
  await mustRefuse('signed an hour ago', headersFor(secret, `msg_local_${randomUUID()}`, seconds - 3600))

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
    report('FAIL', `signed correctly: answered ${first.status}. The body was parsed before the check, the server runs with another signing secret than this environment, or the installed @mesub/node predates the body with detail at the top (its log says it cannot read the webhook)`)
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
