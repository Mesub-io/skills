# The answer, and what each status means for access

## Three ways to ask

| Call | Returns | When Mesub cannot answer |
|---|---|---|
| `mesub.hasAccess(customer, plan)` | `boolean` | falls back: see `outage-and-cache.md` in this folder |
| `mesub.access(customer, plan)` | the whole answer for one plan | throws |
| `mesub.accessList(customer)` | `{ plans, revalidate_after }`: one answer per plan the customer has anything on. Plans they never subscribed to are left out | throws |

`customer` is `{ external_id }`, `{ wallet }` or `{ email }`, exactly one, or a wallet as a string. A customer with nothing on the plan is not an error: `access` is `false` and `status` is `none`.

## The fields

| Field | What it says |
|---|---|
| `access` | Whether to let them in. The only field a gate reads |
| `status` | Where the subscription stands: see below |
| `payment_status` | `paid`, `late` or `none` |
| `late_reason` | Why an `unpaid` one is late, or `null` |
| `end_reason` | Why an `ended` one ended, or `null` |
| `paused` | `true` on a seat parked over the project's limit: nothing is charged, access runs to the end of the paid period |
| `access_until` | When access ends unless a charge renews it. `null` while `access` is `false` |
| `next_charge_at` | The next charge. `null` when a retry is pending instead, and after a cancellation |
| `next_retry_at` | The next retry of a missed charge |
| `retry_deadline` | On the Free tier only: until when a missed charge can be retried by hand |
| `cancelled_at` | When the customer cancelled, or `null` |
| `current_period_end` | The end of the current period |
| `subscribed_since`, `first_subscribed_at` | The start of the current subscription, and of the very first |
| `wallet` | The wallet that pays. `null` when the customer has nothing on that plan |
| `plan` | The slug asked about |
| `revalidate_after` | Seconds this answer stays true: how long the SDK serves it without asking again |
| `attempts` | The last charges, only when asked with `{ attempts: true }` |

Dates are ISO 8601 strings.

## Statuses

| `status` | `access` | What it means |
|---|---|---|
| `none` | false | This customer never subscribed to this plan |
| `pending` | false | Reserved, waiting for the wallet's transaction to land |
| `active` | true | Paid up |
| `unpaid` | true, **false on the Free tier** | A charge missed. A retry is coming |
| `cancelled` | true until `access_until` | The customer cancelled. The period already paid still runs |
| `stopped` | false | The retries ran out. Nothing more is charged |
| `ended` | false | Over. `end_reason` says why |
| `failed` | false | What landed on chain is not what Mesub reserved, so it is not billed. Rare |
| `superseded` | false | Replaced by a newer subscription of the same wallet to the same plan |

What this means for a gate:

- **Gate on `access`.** `status === 'active'` locks out a customer who cancelled and still has three weeks paid, and one whose payment is a day late on a tier that keeps access during retries.
- **`unpaid` is not one answer.** On the paid tiers of Mesub access stays on while retries run, up to `access_until`. On the Free tier an `unpaid` subscription grants nothing. Only `access` knows which.
- **Mesub may add a status.** Keep a default branch wherever `status` is read, and never let an unknown one grant or refuse by itself: `access` already decided.
- **Use `status` to choose the words, not the door.** A 402 for `none` is "subscribe"; for `stopped` or `ended` it is "your subscription ended"; for `unpaid` on the Free tier it is "your payment is late".

## Why a payment is late

| `late_reason` | What happened | What fixes it |
|---|---|---|
| `insufficient_balance` | The wallet holds less than the price | Adding funds |
| `approval_revoked` | The wallet no longer lets Mesub charge it | Not adding funds |
| `authority_closed` | The wallet closed its authorisation, for good | Nothing |
| `null` | Mesub cannot name the cause | |

Read it before telling a customer to top up.

## Why a subscription ended

`end_reason` on an `ended` one: `cancelled` (the paid period ran out after a cancellation), `plan_ended`, `plan_removed`, `plan_replaced`, `authority_closed` (the wallet closed its authorisation outside Mesub) or `closed` (the customer closed it through Mesub). It may be `null` on an old one.

## The words to show

`explain`, exported by `@mesub/node`, turns an answer into Mesub's own sentences, so a screen does not invent its own:

```ts
import { explain } from '@mesub/node';

const answer = await mesub.access({ external_id: user.id }, 'pro');
const { subscriber, access, actions } = explain(answer, { names: { plan: 'Pro' } });
```

`subscriber` is the sentence for the customer, `access` the line "Access until ..." or "No access", `actions` what can be done now. Read its options in the installed package before using more.
