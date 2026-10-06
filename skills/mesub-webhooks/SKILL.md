---
name: mesub-webhooks
description: Use this skill when a server must receive Mesub's events and react to a renewal, a missed payment or a cancellation, even if the user just says "tell me when someone stops paying" or "my webhook says bad signature". Covers MESUB_WEBHOOK_SECRET (whsec_), verifyWebhook and mesub.webhooks.verify on the raw body, invalid_webhook, the event types (subscription.renewal_upcoming), deduplication on event.id, retries and order, with @mesub/node.
compatibility: Node 22 or later, with @mesub/node installed (check node_modules/@mesub/node/package.json). Express 4 or 5, Next.js App Router or NestJS on Express. A public HTTPS URL for the endpoint.
license: Apache-2.0
---

# Mesub Webhooks

## Overview

This skill makes an agent write a webhook handler that cannot be forged, does not act twice on one event and survives retries and reordering: the endpoint and its signing secret, the check on the raw body, every event and how Mesub delivers them.

## When to use this skill

- The app must react when a subscription changes: a renewal, a missed payment, a cancellation, an end.
- A handler rejects deliveries, acts twice, misses events or was disabled.
- The user wants to warn customers before a renewal (`subscription.renewal_upcoming`).

## Do not use this skill when

- The project has no Mesub code yet: the first setup is not in this skill.
- The task is whether a request may see paid content: that is asked on each request (`hasAccess`), not an event.
- The task is the subscribe window or the app's test suite as a whole.

## Core guidance

### What to hold first

1. **An event says something changed, not what is true now.** Access is decided by asking `hasAccess`. A handler is for side effects: a mail, a row for support.
2. **The route is public**, so the signature is the only thing that tells Mesub from anyone else.
3. **The signing secret is per endpoint**, starts with `whsec_` and is not the API key.

### Steps

1. **Check what is installed.** Read `node_modules/@mesub/node/package.json` for the version, and the `.d.ts` files of `dist/` beside it for `verifyWebhook` and the event names. The package may not be on the public registry: if it is absent, stop and tell the user. Never install a lookalike or write the check by hand.
2. **Ask the user for what only they can do.** In the dashboard, under Developers then Webhooks, they add the endpoint (a public HTTPS URL, up to 16 per project), pick its events, and put its signing secret in the server's environment as `MESUB_WEBHOOK_SECRET`.
3. **Copy the handler**: `assets/handle-event.ts`, then the route for the framework (`assets/express-webhook.ts`, `assets/next-webhook-route.ts` or `assets/nest-webhook.controller.ts`). Adapt the lines marked `ADAPT`, after reading `references/frameworks.md`.
4. **Write the store** behind `EventStore`, in the app's database: `references/delivery.md`.
5. **Fill the branches** the app needs: `references/events.md` has every type and field.
6. **Check**: the two scripts below, then `checks/verification.md`.

### Rules that are never negotiable

- **Verify before anything else, on the raw body.** The signature covers the exact bytes sent. A body a JSON parser read and wrote again no longer matches. Express: `express.raw` on the route. Next.js: `await request.text()`. NestJS: `req.rawBody`.
- **Trust only the event the check returns.** Never read the request body any other way. Why: an unverified body is whatever a stranger typed, and it can name any subscriber.
- **Answer 400 on `invalid_webhook` only, and let every other error fail.** A catch-all that answers 200 turns the check off. A `TypeError` is a fault of the server (a parsed body, a missing secret), not a bad delivery.
- **Never ask for the signing secret in the conversation, never write its value, never log it** nor the `webhook-signature` header. No browser prefix. A secret seen in a chat or a commit is leaked: the user replaces it in the dashboard.
- **Deduplicate on `event.id`** with one atomic write, and release the id when the handling fails. Why: an event can arrive twice, and an id kept after a failure makes the retry vanish. The id is the `webhook-id` header, not in the body.
- **Answer a 2xx within 10 seconds, before slow work.** Anything else, a redirect included, is a failure. Mesub retries for about three days, then disables the endpoint.
- **Do not trust the order.** A retry can land after a newer event. Before granting or revoking, ask `hasAccess`. Do not keep "is subscribed" from events: a cancellation reaching its end sends no event at all, and a plan's end date cuts access minutes before `subscription.ended`.
- **Keep a `default` branch that acknowledges.** Mesub may add a type, and a 500 on an unknown type ends with a disabled endpoint.
- **Ignore test deliveries** (`"test": true`, subscription `sub_test`) before any side effect.
- **Leave the route out of the app's login, CSRF check and redirects.** Mesub sends no session.
- **`subscription.renewal_upcoming` is a reading, not a promise**, is never sent for the last period of a plan with an end date, and an older copy's types do not name it: `references/events.md` before writing its branch.

### The checks

From the project root, with the scripts' path resolved under this skill's folder (`<skill-dir>`: the absolute path of this `SKILL.md`'s folder; do not change into it):

```bash
node "<skill-dir>/scripts/check-webhooks.mjs"
node --env-file=.env "<skill-dir>/scripts/send-test-delivery.mjs" http://localhost:3000/webhooks/mesub
```

The second needs the server running and posts to localhost only. **Neither produces a real event**: that needs the endpoint registered by the user and a public URL. Report the handler as checked locally, never as receiving events, until the user has sent a test from the dashboard.

## Related skills

<!-- related:start -->
<!-- Rendered from catalog.yaml by `pnpm render`. Do not edit. -->
This skill works alone: never assume another one is installed. The other skills of the kit: `mesub-quickstart`, `mesub-gate-access`, `mesub-subscribe-and-manage`, `mesub-testing`, `mesub-errors`.

For a task outside this skill, find its owner in `references/kit-directory.md` (what each skill covers, how to install it alone, its docs page), and say which skill owns it.
<!-- related:end -->

## References

- `references/events.md`: every event type, the event object, each detail, `subscription.renewal_upcoming` and test deliveries.
- `references/delivery.md`: what counts as received, retries, the disabled endpoint, deduplication, order.
- `references/frameworks.md`: the raw body on Express, Next.js and NestJS, the two ways to call the check, what it throws.
- `references/local-testing.md`: signed deliveries in tests, the local script, a tunnel and a test from the dashboard.
- `references/docs.md`: the docs pages behind this skill.
- `references/kit-directory.md`: every skill of the kit, how to install each one alone, and its docs fallback.

## Assets

- `assets/handle-event.ts`: deduplication, test deliveries, one branch per type. The routes import it.
- `assets/express-webhook.ts`: the Express route, with `express.raw`.
- `assets/next-webhook-route.ts`: the App Router route.
- `assets/nest-webhook.controller.ts`: the NestJS controller, on the raw body.

## Scripts

- `scripts/check-webhooks.mjs`: reads the project and reports on the package, the secret, the raw body, the 400 and the deduplication. Read-only, no network, never shows a secret.
- `scripts/send-test-delivery.mjs`: posts five made-up deliveries to a handler on localhost and reports its answers. Reads the signing secret from the environment, never shows it.

## Checks

- `checks/verification.md`: the runbook to go through before saying the work is done.
