# Statuses, and what each allows

The same nine statuses on the server (`ServerSubscription` of `@mesub/node`) and in the browser (`MesubSubscription` of `@mesub/react`). New ones may be added: keep a default branch.

| `status` | What it is | Shown by the widget's lists | Allows |
|---|---|---|---|
| `pending` | A checkout prepared, nothing landed yet. Mesub settles it within the hour | No | Nothing |
| `active` | Running and paid. In the last period of a plan with an end date it has no `next_charge_at` | Yes | Cancel |
| `unpaid` | A payment is late. `late_reason` and `next_retry_at` say more | Yes, as "Payment late" | Cancel |
| `stopped` | Stopped after missed payments. Nothing more is charged. `stop_reason` says why | Yes | Cancel; Close at once when `stop_reason` is `authority_closed` |
| `cancelled` | Cancelled, with the paid period still running | Yes | Resume, until `access_until` |
| `ended` | Over. `end_reason` says why: `plan_ended` when its plan reached its end date | Yes | Close while `closable` is true |
| `failed` | A checkout that did not become a subscription: what landed is not Mesub's. Comes with a `reason` on submit | No | Nothing |
| `expired` | A checkout nobody signed in time | No | Nothing |
| `superseded` | A stopped one the wallet came back over: a newer one holds the subscription | No | Nothing |

A `cancelled` subscription reads `ended` once its end date has passed, with `end_reason: "cancelled"`. Between that moment and the next read, the widget already offers Close instead of Resume.

**Close is decided by `closable`, never by the status.** `closable: true`: offer Close now. `closable: false` with `closable_from`: say "Close from" that date. Both `false` and `null`: no Close yet; a running subscription, or one stopped with `out_of_retries`, must be cancelled first. Both are as Mesub last read the chain, so a close may still be refused.

## Why it stopped: `stop_reason`

Set only on a `stopped` subscription, `null` otherwise and on one that stopped before Mesub recorded why. Word it for the customer from this, not from the status:

| `stop_reason` | Say | What they can do |
|---|---|---|
| `out_of_retries` | "Every retry of the missed payment failed" | Subscribe again, or cancel and close once the period ends |
| `retry_deadline_passed` | "The last day to pay the missed payment passed" | The same |
| `authority_closed` | "Your wallet closed the authorisation that let us charge it" | It cannot come back: close it now to get the deposit back, then subscribe anew if they want |
| `null`, or another | "Payments stopped" | Keep a default branch: values are added |

## On a plan with an end date

A plan can have an end date (`ends_at` on the plan, `null` otherwise). A subscription does not carry it: it shows in these fields.

- Nobody has access after the plan's end: `access` is false from that moment, whatever the status, and `access_until` is never later than the end.
- The last period is charged in full, even when the plan ends inside it. In that period `next_charge_at` is `null`, and `next_retry_at` on a late one when the plan ends before the retry.
- At the plan's end, an `active` or `unpaid` subscription turns `ended` with `end_reason: "plan_ended"`. One the customer had cancelled ends with `"cancelled"`.
- Mesub ends it within a few minutes. For that long `status` can read `active` or `unpaid` with `access` false.
- From its end on the plan takes nobody: `create` is refused with `plan_ended`.

## When charges are blocked

A charge can fail for a reason that is not the customer's: the plan's own setup, or Mesub itself. The subscription is then blocked, and no status says so. Two fields do, on a subscription and on an access answer alike:

| `blocked_reason` | Whose cause | Who fixes it |
|---|---|---|
| `puller_not_allowed` | The merchant's: Mesub's puller was taken off the plan | The merchant, on the plan |
| `receiver_not_allowed` | The merchant's: the receiving wallet is not among the plan's destinations | The merchant, on the plan |
| `receiver_account_missing` | The merchant's: the receiving wallet has no account for the plan's token, and nobody else can be paid | The merchant |
| `mint_gone` | The merchant's plan: its token no longer exists | Not the app, not the customer |
| `mesub` | Mesub's, whatever it is | Nothing to fix on the merchant's side |
| `null` | Not blocked | |

`blocked_since` is the ISO date that block began, `null` with `blocked_reason`. Both are `null` on anything but an `active` or `unpaid` subscription, and on a parked seat.

- **The status does not change.** It stays `active` (or `unpaid` if it was late already), and `payment_status` with it: a blocked customer is never `late` for it.
- **Access has an end all the same: `access_until`.** `access` is never true past it on a blocked subscription. Under `mesub` that is the end of the period after the one paid for. Under a cause of the plan's setup it comes sooner: the time the plan gives a late payment for its retries, and minutes only when it gives none.
- **Mesub keeps trying.** `next_charge_at`, or `next_retry_at` on one that was late already, is the next try. Access comes back with the first charge that goes through, or that the chain holds as paid, with nothing for the customer to sign.
- **The customer did nothing wrong and can fix nothing.** Do not word it as a late payment, do not ask them to add funds or to subscribe again. Say the charge is on hold and until when they keep access (`access_until`).
- **The fix is the merchant's.** For a cause of the plan's setup, tell the user of this skill which one it is: Mesub also mails the merchant once per plan. An agent cannot repair a plan from the app's code.
- `blocked_reason` may gain values: keep a default branch.

So `status: 'active'` with `access: false` is not only a plan past its end date: it is also a blocked subscription whose `access_until` has passed. One more reason to read `access`.

## The fields to read, rather than the status

| Field | Read it for |
|---|---|
| `access` | Whether it grants access now. The one answer to "is this customer paid up": never derive it from `status` |
| `access_until` | When access ends unless a charge renews it, never later than the plan's end date. `null` while `access` is false |
| `next_charge_at` | The next charge of a running one. `null` in the last period of a plan with an end date: show `access_until` instead |
| `next_retry_at` | The next try of a late one. Never set together with `next_charge_at`. `null` when the plan ends before the retry |
| `payment_status` | `paid`, `late` or `none` |
| `late_reason` | On `unpaid`, and on `stopped` for the payment it stopped on: `insufficient_balance` (adding funds fixes it), `approval_revoked` (adding funds does not), `authority_closed` (final), or `null` |
| `stop_reason` | On `stopped`: `out_of_retries`, `retry_deadline_passed` or `authority_closed`, see above |
| `end_reason` | On `ended`: `cancelled`, `plan_removed`, `plan_replaced`, `plan_ended`, `closed_elsewhere` (the subscription account closed outside Mesub) or `closed` |
| `closable`, `closable_from` | Whether the wallet can close it now and get its deposit back, and from when if not: see above |
| `blocked_since`, `blocked_reason` | Since when its charges are blocked for a cause that is not the customer's, and whose cause. Both `null` otherwise: see above |
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
- Before wording a missed charge, read `blocked_reason`: a blocked subscription is not a late one.
- Word a late payment by its `late_reason`. Telling a customer to add funds when the wallet no longer lets Mesub charge it sends them in circles.
