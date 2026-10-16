---
name: mesub-webhooks
description: Use this skill when a server must receive Mesub's events and react to a renewal, a missed payment or a cancellation, even if the user just says "tell me when someone stops paying" or "my webhook says bad signature". Covers MESUB_WEBHOOK_SECRET (whsec_), verifyWebhook and mesub.webhooks.verify on the raw body, invalid_webhook, the event body (id, detail), event types (subscription.renewal_upcoming, subscription.access_granted, subscription.access_revoked), sequence, deduplication, retries, order, GET /v1/events, with @mesub/node.
compatibility: Node 22 or later, with @mesub/node installed (check node_modules/@mesub/node/package.json). Express 4 or 5, Next.js App Router or NestJS on Express. A public HTTPS URL for the endpoint.
license: Apache-2.0
---

# Mesub Webhooks

## Overview

This skill makes an agent write a webhook handler that cannot be forged, acts once per event and survives retries and reordering.

## When to use this skill

- The app must react when a subscription changes: a renewal, a missed payment, a cancellation, an end.
- A handler rejects deliveries, acts twice, misses events or was disabled.
- The user wants to warn customers before a renewal (`subscription.renewal_upcoming`).

## Do not use this skill when

- The project has no Mesub code yet: the first setup is not in this skill.
- The task is gating paid content: that is `hasAccess` on each request, not an event.
- The task is the subscribe window or the app's test suite as a whole.

## Core guidance

### What to hold first

1. **Only two events say whether a customer has access**: `subscription.access_granted` and `subscription.access_revoked`, applied by `sequence`. Mesub does not send them yet: until then, ask `hasAccess`. The others are for side effects: a mail, a row for support.
2. **The route is public**, so the signature is the only thing that tells Mesub from anyone else.
3. **The signing secret is per endpoint**, starts with `whsec_` and is not the API key.

### Steps

1. **Check what is installed.** Read `node_modules/@mesub/node/package.json` for the version, and the `.d.ts` files of `dist/` beside it for `verifyWebhook` and the event names. The package may not be on the public registry: if it is absent, stop and tell the user. Never install a lookalike or write the check by hand.
2. **Ask the user for what only they can do.** In the dashboard, under Developers then Webhooks, they add the endpoint (a public HTTPS URL, up to 16 per project), pick its events, and put its signing secret in the server's environment as `MESUB_WEBHOOK_SECRET`.
3. **Copy the handler**: `assets/handle-event.ts`, then the route for the framework (`assets/express-webhook.ts`, `assets/next-webhook-route.ts` or `assets/nest-webhook.controller.ts`). Adapt the lines marked `ADAPT`, after reading `references/frameworks.md`.
4. **Write the store** behind `EventStore`, in the app's database (none yet: the smallest durable one): `references/delivery.md`.
5. **Fill the branches** the app needs: `references/events.md` has every type and field.
6. **Check**: the two scripts below, then `checks/verification.md`.

### Rules that are never negotiable

- **Verify before anything else, on the raw body.** The signature covers the exact bytes sent: a parsed body no longer matches. Express: `express.raw` on the route. Next.js: `await request.text()`. NestJS: `req.rawBody`.
- **Trust only the event the check returns.** Never read the request body any other way. Why: an unverified body is whatever a stranger typed, and it can name any subscriber.
- **Answer 400 on `invalid_webhook` only, and let every other error fail.** A catch-all that answers 200 turns the check off. A `TypeError` is a fault of the server (a parsed body, a missing secret), not a bad delivery.
- **Never ask for the signing secret in the conversation, never write its value, never log it** nor the `webhook-signature` header. No browser prefix. A secret seen in a chat or a commit is leaked.
- **Deduplicate on the event's `id`** with one atomic write, released when the handling fails. Why: an event can arrive twice; an id kept after a failure drops the retry.
- **Answer a 2xx within 10 seconds, before slow work.** Anything else, a redirect included, is a failure. Mesub retries for about three days, then disables the endpoint.
- **Do not trust the order; trust `sequence`.** A retry can land after a newer event. Apply one subscription's events by `sequence`, skipping one at or below the last applied; without it, read the state now. `references/events.md`.
- **`detail` sits at the top of the body, not in `data`.** An older `@mesub/node` throws `unexpected` on it: the package needs updating. `references/events.md`.
- **Catch up with `GET /v1/events`** after an outage or a disabled endpoint: the same bodies, 30 days. `references/delivery.md`.
- **Keep a `default` branch that acknowledges.** Mesub may add a type, and a 500 on an unknown type ends with a disabled endpoint.
- **Ignore test deliveries** (`"test": true`, subscription `sub_test`) before any side effect.
- **Keep the route out of the app's login, CSRF check and redirects.** Mesub has no session.
- **`subscription.renewal_upcoming` is a reading, not a promise**, never sent for a plan's last period: `references/events.md` before its branch.

### The checks

From the project root (`<skill-dir>`: this skill's folder, as an absolute path; do not change into it):

```bash
node "<skill-dir>/scripts/check-webhooks.mjs"
node --env-file=.env "<skill-dir>/scripts/send-test-delivery.mjs" http://localhost:3000/webhooks/mesub
```

The second needs the server running, on localhost. **Neither produces a real event**, which needs the endpoint registered and a public URL. Report the handler as checked locally, never as receiving events, until the user has sent a test from the dashboard.

## Related skills

<!-- related:start -->
<!-- Rendered from catalog.yaml by `pnpm render`. Do not edit. -->
This skill works alone: never assume another is installed. A task outside it: name its owner, from `references/kit-directory.md`. Owner not installed and not installable: stop and say so. Going on without it is the user's call, keeping its rule:

- `mesub-quickstart`: never ask for the API key; `customer` from the verified session.
- `mesub-gate-access`: gate on the server; an error is never "not subscribed".
- `mesub-subscribe-and-manage`: the widget subscribes; never hand-make that flow.
- `mesub-testing`: never mock `@mesub/node`: a seam and `FakeMesub`.
- `mesub-errors`: branch on `apiCode`, never a message; never loop on `retryable`.
- `mesub-mcp`: ask before any change; never an API key.
<!-- related:end -->

## References

- `references/events.md`: the event body, every type and detail, order and access, test deliveries.
- `references/delivery.md`: retries, secret rotation, deduplication, order, catching up with `GET /v1/events`.
- `references/frameworks.md`: the raw body per framework, the two ways to call the check, what it throws.
- `references/local-testing.md`: signed deliveries in tests, a tunnel, a test from the dashboard.
- `references/docs.md`: the docs pages behind this skill.
- `references/kit-directory.md`: every skill of the kit, its install and docs.

## Assets

- `assets/handle-event.ts`: deduplication, test deliveries, access by `sequence`, one branch per type.
- `assets/express-webhook.ts`: the Express route, with `express.raw`.
- `assets/next-webhook-route.ts`: the App Router route.
- `assets/nest-webhook.controller.ts`: the NestJS controller, on the raw body.

## Scripts

- `scripts/check-webhooks.mjs`: reports on the package, the secret, the raw body, the 400 and the deduplication. Read-only, never shows a secret.
- `scripts/send-test-delivery.mjs`: posts five made-up deliveries to a handler on localhost, `test` ones or `--type` a real type. Never shows the secret.

## Checks

- `checks/verification.md`: the runbook before saying the work is done.
