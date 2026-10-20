# Trying a handler before real events

Four ways, from the cheapest. The first two need nothing from the dashboard.

## 1. In the project's own tests

`@mesub/node/testing` builds a delivery signed like a real one, with no network:

```ts
import { FakeMesub } from '@mesub/node/testing';

const fake = new FakeMesub();
const mesub = fake.client(); // a real client that verifies with fake.webhookSecret

const { body, headers } = await fake.webhook('subscription.renewed', {
    subscription: { external_id: 'user_42' },
});
// With supertest: `body` as a string, `headers`, and a content type. The headers carry none,
// and express.raw({ type: 'application/json' }) leaves a body without one unread.
await request(app).post('/webhooks/mesub').set(headers).set('content-type', 'application/json').send(body);
```

- The handler under test must verify with `fake.webhookSecret`: build it on `fake.client()`, or set `MESUB_WEBHOOK_SECRET` to `fake.webhookSecret` in the test's environment.
- **Importing the app can throw before any test runs.** An app that builds its client at module level (`export const mesub = new Mesub()`) throws `Missing Mesub API key` on import when `MESUB_API_KEY` is unset, as in CI. Either set a made-up key in the test's environment before the app is imported (a test setup file, or `process.env.MESUB_API_KEY = 'SUB_test'` above a dynamic `import()`; never a real key, never `SUB_` followed by 40 characters), or give the app a seam that takes the client (`createApp({ mesub })`) and pass `fake.client()`. The seam is better: nothing then reaches Mesub by accident.
- `fake.webhook(type, { subscription, detail, id, timestamp })`: pass the same `id` twice to test deduplication, and an old `timestamp` (Unix seconds) to test a replay.
- `signWebhook(payload, { secret })`, from the same subpath, signs a body of your own. Use it for `subscription.renewal_upcoming` when the installed types do not accept that name in `fake.webhook`.
- Send `body` as a string. A test client that parses and writes it again breaks the signature.

Check the import in the installed package first (`node_modules/@mesub/node/package.json` lists `./testing` under `exports`).

## 2. Against the running server, from this machine

`scripts/send-test-delivery.mjs` posts five made-up deliveries to a handler on localhost and reports the answers: unsigned, signed with another secret, signed an hour ago, signed correctly, and the last one again.

```bash
node --env-file=.env "<skill-dir>/scripts/send-test-delivery.mjs" http://localhost:3000/webhooks/mesub
```

- `<skill-dir>` is the absolute path of the folder that holds `SKILL.md`. Run it from the project root.
- `--env-file` names the env file the server itself reads, so both sign with the same secret. The script reads `MESUB_WEBHOOK_SECRET` from the environment and never shows it.
- It refuses any URL that is not on localhost.
- By default every delivery is a `test` event about `sub_test`, with `"test": true`: a handler that ignores test deliveries has no side effect, and none of its branches runs.
- `--type <event type>` (one of the `subscription.*` types) sends that real type instead, without `test`, so the handler's branch runs: use it against a development database only. `--external-id <id>` (default `user_123`) and `--subscription <id>` (default `sub_local_1` with `--type`: never `sub_test`, which the handler drops as a test) name who it is about, for a per-user branch. `--sequence <n>` (default 1) places it: to send `subscription.access_revoked` after an `access_granted` about the same subscription, give it a higher one, or the handler rightly skips it.

```bash
node --env-file=.env "<skill-dir>/scripts/send-test-delivery.mjs" http://localhost:3000/webhooks/mesub --type subscription.cancelled --external-id user_42
```
- It cannot tell whether a repeat was handled once: that is read in the handler.
- The body has today's shape: `id` `evt_test`, `object`, `network`, `api_version`, `sequence` 1, `detail` at the top. `network` is `mainnet-beta`, the cluster Mesub runs on, unless `--network <cluster>` names another: `@mesub/node` refuses a body without it.

## 3. A test event from the dashboard

Needs the user, and a public URL.

1. A handler on a laptop has no public URL: the user starts a tunnel (ngrok is one) to the local port, and registers the tunnel's HTTPS URL plus the route's path as an endpoint, under Developers, then Webhooks.
2. The user puts that endpoint's signing secret in the server's environment and restarts the server. A new endpoint has a new secret: the one of the production endpoint does not work here.
3. On the endpoint, the user picks the event to simulate and clicks **Send test**. With no event picked, the plain `test` event is sent.

The endpoint must be enabled, and one test is pending at a time: wait for it to be delivered before sending the next.

When done, the user removes the tunnel's endpoint. Left in place it keeps receiving real events, fails once the tunnel is closed, and ends up disabled.

## 4. Seeing what is sent, with no code

webhook.site gives a public URL that shows every request it receives: the JSON body and the three headers. It is useful to look at a payload once.

- The signing secret is not in the request, so nothing secret is shown there. The subscriber's wallet and email are, on any real event.
- Tell the user to remove that endpoint as soon as they have looked: it would receive the project's real events too.

## What only real use shows

No test produces a real renewal, a real missed payment or a real `subscription.renewal_upcoming`: those come from a subscription living through its period. Say so in the report, rather than calling those branches tested.
