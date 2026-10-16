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
    "sequence": 3,
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
| `created_at` | When Mesub wrote the event, not when it was sent. On the two access events, `detail.changed_at` says when access changed |
| `network` | The Solana cluster the subscription is on, as Solana names it. One endpoint can tell two projects' clusters apart with it |
| `api_version` | The version of the contract `data` and `detail` are written in, as `Mesub-Version` names it. Kept with the body: a retry days later carries the version it was written in |
| `sequence` | Its place among **this subscription's** events: 1, 2, 3..., two events of one change included. Absent on a body written before Mesub numbered events, or one it could not number. See "Order and access" |
| `data` | The subscription as it stood right after the change that raised the event, as `mesub.subscriptions.retrieve` would have answered then |
| `detail` | The event's own fields, **at the top of the body**, not inside `data`. An empty object on most events |
| `test` | `true` on a delivery sent by hand from the dashboard, absent otherwise |

`data` is the subscription at the event, however late the delivery: on a retry hours later it is hours old, so read `mesub.subscriptions.retrieve` or ask `hasAccess` for the state now. Events raised by the same change share it: a last retry that fails raises `subscription.payment_failed` and `subscription.stopped`, both with `status: stopped`, the failure's cause in `payment_failed`'s `detail`.

### What the installed package hands back

The body above is the contract since `api_version` `2026-10-02`. What `verify` returns depends on the copy of `@mesub/node` installed: read its `WebhookEvent` type in the `.d.ts` files of `node_modules/@mesub/node/dist` before writing a branch.

- **`event.id`**: a package written for this body gives the event's `id`, typed `string | null`: null on a body written before `available_since`, and `event.delivery_id` holds the `webhook-id` header. Deduplicate on `event.id ?? event.delivery_id`. An older package puts the `webhook-id` header in `event.id` instead. Both stay the same on every retry to one endpoint, so either deduplicates; only the event's id matches `GET /v1/events` and the other endpoints.
- **`detail`**: an older package expects it under `data` and throws `unexpected` (a `MesubError`, not `invalid_webhook`) on a body that has it at the top. The route then answers 500, Mesub retries, and after three days disables the endpoint. That is a package to update, not a handler to fix: tell the user.
- `assets/handle-event.ts` reads `detail` at the top first, then under `data`, so it works with both.

### Bodies written before `available_since`

`GET /v1/events` says from when Mesub keeps bodies in this shape (`available_since`). A body written before it, and the few written during the deploy that brought the shape, keep the older one when retried or resent: `{ type, created_at, data }`, `detail` inside `data`, no `id`, no `network`, no `api_version`, and `data` as it was at the delivery's first attempt. Such a body is sent unchanged: deduplicate it on the `webhook-id` header.

## The types

| `type` | Sent when | `detail` |
|---|---|---|
| `subscription.created` | The first payment landed | `first_payment`, and `previous_id` on a wallet coming back after a stop |
| `subscription.renewal_upcoming` | A renewal is near, and whether it can pay | see below |
| `subscription.renewed` | A period was paid | `amount`, `mint`, `period_start`, `period_end`, `signature` |
| `subscription.payment_failed` | A charge missed | `reason`, `amount`, `mint`, `period_start`, `period_end`, `next_retry_at`, `retry_deadline`, `retries_left`, `retry_mode` |
| `subscription.stopped` | Mesub stopped charging after missed payments. `data.stop_reason` says why: `out_of_retries`, `retry_deadline_passed` or `authority_closed` | `reason` |
| `subscription.cancelled` | The customer cancelled. Access runs to the period's end | empty |
| `subscription.resumed` | A cancellation was undone | empty |
| `subscription.ended` | It is over. `data.end_reason` says why: `cancelled` when a cancellation reached its end (**not sent yet**), `closed` when the account is closed, `plan_ended` at the end date of its plan, `plan_removed` or `plan_replaced` when the merchant removed or replaced the plan, `closed_elsewhere` when the account was closed outside Mesub | empty; on a cancellation's end, `changed_at` and `end_reason` `cancelled` |
| `subscription.expired` | A checkout was started and never signed | empty |
| `subscription.access_granted` | Access started: the subscription grants access now and did not just before. **Not sent yet**: see "Order and access" | `changed_at`, `blocked_reason`, `access_until` |
| `subscription.access_revoked` | Access ended: it grants none now and did just before. **Not sent yet** | `changed_at`, `blocked_reason`, `access_until` |
| `subscription.paused` | A seat was parked: the project holds more subscribers than its tier allows. **Not sent yet** | empty |
| `subscription.unpaused` | A parked seat is back: the tier has room again. **Not sent yet** | empty |
| `test` | Sent from the dashboard with no event picked | empty |

Things that are easy to get wrong:

- **A cancellation reaching its end is told late, and not yet.** `subscription.cancelled` arrives when the customer cancels, while access still runs until `data.access_until`. At the expiry, `subscription.access_revoked` is sent first; `subscription.ended` with `end_reason: cancelled` follows once Mesub reads the chain, usually within half an hour, `detail.changed_at` the expiry. Closing the account later sends `ended` again, with `closed`. Mesub sends none of these yet: ask `hasAccess` on each request until they arrive.
- **`subscription.paused` is not the subscriber's choice.** The project went over its tier's cap (a smaller tier, or a late confirmation filled it) and Mesub stopped charging the newest seats. Nothing changed on chain, the status stays, `data.paused` is true and `data.next_charge_at` null; access runs to the end of the paid period, then `subscription.access_revoked` follows. Tell the merchant (a bigger tier brings the seats back, with `subscription.unpaused`), never mail the customer as if they paused. An older SDK does not type either name: compare `event.type` as a string.
- **Mesub may add a type.** The SDK hands back a type it does not know, with its subscription checked. Keep a `default` branch that acknowledges it.
- **An endpoint receives only the events selected for it** in the dashboard. A missing event is first a selection to check, not a bug in the handler. Events missed while the endpoint was down or disabled are in `GET /v1/events` for 30 days.

## Order and access

Deliveries arrive in any order: a retry of an old event can land after a newer one.

- **Apply one subscription's events in the order of `sequence`**, and skip one lower than or equal to the last you applied for that subscription. Keep that number per subscription (`data.id`), next to what it set, with one conditional write (`UPDATE ... WHERE last_sequence < $1`), never a read then a write.
- **An event without `sequence` cannot be placed.** Do not apply its `data`: read the state now with `mesub.subscriptions.retrieve`, or ask `hasAccess`.
- `sequence` counts per subscription only. Two subscriptions' numbers say nothing about each other, and `created_at` is no substitute.

### `subscription.access_granted` and `subscription.access_revoked`

Sent exactly when the access a subscription grants changes (`data.access`), whatever made it change, a date passing included. One event per change, never two, and every change sends one.

- **Drive the customer's access from these two alone**, applied by `sequence`: the access of the highest one applied stands. The other events say why (a payment, a cancellation, a stop), never whether.
- `detail.changed_at`: when access changed. For a date that passed (the end of a paid period, of a cancellation, of the plan) it is that date to the millisecond, though the event is written seconds or hours later.
- `detail.blocked_reason`: why the charges were held when access changed, in the words of `data.blocked_reason`; null when they were not. Keep a default branch: Mesub may add a value.
- `detail.access_until`: on `access_granted`, the date access ends if a held subscription collects nothing by then, null otherwise (a charge renews it). On `access_revoked`, the date access ended (a paid period, a cancellation, the plan, or a held subscription's access), never after `changed_at`; null when it ended with no date of its own, a stop for example.
- Both are absent on an event written before Mesub added them: read them as optional, never require them.
- `data` is the subscription at that moment: `data.access`, `data.access_until`, and on a collection blocked on Mesub's or the merchant's side, `data.blocked_since` and `data.blocked_reason`.
- Granted: the first access, a payment that gives access back after it ended, a comeback, a resume after a cancellation ended. Revoked: stopped, ended, a failed payment on Free, a cancellation or a plan reaching its end, a blocked collection reaching `access_until`.
- **A renewal paid on time, or a resume while the period runs, sends neither**: access did not change.
- **Not sent yet.** Mesub has them behind a switch it turns on later, for every project at once. Until an endpoint receives one, keep asking `hasAccess`; write the branches now so nothing changes the day they arrive. Like any event, they reach an endpoint only when selected for it in the dashboard.
- Once they drive access, a row kept from them is the app's own answer: still ask `hasAccess` for an event without `sequence`, and after a catch-up with `GET /v1/events` apply what it returns by `sequence` too.

## The details

`subscription.created`: `first_payment`, `{ amount, mint, signature }`, what the subscriber's own transaction paid; null when Mesub recorded none (a period paid only in part, which the next charge collects); absent on events written before Mesub added it. Sent with or without the access events.

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
| `retry_mode` | `scheduled` (Mesub retries), `manual` (a retry by hand: the user's from the dashboard, or the customer's Pay now) or null once none is left |

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
| `subscription.access_revoked` | Once Mesub sends it: at the plan's end, `detail.changed_at` the end itself |

- A charge that misses when the plan ends before the next retry has no retry to announce: `next_retry_at` is null, `retries_left` is 0 and `retry_mode` is null. The subscription stays `unpaid` until the plan's end, then ends. Do not word that event as "we will try again on", and do not read `retries_left: 0` as `stopped`: `subscription.stopped` is its own event.
- `subscription.ended` arrives within a few minutes of the plan's end, for a subscription that was still `active` or `unpaid`.
- **Access stopped at the end itself, before the event.** A delivery in between can carry `data.status: "active"` with `data.access: false`. Read `data.access`, never `data.status`, and ask `hasAccess` before granting anything.
- On `data` of any event in the last period, `next_charge_at` is null and `access_until` is never later than the plan's end.

## Test deliveries

A delivery sent with **Send test** in the dashboard is signed like a real one, in the same body. It carries `"test": true` at the top of its body and a made-up subscription whose id is `sub_test`. With an event picked, it has that event's type, so the type alone does not tell a test from a real event.

- Ignore it before any side effect: `assets/handle-event.ts` checks both the flag and the id.
- The SDK types it as `test?: true` on `WebhookEvent`. An older copy does not: read it as `(event as { test?: unknown }).test`, which works with both.
- Never look up `sub_test` in the app's database or mail its made-up address.
- Its event `id` is made up as well: it is not in `GET /v1/events`.
