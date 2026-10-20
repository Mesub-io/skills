---
name: mesub-errors
description: Use this skill when a Mesub call, route or payment fails and the cause must be found and fixed, even if the user just says "subscribe throws a 409" or "why was this customer not charged". Covers MesubError (code, apiCode, retryable, retryAfter), MesubSubmitError, the API's error codes (insufficient_sol included), request_id, the reason_code of a submit or confirm, late_reason, stop_reason, end_reason, closable, an attempt's outcome and reason.
compatibility: A project that already uses @mesub/node. Check what is installed in node_modules/@mesub/node/package.json.
license: Apache-2.0
---

# Mesub Errors

## Overview

This skill turns a failure into a cause and a fix: who answered, what its code or reason means, whether to wait, what to change.

## When to use this skill

- A call to Mesub throws, or a route answers 4xx or 5xx.
- A submit or a confirm answers with a `reason`, or a submit's outcome is unknown.
- A subscription is `unpaid`, `stopped` or `ended`, or a customer was not charged.
- Code that handles Mesub's errors must be written or reviewed.

## Do not use this skill when

- The project has no Mesub code yet: there is nothing to diagnose.
- Nothing fails and the task is to build a paid route, a subscribe flow or an event receiver.

## Core guidance

### Find the layer, then the fact

The same status means different things depending on who answered. Get the raw fact first (status and body, the error's fields, the subscription), not a screen's words.

| What is seen | It is | Read |
|---|---|---|
| `{ access: false, reason }` | A guard refusing, not an error | `references/where-it-failed.md` |
| `{ error: { code, message } }` | The widget routes refusing | same |
| A thrown `MesubError`, or a 500 with one in the log | A call to Mesub that failed | `references/sdk-errors.md`, `references/api-error-codes.md` |
| `{ subscription, reason, reason_code }` | A submit or a confirm that settled nothing | `references/reasons.md` |
| No access, and nothing threw | A status, a `late_reason`, `stop_reason` or `end_reason` | `references/reasons.md` |
| A customer not charged, or charged late | An attempt's `outcome` and `reason` | `references/attempts.md` |

### Reading a `MesubError`

`code` is one of ten kinds and follows the status. `apiCode` is Mesub's own finer code, null when no Mesub error came back. `retryable`: the same call may succeed later. `retryAfter`: the wait Mesub asked for, in **milliseconds** (a `Retry-After` header: `Math.ceil(retryAfter / 1000)`), or null. `status` is null when nothing answered.

```ts
import { MesubError } from '@mesub/node';

try {
    await mesub.subscriptions.create({ plan: 'pro', wallet });
} catch (error) {
    if (!(error instanceof MesubError)) throw error;
    if (error.apiCode === 'already_subscribed') return showCurrent();
    if (error.retryable) return tryLater(error.retryAfter); // ms, may be null
    throw error; // the default branch: codes are added
}
```

### Rules

- **Branch on `apiCode`, then on `code`. Never on `message`.** Why: codes are only added (`plan_deleted` and `plan_rebuilt` became `plan_removed` and `plan_replaced`); a message may be reworded. Likewise branch on the `reason_code` of a submit or a confirm, never its `reason`: `transaction_expired` is no failed payment, ask a fresh transaction.
- **Always keep a default branch**, on codes, statuses, outcomes, reasons. Why: new ones are added. Handle an unknown one by `retryable` and the status.
- **`retryable` means later, not now.** The SDK already retried what is safe. Never wrap a call in a loop. Why: a loop feeds a rate limit, and a wait can be most of an hour (`pending_cap_reached`): tell the customer, do not hold the request.
- **A 409 is Mesub's word on the state, not a race to retry.** Read the subscription back.
- **After a `MesubSubmitError`, read before you create.** Why: the wallet may have paid. `subscriptions.retrieve` says: `active` landed, `pending` may still land, only `expired` or `failed` allows a new `create`.
- **Never turn a failed call into "not subscribed".** A refused API key or an unknown slug throws on purpose. Why: read as `false`, it locks every paying customer out and hides a broken integration.
- **Never answer the browser 401 for Mesub refusing the API key.** Let it throw to `assets/error-handler.ts`. Why: the widget reads 401 as "signed out".
- **Hand the browser Mesub's `message` only when `apiCode` is set**, else a fixed sentence. Why: the SDK's own can name the base URL.
- **Never log the client, its options or headers**, nor ask for the API key. Log a `MesubError`'s `status`, `code`, `apiCode`, `message`, `requestId`.
- **Mind the spellings.** Reasons use underscores (`insufficient_balance`, `program_4`), the status is `cancelled`, an account closed outside Mesub ends `closed_elsewhere`. A wrong one never matches.
- **Read `late_reason` before telling a customer to top up.** On two of its three values funds fix nothing. On Free nothing retries by itself: never promise the next retry pays.
- **Only a `rejected` attempt counts against the customer.** `blocked` and `skipped` spend none.
- **A field this skill does not show: read it in the installed package** (`node_modules/@mesub/node/README.md`, its types). Never write a call from memory.

### The check

From the project root:

```bash
node "<skill-dir>/scripts/check-error-handling.mjs"
```

`<skill-dir>`: this skill's folder, as an absolute path; do not change into it. It reads text: open each line it names.

**Most failures cannot be reproduced on demand**: a late payment or an outage needs real state on Mesub's side. Say which fact the diagnosis rests on, what was fixed, what only the user can confirm.

## Related skills

<!-- related:start -->
<!-- Rendered from catalog.yaml by `pnpm render`. Do not edit. -->
This skill works alone: never assume another is installed. A task outside it: name its owner, from `references/kit-directory.md`. Not installed: install it only on the user's yes, else stop and say so. Going on without it is the user's call, keeping its rule:

- `mesub-quickstart`: never ask for the API key; `customer` from the verified session.
- `mesub-gate-access`: gate on the server; an error is never "not subscribed".
- `mesub-subscribe-and-manage`: the widget subscribes; never hand-make that flow.
- `mesub-webhooks`: verify the raw body's signature; deduplicate on the event id.
- `mesub-testing`: never mock `@mesub/node`: a seam and `FakeMesub`.
- `mesub-mcp`: ask before any change; never an API key.
<!-- related:end -->

## References

- `references/where-it-failed.md`: what a guard, the widget routes and the widget each answer.
- `references/sdk-errors.md`: `MesubError` and `MesubSubmitError` field by field, and what the SDK already retried.
- `references/api-error-codes.md`: the API's error codes, `request_id`, whether to wait, the fix.
- `references/reasons.md`: `reason_code`, `late_reason`, `stop_reason`, `end_reason`, `closable`, statuses that are not failures.
- `references/attempts.md`: an attempt's `outcome` and every `reason`, by whose doing it is.
- `references/docs.md`: the docs pages behind this skill.
- `references/kit-directory.md`: every skill of the kit, its install and docs.

## Assets

- `assets/mesub-failure.ts`: sorts a thrown value into wait, refused or broken integration; a safe answer for the browser.
- `assets/settle-submit.ts`: a submit that says landed, expired, not landed or unknown, and the read that follows.
- `assets/read-attempt.ts`: whose doing an attempt is, and whether it spent a retry.
- `assets/error-handler.ts`: the app's last handler, Express and Next: logs, 503 to wait, 500 to fix.

## Scripts

- `scripts/check-error-handling.mjs`: reports codes that never match, misspelt reasons, branches on a message, a wait in the wrong unit, retry loops, errors read as "no". Read-only.

## Checks

- `checks/verification.md`: the runbook before saying the work is done.
