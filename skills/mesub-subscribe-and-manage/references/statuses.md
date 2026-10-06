# Statuses, and what each allows

The same nine statuses on the server (`ServerSubscription` of `@mesub/node`) and in the browser (`MesubSubscription` of `@mesub/react`). New ones may be added: keep a default branch.

| `status` | What it is | Shown by the widget's lists | Allows |
|---|---|---|---|
| `pending` | A checkout prepared, nothing landed yet. Mesub settles it within the hour | No | Nothing |
| `active` | Running and paid. In the last period of a plan with an end date it has no `next_charge_at` | Yes | Cancel |
| `unpaid` | A payment is late. `late_reason` and `next_retry_at` say more | Yes, as "Payment late" | Cancel |
| `stopped` | Stopped after missed payments. Nothing more is charged | Yes | Cancel |
| `cancelled` | Cancelled, with the paid period still running | Yes | Resume, until `access_until` |
| `ended` | Over. `end_reason` says why: `plan_ended` when its plan reached its end date | Yes | Close, unless `end_reason` is `closed` or `authority_closed` |
| `failed` | A checkout that did not become a subscription: what landed is not Mesub's. Comes with a `reason` on submit | No | Nothing |
| `expired` | A checkout nobody signed in time | No | Nothing |
| `superseded` | A stopped one the wallet came back over: a newer one holds the subscription | No | Nothing |

A `cancelled` subscription reads `ended` once its end date has passed, with `end_reason: "cancelled"`. Between that moment and the next read, the widget already offers Close instead of Resume.

## On a plan with an end date

A plan can have an end date (`ends_at` on the plan, `null` otherwise). A subscription does not carry it: it shows in these fields.

- Nobody has access after the plan's end: `access` is false from that moment, whatever the status, and `access_until` is never later than the end.
- The last period is charged in full, even when the plan ends inside it. In that period `next_charge_at` is `null`, and `next_retry_at` on a late one when the plan ends before the retry.
- At the plan's end, an `active` or `unpaid` subscription turns `ended` with `end_reason: "plan_ended"`. One the customer had cancelled ends with `"cancelled"`.
- Mesub ends it within a few minutes. For that long `status` can read `active` or `unpaid` with `access` false.
- From its end on the plan takes nobody: `create` is refused with `plan_ended`.

## The fields to read, rather than the status

| Field | Read it for |
|---|---|
| `access` | Whether it grants access now. The one answer to "is this customer paid up": never derive it from `status` |
| `access_until` | When access ends unless a charge renews it, never later than the plan's end date. `null` while `access` is false |
| `next_charge_at` | The next charge of a running one. `null` in the last period of a plan with an end date: show `access_until` instead |
| `next_retry_at` | The next try of a late one. Never set together with `next_charge_at`. `null` when the plan ends before the retry |
| `payment_status` | `paid`, `late` or `none` |
| `late_reason` | On `unpaid`: `insufficient_balance` (adding funds fixes it), `approval_revoked` (adding funds does not), `authority_closed` (final), or `null` |
| `end_reason` | On `ended`: `cancelled`, `plan_removed`, `plan_replaced`, `plan_ended`, `authority_closed` or `closed` |
| `paused` | A seat parked over the project's limit: nothing is charged while it is, and the status does not change |
| `wallet` | The wallet that pays it, and the only one that can cancel, resume or close it |
| `plan` | The plan's slug, or `null` |
| `current_period_start`, `current_period_end` | The period paid for last. `null` before the first |
| `created_at`, `confirmed_at` | ISO dates. `confirmed_at` is `null` until it landed |

On the server a subscription also carries `email` and `external_id`. Do not send them to the page.

## In the app's own UI

- For a list drawn by the app in React, do not compute the action: `useSubscriptions()` gives `action` on each subscription (`cancel`, `resume`, `close` or `null`) and re-weighs it when a cancellation reaches its end.
- On the server, without the widget, the table above is the rule. Mesub refuses anything else with a code (`subscription_not_active`, `close_too_early` and the others).
- Do not map a status to access in the app's code: read `access`.
- Word a late payment by its `late_reason`. Telling a customer to add funds when the wallet no longer lets Mesub charge it sends them in circles.
