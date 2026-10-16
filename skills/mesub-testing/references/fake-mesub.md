# The fake, in full

Everything `@mesub/node/testing` exports, read from the SDK's source at `@mesub/node` 0.1.0. The installed version is what runs: before using a name below, check it in `node_modules/@mesub/node/dist/testing.d.ts`.

The entry exports one class, `FakeMesub`, one function, `signWebhook`, and their types: `FakeMesubOptions`, `FakeAccess`, `FakeFailure`, `FakeRequest`, `FakePlanFields`, `FakeEventFields`, `FakeWebhookFields`, `SignedWebhook`, `SignWebhookOptions`. It brings no test framework and needs no other package. `@mesub/react` has no testing entry.

## What it is

`FakeMesub` is a fake Mesub API behind a `fetch`. The client the app uses stays the real `Mesub` class: its cache, its outage fallback, the guards, the widget routes and the webhook verification all run as in production. Only the network is replaced.

```ts
import { FakeMesub } from '@mesub/node/testing';

const fake = new FakeMesub({ plans: ['pro'] });
const mesub = fake.client(); // a real Mesub, wired to the fake
```

## Options of `new FakeMesub()`

| Option | Default | What it does |
|---|---|---|
| `plans` | every slug exists, and the plan list is empty | The plans that exist. Any other slug answers 404 `plan_not_found`. A slug alone, or an object with `slug` and the plan fields to answer. One given an `ends_at` is a plan with an end date (below) |
| `apiKey` | a made-up test key | The only key the fake accepts. No key answers 401 `missing_api_key`, any other `invalid_api_key` |
| `baseUrl` | `https://api.mesub.test` | Where the fake answers. May carry a path |
| `webhookSecret` | a fixed made-up `whsec_` value | What `webhook()` signs with and `client()` verifies with |
| `attemptsRoute` | `true` | `false` acts as a Mesub without the attempts route: it answers 404 there |
| `revalidateAfter` | Mesub's own | The `revalidate_after` of every access answer, in seconds. Left out, Mesub's: 10 for a no, and for a yes the time to its next charge, retry or end, from 10 to 300. `0` makes every change show on the next call of the same client. One set on an answer with `fields` wins |
| `accessEvents` | `false` | `true` raises `subscription.access_granted` / `subscription.access_revoked` when a change the fake makes flips access (a submit grants), and `subscription.paused` / `unpaused` from `park` / `unpark`, as Mesub will once it turns them on |
| `eventsSince` | 30 days before the fake was made | Mesub's `available_since`: events created before it are not served on `/v1/events` |
| `tier` | `dev` | The project's tier: `free`, `dev` or `business`. It decides what Pay now refuses and what a late `addSubscription` gets (`subscribing.md` in this folder). Newer than the rest: check it in the installed `dist/testing.d.ts` |

Always name `plans`. Without it a typo in a slug passes every test, and the widget routes answer 404 for every plan because they read the plan list.

A plan given as an object is a `FakePlanFields`: `slug` and any plan field, `token` given in part. A plan given as a slug is filled in: 9.99 USDC a month (`amount` `"9990000"`, `amount_display` `"9.99"`, `decimals` 6, `period_hours` 720), `status` `active`, `available` true, `ends_at` null.

### A plan's token and dollar value

A plan Mesub answers carries `token` (`symbol`, `name`, `logo_url`, `verified`) and `amount_usd`, a decimal string or null, and so does a plan of the fake. Both can be set when the plan is declared as an object, which is how to test a pricing page against the two cases that matter:

- a token that is not `verified`: the page must say so and show the mint, and must not print a symbol that came `null`;
- a plan whose `amount_usd` is `null`: the page shows the token amount alone, not `$0`.

These are newer than the rest of this file. Before writing either case, check the plan type and the `plans` option in the installed `dist/index.d.ts` and `dist/testing.d.ts` for the exact names, and for what a plan given as a slug carries: do not write them from this file. On a package without them, say so and leave the case unwritten rather than casting the plan to another type.

## Properties

- `fake.apiKey`, `fake.baseUrl`, `fake.webhookSecret`, `fake.fetch`: what a client of your own needs (below).
- `fake.requests`: every call received, oldest first. Each has `method`, `path` (such as `/v1/access`), `query`, `headers` (a `Headers`) and `body` (the parsed JSON of a POST).

## The client

`fake.client(options?)` builds a real `Mesub` with the fake's key, base URL, fetch and webhook secret, and `maxRetries: 0` so a failure shows at once. Any other client option passes through (`guardTimeout`, `maxStaleMs`, `cache`, `timeout`).

To build it yourself, for instance through the app's own factory:

```ts
import { Mesub } from '@mesub/node';

const mesub = new Mesub({
    apiKey: fake.apiKey,
    baseUrl: fake.baseUrl,
    fetch: fake.fetch,
    webhookSecret: fake.webhookSecret,
    maxRetries: 0, // without it an outage test waits for the retries
});
```

## Access answers

| Call | What that customer is then answered on that plan |
|---|---|
| `fake.grant(customer, plan, fields?)` | `access` true, `status` `active`, `payment_status` `paid`, plus `fields` |
| `fake.deny(customer, plan, fields?)` | `access` false, `status` `none` unless `fields` say otherwise |
| `fake.grantLastPeriod(customer, plan, endsAt, fields?)` | As `grant`, with `access_until` at `endsAt` and no charge ahead: the last period of a plan that ends then (below) |
| `fake.setAccess(customer, plan, fields)` | The answer for a customer with nothing, plus `fields` |

- `customer` is `{ external_id }`, `{ email }`, `{ wallet }` or a wallet string. **A customer is answered only as named**: one granted by wallet is not found by `external_id`. Grant under the name the app's `customer` function returns.
- `fields` is any field of an access answer except `plan`: `status`, `payment_status`, `late_reason`, `end_reason`, `blocked_since`, `blocked_reason`, `paused`, `cancelled_at`, `access_until`, `next_charge_at`, `next_retry_at`, `retry_deadline`, `current_period_end`, `subscribed_since`, `first_subscribed_at`, `wallet`, `attempts`, `revalidate_after`.
- A customer nobody set is answered `access` false, `status` `none`.
- Statuses an answer can carry: `pending`, `active`, `cancelled`, `unpaid`, `stopped`, `ended`, `failed`, `superseded`, `none`.
- `deny` always answers `access` false, whatever `fields` say. For a late payer who still has access, use `grant` with `{ status: 'unpaid', payment_status: 'late', late_reason: 'insufficient_balance' }`. Whether a late payer keeps access depends on the project's tier: ask the user which case is theirs rather than guess.
- **`revalidate_after` is Mesub's own by default**: a client keeps a yes up to five minutes and a no 10 seconds, so a change made after a client asked shows to a new client, not to that one. Build one client per test, or pass `new FakeMesub({ plans: ['pro'], revalidateAfter: 0 })` so every change shows on the next call; the outage fallback still keeps the last answer. Set it on one answer (seconds) to test the cache itself.
- All four return the answer they stored.

## A blocked subscription

On Mesub a charge can be blocked for a cause that is not the customer's: the status does not change, the answer carries `blocked_since` and `blocked_reason`, and access ends on `access_until`. In the fake both fields are `null` on every answer unless the test sets them, through `fields`:

```ts
const blocked = { blocked_since: new Date().toISOString(), blocked_reason: 'puller_not_allowed' } as const;
const inThreeDays = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();

// blocked, access still running
fake.grant({ external_id: 'user_42' }, 'pro', { ...blocked, access_until: inThreeDays });
// blocked, access over: the status still reads active
fake.deny({ external_id: 'user_42' }, 'pro', { ...blocked, status: 'active', payment_status: 'paid' });
```

`blocked_reason` is `puller_not_allowed`, `receiver_not_allowed`, `receiver_account_missing`, `receiver_account_frozen`, `mint_gone`, `mesub` or `null`. The fake serves what the test gave and works nothing out: it does not end access when `access_until` passes, and never blocks or unblocks by itself. These fields are newer than the rest: check `blocked_since` in the installed `dist/testing.d.ts` or `dist/index.d.ts` before using them, and tell the user when the package is behind.

## A plan with an end date

On Mesub nobody has access after a plan's end date, whatever `status` reads, and the last period has no charge ahead. The fake serves a plan that has an end the same way. Three ways to give it one:

```ts
const endsAt = new Date(Date.now() + 3 * 24 * 3600 * 1000); // a Date or an ISO string

fake.grantLastPeriod({ external_id: 'user_42' }, 'pro', endsAt); // this customer, in the plan's last period
fake.endPlan('pro'); // the plan reached its end, now or at the date given as a second argument
new FakeMesub({ plans: [{ slug: 'beta', ends_at: endsAt.toISOString() }] }); // from the start
```

| Call | What it does |
|---|---|
| `grantLastPeriod(customer, plan, endsAt, fields?)` | Gives the plan that end, and grants the customer: `active`, `paid`, `access_until` at the end, `next_charge_at` null |
| `endPlan(plan, at?)` | Sets the plan's end to `at`, now by default, and ends what the fake holds on it: an `active` or `unpaid` answer or subscription turns `ended` with `end_reason` `plan_ended`, a `cancelled` one `ended` with `cancelled`, all without access |
| `ends_at` in `plans` | The plan has that end from the start. An end set by the two calls above wins over it |

What the fake then answers for that plan, on `/v1/access`, `retrieve` and `list`:

- **Before the end**: no `access_until` later than the end, and no `next_charge_at` or `next_retry_at` dated at or after it. A `grant` with a later `access_until` is served cut at the end.
- **Once the end has passed**: `access` false and `access_until` null for everyone on it, with `status` left as it was until `endPlan` is called. That is the few minutes Mesub takes to end a subscription: `status: 'active'` with `access: false`. A guard answers 402 with `status: 'active'`.
- The plan is served with its `ends_at`, and `available` false once past it. `create` on it then answers 409 `plan_ended`.
- A submit on a plan that ends inside the 30 days lands with `access_until` at the plan's end and `next_charge_at` null.

`reset()` forgets an end set by `grantLastPeriod` or `endPlan`, and keeps one given in `plans`. The fake has no clock of its own: it compares the end with the real time, so a test of "the end passes" either sets a past date or moves the test framework's timers.

## Failures

```ts
fake.fail('outage'); // every call answers 503 `unavailable`, until fake.fail(null)
fake.fail({ status: 429, code: 'rate_limited', retryAfter: 2 });
fake.fail({ status: 401, code: 'invalid_api_key' });
```

`fail` takes `'outage'`, `null`, or `{ status, code, message?, retryable?, retryAfter? }`. `retryAfter` is in seconds and is sent as `Retry-After`; `retry_too_soon` without one gets the tier's first wait, 1200 (600 on `free`). The failure applies to every call, the plan reads and the subscription calls included. A wrong key is answered 401 before the failure is looked at.

## Reset

`fake.reset()` forgets every answer, subscription, attempt, failure and recorded request, and starts every id over (`sub_fake_1`, `msg_fake_1`...): a test makes the same ids whatever ran before. Each fake numbers its own. It keeps the options (`plans`, the key, the secret).

**It does not empty a client's cache.** A client built before `reset()` still holds the last answer for each customer it asked about, and serves it during an outage. Build a new client in the per-test setup, with `fake.client()`.

## Parked seats

`fake.park(id)` parks a held subscription's seat, as Mesub does when a project holds more subscribers than its tier allows: `paused` true, `next_charge_at` null, access and status unchanged. `fake.unpark(id)` brings it back. Both throw for an id the fake does not hold, and raise `subscription.paused` / `unpaused` only with `accessEvents`.

## Events

The fake records the events Mesub would raise for what it changes (`subscription.created` on a submit, `cancelled`, `resumed`, `ended` on a confirm, and the access events with `accessEvents`), and serves them on `/v1/events` (`mesub.events.list`, `retrieve`). It sends no webhook. `fake.addEvent(type, fields?)` records any other: `fields` is a `FakeEventFields` (`subscription`, `detail`, `created_at`, `id`, `sequence`), and the subscription defaults to the one the fake holds under `fields.subscription.id`. It changes nothing else: what the event says happened is not done.

## Webhooks, subscriptions, attempts

- `fake.webhook(type, fields?)` and `signWebhook(payload, options)`: `webhooks.md` in this folder.
- `fake.addSubscription(fields)` and `fake.setAttempts(id, attempts)`: `subscribing.md` in this folder.
