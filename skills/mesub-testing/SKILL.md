---
name: mesub-testing
description: Use this skill when automated tests must cover a Mesub integration (paid routes, widget routes, webhook handler) without calling Mesub or touching the chain, even if the user just says "add tests for the paywall" or "how do I test this without paying". Covers @mesub/node/testing, FakeMesub, grant, deny, fail, fake.webhook, signWebhook, the 401, 402 and 503 answers, and what must not be mocked.
compatibility: Node 22 or later, and @mesub/node installed with its "./testing" entry. Any test framework; the examples use vitest and supertest.
license: Apache-2.0
---

# Mesub Testing

## Overview

This skill makes an agent write tests that prove a Mesub integration behaves: who gets in, who is refused and how, what happens when Mesub is down, what a handler does with a signed event. They run against the fake in `@mesub/node/testing`: the real guard, cache and signature check, with no network, account or wallet.

## When to use this skill

- A paid route, the widget routes or a webhook handler has no test, or one that calls the real Mesub.
- A test must simulate a subscriber, a refusal, an outage or an event.
- Tests mock the SDK and must move onto the fake.

## Do not use this skill when

- The project has no Mesub code yet: the setup comes before its tests.
- The task is to write or fix a guard, the routes or a handler, not to test them.
- The task is to check a deployed integration against the real Mesub: no fake can.

## Core guidance

### Check what is installed first

Read `node_modules/@mesub/node/package.json`: the version, and `"./testing"` under `exports`. The packages may not be published yet. If either is missing, stop and tell the user: no lookalike, no hand-written fake. This skill was written from 0.1.0: the installed `dist/testing.d.ts` wins when they differ.

### The shape of every test

```ts
import { FakeMesub } from '@mesub/node/testing';

const fake = new FakeMesub({ plans: ['pro'] }); // any other slug answers plan_not_found

beforeEach(() => {
    fake.reset();
    app = createApp({ mesub: fake.client(), customer: () => signedIn, onEvent }); // a new client per test
});

fake.grant({ external_id: 'user_42' }, 'pro'); // active and paid
fake.deny({ external_id: 'user_7' }, 'pro', { status: 'stopped' });
fake.fail('outage'); // 503 on every call, until fake.fail(null)
```

`fake.client()` is a real `Mesub` wired to the fake. A test replaces two things, the client and who is signed in, and hands both in from outside: `references/seams.md`. Every method of the fake: `references/fake-mesub.md`.

### Steps

1. **Read the project**: the test framework, and where the guards, the route mount and the webhook handler get their client and their `customer`.
2. **Make the seam** if there is none: `assets/create-app.ts` (Express) or the builders in `assets/next-route.test.ts`. It is the only change to the code that ships: tell the user.
3. **A paid route**: `assets/guard.test.ts`. At least: a subscriber gets 200, a signed-in non-payer 402, nobody signed in 401, an outage for a user never seen 503. Every case: `references/cases.md`.
4. **The widget routes**: `assets/widget-routes.test.ts`. At least: signed out is 401, a user reads only their own subscriptions, a new subscription is tied to the signed-in user.
5. **A webhook handler**, if any: `assets/webhook.test.ts`. At least: a signed delivery is handled, a changed body answers 400, a repeat is handled once. `references/webhooks.md`.
6. **Subscribing or managing from the server**, if the app does: `references/subscribing.md`.
7. **Run the script below, the tests, then `checks/verification.md`.**

Copy an asset, then adapt the lines marked `ADAPT`.

### Rules that keep a test honest

- **Never mock `@mesub/node`, a guard, `hasAccess` or `webhooks.verify`.** Why: the test then checks the mock, and passes on a route open to everybody.
- **Never import the fake from code that ships, nor branch on the test environment around a guard or a signature.** Why: the fake grants whatever it is told.
- **The test hands in who is signed in. Never read it from a header the test invented.** Why: a shipped `customer` that trusts `x-test-user` lets anyone be any subscriber.
- **No real API key or signing secret in a test, a test env file or CI.** The fake has its own (`fake.apiKey`, `fake.webhookSecret`). Never write or show either value.
- **Grant under the name the app uses.** A customer granted by wallet is not found by `external_id`.
- **Always name `plans`.** Without it every slug exists, so a typo passes, and the widget routes answer 404 for every plan.
- **One client per test.** `reset()` empties the fake, not a client's cache: an older client serves another test's answer during an outage.
- **Test the refusals, not only the 200**, which passes with no guard at all. An outage for a user never seen is a 503 with `Retry-After`, never a 402; a user seen before keeps their last answer.
- **A broken integration is an error, never a refusal.** The guard throws on a refused key or an unknown slug. Express's default error handler then answers the error's own status (401, 404), not 500: assert what the app really answers.
- **Send a webhook's body as the string that was signed**, never the parsed object, and always send one delivery that must be refused.
- **A webhook adds nothing to the fake.** For "the event lands and the user is out", set the answer with `fake.deny`, then send the event.

### The check

From the project root:

```bash
node "<skill-dir>/scripts/check-tests.mjs"
```

`<skill-dir>` is the absolute path of the folder that holds this `SKILL.md`. Do not change into it.

**Green tests prove the app's own code, not the integration with Mesub.** The key, the slug, the endpoint's secret and a real subscription cannot be tested against a fake: report them as not covered (`references/limits.md`).

## Related skills

<!-- related:start -->
<!-- Rendered from catalog.yaml by `pnpm render`. Do not edit. -->
This skill works alone and hands off to no other skill.
<!-- related:end -->

## References

- `references/fake-mesub.md`: everything the testing entry exports, with defaults.
- `references/seams.md`: handing the fake's client and the signed-in user to the app.
- `references/cases.md`: every case of a paid route and the widget routes, with its answer.
- `references/webhooks.md`: signed test deliveries and the cases to send.
- `references/subscribing.md`: subscriptions, payments and their refusals in the fake.
- `references/limits.md`: what no test against the fake proves.
- `references/docs.md`: the docs page behind this skill.

## Assets

- `assets/create-app.ts`: an Express app built from the client and `customer`.
- `assets/guard.test.ts`: a paid route.
- `assets/widget-routes.test.ts`: the widget routes.
- `assets/webhook.test.ts`: a webhook handler.
- `assets/next-route.test.ts`: both, in Next.js.

## Scripts

- `scripts/check-tests.mjs`: reports whether tests use the fake, mock the SDK, leak the fake or a test door into shipped code, hold a key, and which cases are missing. Read-only, no network, shows no key. Usage above.

## Checks

- `checks/verification.md`: the runbook to go through before saying the work is done.
