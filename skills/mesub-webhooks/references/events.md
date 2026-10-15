# The events Mesub sends

What a handler receives once `verify` handed the event back. Field names are as the API serves them, in snake case.

## The event object

Every delivery is a `POST` of this body, the same one `GET /v1/events` serves (`delivery.md`, "Catching up"):

```json
{
    "id": "evt_cmg1x0evt0001",
    "object": "event",
    "type": "subscription.renewed",
    "created_at": "2026-01-31T00:01:00.000Z",
    "network": "...",
    "api_version": "2026-10-02",
    "data": { "id": "cmg1x0abc0001", "status": "active", "access": true, "stop_reason": null },
    "detail": { "amount": "9990000", "mint": "...", "period_start": "...", "period_end": "...", "signature": "..." }
}
```

| Field | What it holds |
|---|---|
| `id` | **The event's id**: the same on every retry, on every endpoint, and in `GET /v1/events/{id}` |
| `webhook-id` header | **The delivery's id**: one per event and per endpoint, the same on every retry of that delivery. Not in the body |
| `object` | Always `event` |
| `type` | The event's name |
| `created_at` | When the event happened, not when it was sent |
| `network` | The Solana cluster the subscription is on, as Solana names it. One endpoint can tell two projects' clusters apart with it |
| `api_version` | The version of the contract `data` and `detail` are written in, as `Mesub-Version` names it. Kept with the body: a retry days later carries the version it was written in |
| `data` | The subscription as it stood right after the change that raised the event, as `mesub.subscriptions.retrieve` would have answered then |
| `detail` | The event's own fields, **at the top of the body**, not inside `data`. An empty object on most events |
| `test` | `true` on a delivery sent by hand from the dashboard, absent otherwise |

`data` is the subscription at the event, however late the delivery: on a retry hours later it is hours old, so read `mesub.subscriptions.retrieve` or ask `hasAccess` for the state now. Events raised by the same change share it: a last retry that fails raises `subscription.payment_failed` and `subscription.stopped`, both with `status: stopped`, the failure's cause in `payment_failed`'s `detail`.

### What the installed package hands back

The body above is the contract since `api_version` `2026-10-02`. What `verify` returns depends on the copy of `@mesub/node` installed: read its `WebhookEvent` type in the `.d.ts` files of `node_modules/@mesub/node/dist` before writing a branch.

- **`event.id`**: a package written for this body gives the event's `id`. An older one puts the `webhook-id` header there instead. Both stay the same on every retry to one endpoint, so either deduplicates; only the event's id matches `GET /v1/events` and the other endpoints.
- **`detail`**: an older package expects it under `data` and throws `unexpected` (a `MesubError`, not `invalid_webhook`) on a body that has it at the top. The route then answers 500, Mesub retries, and after three days disables the endpoint. That is a package to update, not a handler to fix: tell the user.
- `assets/handle-event.ts` reads `detail` at the top first, then under `data`, so it works with both.

### Bodies written before `available_since`

`GET /v1/events` says from when Mesub keeps bodies in this shape (`available_since`). A body written before it, and the few written during the deploy that brought the shape, keep the older one when retried or resent: `{ type, created_at, data }`, `detail` inside `data`, no `id`, no `network`, no `api_version`, and `data` as it was at the delivery's first attempt. Such a body is sent unchanged: deduplicate it on the `webhook-id` header.

## The types

| `type` | Sent when | `detail` |
|---|---|---|
| `subscription.created` | The first payment landed | empty, or `previous_id` on a wallet coming back after a stop |
| `subscription.renewal_upcoming` | A renewal is near, and whether it can pay | see below |
| `subscription.renewed` | A period was paid | `amount`, `mint`, `period_start`, `period_end`, `signature` |
| `subscription.payment_failed` | A charge missed | `reason`, `amount`, `mint`, `period_start`, `period_end`, `next_retry_at`, `retry_deadline`, `retries_left`, `retry_mode` |
| `subscription.stopped` | Mesub stopped charging after missed payments. `data.stop_reason` says why: `out_of_retries`, `retry_deadline_passed` or `authority_closed` | `reason` |
| `subscription.cancelled` | The customer cancelled. Access runs to the period's end | empty |
| `subscription.resumed` | A cancellation was undone | empty |
| `subscription.ended` | It is over. `data.end_reason` says why: `plan_ended` at the end date of its plan, `closed_elsewhere` when the subscription account was closed outside Mesub | empty |
| `subscription.expired` | A checkout was started and never signed | empty |
| `test` | Sent from the dashboard with no event picked | empty |

Three things that are easy to get wrong:

- **A cancellation reaching its end sends no event of its own.** `subscription.cancelled` arrives when the customer cancels, while access still runs until `data.access_until`. Nothing arrives the day it runs out. Code that waits for an event to take access away never takes it away: ask `hasAccess` on each request instead.
- **Mesub may add a type.** The SDK hands back a type it does not know, with its subscription checked. Keep a `default` branch that acknowledges it.
- **An endpoint receives only the events selected for it** in the dashboard. A missing event is first a selection to check, not a bug in the handler. Events missed while the endpoint was down or disabled are in `GET /v1/events` for 30 days.

## The details

Amounts are strings, in the token's smallest unit: never read them as floats. Dates are ISO 8601.

`subscription.renewed`:

| Field | What it holds |
|---|---|
| `amount`, `mint` | What was paid, and the token |
| `period_start`, `period_end` | The period it paid for |
| `signature` | The transaction that paid it |

`subscription.payment_failed`:

| Field | What it holds |
|---|---|
| `reason` | Why, for example `insufficient_balance` (`insufficient-balance` from an older Mesub) |
| `amount`, `mint` | What was due |
| `period_start`, `period_end` | The period it was for, null when unknown |
| `next_retry_at` | When Mesub retries. Null when it will not (the plan ends before the retry, among others), or when retries are by hand |
| `retry_deadline` | When retries by hand close, on the Free tier only. The plan's end when that comes first |
| `retries_left` | Charges still to come before the subscription stops, the next one included. 0 with `next_retry_at` null when the plan ends before any |
| `retry_mode` | `scheduled` (Mesub retries), `manual` (you retry by hand) or null once none is left |

`subscription.stopped`: `reason`, the last charge's reason when its retries ran out (for example `insufficient_balance`), or `retry_deadline_passed` on Free. An older Mesub hyphenated the first and said `grace-ended` for the second. To decide what the customer can do, branch on `data.stop_reason` instead:

| `data.stop_reason` | What follows |
|---|---|
| `out_of_retries` | The retries ran out. The customer can come back by subscribing again |
| `retry_deadline_passed` | On Free, the last day to pay the missed period passed. The same |
| `authority_closed` | The wallet closed the account that lets Mesub charge it, for good. It cannot come back: the customer can close it at once (`data.closable` is true) to get the deposit back |
| `null`, or another | Stopped before Mesub recorded why, or a reason newer than this file: keep a default branch |

A missed charge does not end access at once: read `data.access` and `data.access_until`, or ask `hasAccess`.

## subscription.renewal_upcoming

Sent once per period, when a subscription enters the last quarter of it and three days before the charge at most, whether the charge can pay or not. Mesub reads the customer's wallet at that moment:

```json
{
    "can_pay": false,
    "renewal_issue": "balance",
    "amount": "9990000",
    "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "due_at": "2026-03-02T00:00:00.000Z"
}
```

| Field | What it holds |
|---|---|
| `can_pay` | Whether the charge would go through as the wallet stood when it was read |
| `renewal_issue` | `balance`, `authority`, or null when it can pay |
| `amount`, `mint` | What will be charged, and the token |
| `due_at` | When the charge is due |

- `balance`: the wallet holds less than the amount, or has no account for the token. The customer adds funds.
- `authority`: Mesub can no longer move the tokens (the approval was replaced or is too small, or the account is frozen). Subscribing again gives a new approval.
- **It is a reading, not a promise.** A wallet topped up or emptied afterwards changes the outcome. The charge itself answers with `subscription.renewed` or `subscription.payment_failed`: never record a payment, or a failure, from this event.
- Mesub already mails the customer when the charge cannot pay and the subscription carries an email. Do not send a second mail saying the same thing without asking the user.
- It must be selected for the endpoint in the dashboard. An endpoint created before the event existed does not get it by itself.
- **It is never sent for a charge that cannot happen.** A subscription in the last period of a plan with an end date has no renewal: no event, and no mail from Mesub. A reminder built on this event never reaches those customers.

**An older copy of the SDK does not name it.** The type and its checked detail were added while the package was still 0.1.0, so the version does not tell: search the `.d.ts` files of `node_modules/@mesub/node/dist` for `subscription.renewal_upcoming` (the types sit in a shared file, not always in `index.d.ts`). With it, a `case` in the typed `switch` works and the detail is checked. Without it the event is still handed back at runtime, but that `case` does not compile and the detail is unchecked: read it the way `assets/handle-event.ts` does: compare `event.type` as a string before the typed `switch`, and check `can_pay` is a boolean before using the detail.

## At a plan's end

A plan can have an end date (`ends_at` on the plan). Nobody has access after it, and the last period is charged in full even when the plan ends inside it. Three events read differently around it:

| Event | What changes |
|---|---|
| `subscription.renewal_upcoming` | Not sent in the last period: the plan ends before the next charge |
| `subscription.payment_failed` | Can carry `next_retry_at: null` and `retries_left: 0` in `detail` |
| `subscription.ended` | Sent at the plan's end, with `data.end_reason` at `plan_ended` |

- A charge that misses when the plan ends before the next retry has no retry to announce: `next_retry_at` is null, `retries_left` is 0 and `retry_mode` is null. The subscription stays `unpaid` until the plan's end, then ends. Do not word that event as "we will try again on", and do not read `retries_left: 0` as `stopped`: `subscription.stopped` is its own event.
- `subscription.ended` arrives within a few minutes of the plan's end, for a subscription that was still `active` or `unpaid`.
- **Access stopped at the end itself, before the event.** A delivery in between can carry `data.status: "active"` with `data.access: false`. Read `data.access`, never `data.status`, and ask `hasAccess` before granting anything.
- On `data` of any event in the last period, `next_charge_at` is null and `access_until` is never later than the plan's end.

## Test deliveries

A delivery sent with **Send test** in the dashboard is signed like a real one, in the same body. It carries `"test": true` at the top of its body and a made-up subscription whose id is `sub_test`. With an event picked, it has that event's type, so the type alone does not tell a test from a real event.

- Ignore it before any side effect: `assets/handle-event.ts` checks both the flag and the id.
- `test` is not in the SDK's types at 0.1.0 either: read it as `(event as { test?: unknown }).test`.
- Never look up `sub_test` in the app's database or mail its made-up address.
- Its event `id` is made up as well: it is not in `GET /v1/events`.
