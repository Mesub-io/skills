# Testing a webhook handler

How to send a handler deliveries signed the way Mesub signs them, so the real verification runs in the test. Writing the handler itself is outside this skill.

## Build a delivery

```ts
const { body, headers } = await fake.webhook('subscription.renewed', {
    subscription: { external_id: 'user_42' },
});
```

- `body` is a string: the exact bytes that were signed.
- `headers` holds `webhook-id`, `webhook-timestamp` and `webhook-signature`.
- It is signed with `fake.webhookSecret`. `fake.client()` verifies with that same secret, so a handler given the fake's client accepts it. A handler that calls `verifyWebhook` by itself reads `MESUB_WEBHOOK_SECRET`: set it to `fake.webhookSecret` in the test's environment.

Types `fake.webhook` takes: `subscription.created`, `subscription.renewed`, `subscription.payment_failed`, `subscription.stopped`, `subscription.cancelled`, `subscription.resumed`, `subscription.ended`, `subscription.expired`, `test`.

What `fields` may set:

| Field | Default | What it is |
|---|---|---|
| `subscription` | active, paid, on `pro`, a made-up wallet, `external_id` and `email` null, id `sub_fake_1` and up | Any field of the subscription the event carries (`event.data`) |
| `detail` | a plausible one for the type | `event.data.detail` |
| `created_at` | now | When the event happened |
| `id` | a new `msg_fake_...` each time | The `webhook-id` header, which the SDK gives the handler as `event.id` |
| `timestamp` | now | The `webhook-timestamp` header, in Unix seconds |

Default details: `subscription.renewed` carries `amount` `"9990000"`, `mint`, `period_start`, `period_end`, `signature`. `subscription.payment_failed` carries `reason` `insufficient-balance`, `amount`, `mint`, the period, `next_retry_at` a day later, `retry_deadline` null, `retries_left` 1, `retry_mode` `scheduled`. `subscription.stopped` carries `reason`. The others carry an empty detail.

**Set what the handler reads.** The default subscription names no customer: a handler that looks the user up by `event.data.external_id` needs `subscription: { external_id }` in the test.

## Send it

The body goes out as the string that was signed, with the three headers:

```ts
await request(app).post('/webhooks/mesub').set(headers).type('json').send(body).expect(200);
```

In Next.js, call the handler: `POST(new Request(url, { method: 'POST', headers, body }))`. In NestJS, create the test application with `{ rawBody: true }` as `main.ts` does, and post with `supertest` the same way. Both were run against the fake.

Never send `JSON.parse(body)`: the test would then pass on a handler that verifies a body re-serialised by a JSON parser, which fails on real deliveries.

## The cases

| Case | How | Expected |
|---|---|---|
| A delivery Mesub signed | as above | 2xx, and the app did its work |
| A body changed after signing | `body.replace(...)` with the same headers | 400, and the app did nothing |
| Another endpoint's secret | `signWebhook(body, { secret: other })` | 400 |
| A replay | `fake.webhook(type, { timestamp })` more than 5 minutes old | 400 |
| A header missing | drop `webhook-signature` | 400 |
| The same delivery twice | the same `id`, sent twice | 2xx both times, the work done once |
| A type the handler does not know | `signWebhook` with a body of your own | 2xx, ignored |

The second row is the one that matters most: without it, a handler that verifies nothing passes every test. `assets/webhook.test.ts` holds the first six.

What verification throws, so the handler can be read against it: a `MesubError` with `code` `invalid_webhook` for a missing header, a signature that matches nothing, or a timestamp out of tolerance. A `TypeError` for an integration fault: a body already parsed, no secret, a secret that is not `whsec_...`. A handler that answers 400 on `MesubError` only will answer 500 when the app's JSON parser ran before it, and the first test above catches that.

## A body of your own

`signWebhook(payload, { secret, id?, timestamp? })` signs anything: an object is sent as its JSON, a string as it is. Use it for what `fake.webhook` does not build:

```ts
import { signWebhook } from '@mesub/node/testing';

const { body } = await fake.webhook('test');
const delivery = await signWebhook(
    { ...JSON.parse(body), test: true },
    { secret: fake.webhookSecret },
);
```

Two differences from what the docs describe, to know when the handler depends on them:

- A test delivery sent from the dashboard carries `"test": true` at the top of its body and a subscription whose id is `sub_test`. `fake.webhook('test')` sets neither. Build it as above when the handler recognises tests that way.
- The docs list an event `subscription.renewal_upcoming`. `fake.webhook('subscription.renewal_upcoming')` makes one when the installed copy types the event: look for the name in `node_modules/@mesub/node/dist/testing.d.ts`. With an older copy, sign one with `signWebhook`: verification still hands back a type it does not know.

## An event does not change the fake

`fake.webhook` adds nothing to the fake: after a `subscription.stopped` delivery, `/v1/access` still answers what the test last set. To test "the event arrives and the user is out", say both: `fake.deny(...)`, then send the event.

What the event does change is the client's cache. `mesub.webhooks.verify` drops every answer that client cached for the subscription's customer (by wallet, `external_id` and email), so the next check asks Mesub again. The standalone `verifyWebhook` holds no client and drops nothing. The last test of `assets/webhook.test.ts` shows it: with `revalidate_after: 60`, the paid route keeps answering 200 until the event lands, then 402.

## What the fake cannot tell

- Whether the endpoint's real signing secret is the one in the server's environment.
- Whether Mesub can reach the endpoint, and whether the handler answers within Mesub's time limit.

Both need a test delivery sent from the dashboard to the deployed endpoint, by the user.
