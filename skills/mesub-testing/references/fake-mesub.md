# The fake, in full

Everything `@mesub/node/testing` exports, read from the SDK's source at `@mesub/node` 0.1.0. The installed version is what runs: before using a name below, check it in `node_modules/@mesub/node/dist/testing.d.ts`.

The entry exports one class, `FakeMesub`, one function, `signWebhook`, and their types: `FakeMesubOptions`, `FakeAccess`, `FakeFailure`, `FakeRequest`, `FakeWebhookFields`, `SignedWebhook`, `SignWebhookOptions`. It brings no test framework and needs no other package. `@mesub/react` has no testing entry.

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
| `apiKey` | a made-up test key | The only key the fake accepts. Any other answers 401 `invalid_api_key` |
| `baseUrl` | `https://api.mesub.test` | Where the fake answers. May carry a path |
| `webhookSecret` | a fixed made-up `whsec_` value | What `webhook()` signs with and `client()` verifies with |
| `attemptsRoute` | `true` | `false` acts as a Mesub without the attempts route: it answers 404 there |

Always name `plans`. Without it a typo in a slug passes every test, and the widget routes answer 404 for every plan because they read the plan list.

A plan given as a slug is filled in: 9.99 USDC a month (`amount` `"9990000"`, `amount_display` `"9.99"`, `decimals` 6, `period_hours` 720), `status` `active`, `available` true, `ends_at` null.

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
- `fields` is any field of an access answer except `plan`: `status`, `payment_status`, `late_reason`, `end_reason`, `paused`, `cancelled_at`, `access_until`, `next_charge_at`, `next_retry_at`, `retry_deadline`, `current_period_end`, `subscribed_since`, `first_subscribed_at`, `wallet`, `attempts`, `revalidate_after`.
- A customer nobody set is answered `access` false, `status` `none`.
- Statuses an answer can carry: `pending`, `active`, `cancelled`, `unpaid`, `stopped`, `ended`, `failed`, `superseded`, `none`.
- `deny` always answers `access` false, whatever `fields` say. For a late payer who still has access, use `grant` with `{ status: 'unpaid', payment_status: 'late', late_reason: 'insufficient_balance' }`. Whether a late payer keeps access depends on the project's tier: ask the user which case is theirs rather than guess.
- **`revalidate_after` is 0 by default**: the answer is stale at once, so a change shows on the next call, and the outage fallback still keeps it. Set it (seconds) only to test the cache itself.
- All four return the answer they stored.

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

`fail` takes `'outage'`, `null`, or `{ status, code, message?, retryable?, retryAfter? }`. `retryAfter` is in seconds and is sent as `Retry-After`. The failure applies to every call, the plan reads and the subscription calls included. A wrong key is answered 401 before the failure is looked at.

## Reset

`fake.reset()` forgets every answer, subscription, attempt, failure and recorded request. It keeps the options (`plans`, the key, the secret).

**It does not empty a client's cache.** A client built before `reset()` still holds the last answer for each customer it asked about, and serves it during an outage. Build a new client in the per-test setup, with `fake.client()`.

## Webhooks, subscriptions, attempts

- `fake.webhook(type, fields?)` and `signWebhook(payload, options)`: `webhooks.md` in this folder.
- `fake.addSubscription(fields)` and `fake.setAttempts(id, attempts)`: `subscribing.md` in this folder.
