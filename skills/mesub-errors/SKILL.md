---
name: mesub-errors
description: Use this skill when a Mesub call, route or payment fails and the cause must be found and fixed, even if the user just says "subscribe throws a 409" or "why was this customer not charged". Covers MesubError (code, apiCode, retryable, retryAfter), MesubSubmitError, every API error code, the reason of a submit or confirm, late_reason, end_reason, an attempt's outcome and reason.
compatibility: A project that already uses @mesub/node. Check what is installed in node_modules/@mesub/node/package.json.
license: Apache-2.0
---

# Mesub Errors

## Overview

This skill turns a failure into a cause and a fix: which layer answered, what its code, reason or outcome means, whether waiting helps, and what must change.

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

The same status means different things depending on who answered. Get the raw fact first: the status and body, the thrown error's fields, or the subscription. Never diagnose from a screen's wording.

| What is seen | It is | Read |
|---|---|---|
| `{ access: false, reason }` | A guard refusing, not an error | `references/where-it-failed.md` |
| `{ error: { code, message } }` | The widget routes refusing | same |
| A thrown `MesubError`, or a 500 with one in the log | A call to Mesub that failed | `references/sdk-errors.md`, `references/api-error-codes.md` |
| `{ subscription, reason }` | A submit or a confirm that settled nothing | `references/reasons.md` |
| No access, and nothing threw | A status, a `late_reason` or an `end_reason` | `references/reasons.md` |
| A customer not charged, or charged late | An attempt's `outcome` and `reason` | `references/attempts.md` |

### Reading a `MesubError`

`code` is one of ten kinds and follows the status. `apiCode` is Mesub's own finer code, null when no Mesub error came back. `retryable`: the same call, unchanged, may succeed later. `retryAfter`: the wait Mesub asked for, in **milliseconds**, or null. `status` is null when nothing answered.

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

- **Branch on `apiCode`, then on `code`. Never on `message`.** Why: a code is never renamed; a message is a sentence for a person and may be reworded. The `reason` of a submit or a confirm is such a sentence too: test that it is set, then read `subscription.status`.
- **Always keep a default branch**, on codes, statuses, outcomes and reasons. Why: new ones are added. Handle an unknown one by `retryable` and the status.
- **`retryable` means later, not now.** The SDK already retried what is safe. Do not wrap a call in a loop. Why: a loop feeds a rate limit, and a wait can be most of an hour (`pending_cap_reached`): tell the customer, do not hold the request.
- **A 409 is Mesub's word on the state, never a race to retry.** Read the subscription back and decide from it.
- **After a `MesubSubmitError`, read before you create.** Why: the wallet may have paid. `subscriptions.retrieve` says: `active` landed, `pending` may still land, only `expired` or `failed` allows a new `create`.
- **Never turn a failed call into "not subscribed".** A refused API key or an unknown slug throws on purpose. Why: read as `false`, it locks every paying customer out and hides a broken integration.
- **Never answer the browser 401 for Mesub refusing the API key.** Let it throw. Why: the widget reads 401 as "nobody is signed in".
- **Hand the browser Mesub's `message` only when `apiCode` is set**, a fixed sentence otherwise. Why: the SDK's own messages can name the base URL.
- **Never log the client, its options or request headers**, and never ask for the API key. Log a `MesubError`'s `status`, `code`, `apiCode` and `message`.
- **Mind the spellings.** An attempt's `reason` is hyphenated (`insufficient-balance`), `late_reason` and `end_reason` use underscores, the status is `cancelled`. A wrong one never matches and nothing warns.
- **Read `late_reason` before telling a customer to top up.** On two of its three values adding funds fixes nothing.
- **Only a `rejected` attempt counts against the customer.** `blocked` and `skipped` spend no retry.
- **Before using a field this skill does not show, read it in the installed package** (`node_modules/@mesub/node/README.md` and its types). The packages are early 0.x: never assume a version or write a call from memory.

### The check

From the project root, with the script's path resolved under this skill's folder:

```bash
node "<skill-dir>/scripts/check-error-handling.mjs"
```

`<skill-dir>` is the absolute path of the folder that holds this `SKILL.md`. Do not change into it: the script reads the current directory. It reads text, not types: open each line it names.

**Most failures cannot be reproduced on demand**: a late payment or an outage needs real state on Mesub's side. Say which fact the diagnosis rests on, what was fixed, and what only the user can confirm.

## Related skills

<!-- related:start -->
<!-- Rendered from catalog.yaml by `pnpm render`. Do not edit. -->
This skill works alone and hands off to no other skill.
<!-- related:end -->

## References

- `references/where-it-failed.md`: what a guard, the widget routes and the widget each answer.
- `references/sdk-errors.md`: `MesubError` and `MesubSubmitError` field by field, and what the SDK already retried.
- `references/api-error-codes.md`: every API error code, its status, whether to wait, the fix.
- `references/reasons.md`: the `reason` of a submit or confirm, `late_reason`, `end_reason`, the statuses that are not failures.
- `references/attempts.md`: an attempt's `outcome` and every `reason`, by whose doing it is.
- `references/docs.md`: the docs pages behind this skill.

## Assets

- `assets/mesub-failure.ts`: sorts a thrown value into wait, refused or broken integration, and builds a safe answer for the browser. Adapt the line marked `ADAPT`.
- `assets/settle-submit.ts`: a submit that says landed, not landed or unknown, and the read that follows.
- `assets/read-attempt.ts`: whose doing an attempt is, and whether it spent a retry.

## Scripts

- `scripts/check-error-handling.mjs`: reports codes that can never match, misspelt reasons, branches on a message, a wait in the wrong unit. Read-only, no network. Usage above.

## Checks

- `checks/verification.md`: the runbook to go through before saying the work is done.
