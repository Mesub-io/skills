# `reason`, `late_reason` and `end_reason`

Three fields that say why, on three different objects. They are not error codes: nothing was thrown.

## `reason` of a submit or a confirm

`subscriptions.submit`, `confirmCancel`, `confirmResume` and `confirmClose` answer `{ subscription, reason? }`.

- `reason` is **absent** when the action settled.
- `reason` is **present** when nothing was settled, or when what landed is not what Mesub built. It is a sentence for a person, for instance "The transaction expired before it landed.". It is Mesub's own, never written by the SDK, and it may be reworded.

So test for its presence and read the subscription, never compare its text:

| Call | Settled when | With a `reason` |
|---|---|---|
| `submit` | `subscription.access` is true (`active`, or `cancelled` if the wallet set an end) | `pending`: nothing landed, it may still. `failed`: what landed is not what Mesub reserved. Create again once it is `expired` or `failed` |
| `confirmCancel` | `reason === undefined`: `cancelled`, and `access_until` says when access ends | Nothing changed. Build a new transaction with `cancel` to try again |
| `confirmResume` | `reason === undefined`: `active` again | Nothing changed. Build again with `resume` |
| `confirmClose` | `reason === undefined`: `ended` with `end_reason: 'closed'` | Nothing changed. Build again with `close` |

A confirm that timed out changed nothing by itself: send it again with the same signature. A transaction built and never sent changes nothing either.

A submit that throws instead of answering is a refusal (a `MesubError`) or an unknown outcome (a `MesubSubmitError`): `sdk-errors.md`.

## `late_reason`: why a payment is late

Set only while `status` is `unpaid`, on an access answer and on a subscription. Null on every other status, and when Mesub cannot name the cause.

| `late_reason` | What happened | What fixes it |
|---|---|---|
| `insufficient_balance` | The wallet holds less than the price | The customer adds funds. Nothing to sign: the next retry pays |
| `approval_revoked` | The wallet no longer lets Mesub charge it: revoked in the wallet, or replaced when another app was approved on the same token | **Not** adding funds, and no Mesub route restores the approval: every retry fails. The customer can only cancel |
| `authority_closed` | The wallet closed its authorisation, for good | Nothing: no retry can succeed. The customer cancels, then closes it once its period ended to subscribe again |

Read `late_reason` before telling a customer to top up: on two of the three it does not help.

A null `late_reason` on an `unpaid` subscription means the wallet refused the payment and Mesub cannot place why: check that it still holds the amount and can send it.

What happens next depends on the project's tier:

- **Dev and Business**: Mesub retries by itself, 3 times by default, each after a quarter of the period and a day at most. Access stays on while retries run. `next_retry_at` says when, `next_retry_number` and `retries_allowed` which one, and `access_until` is the date of the last retry. When that one fails too the subscription turns `stopped`.
- **Free**: no automatic retry, and an `unpaid` subscription grants no access. The user retries by hand from the dashboard, up to 3 times, until `retry_deadline`. Past it the subscription turns `stopped`.

So "a paying customer is locked out" on Free is the documented behaviour of an `unpaid` subscription, not a bug in the gate.

## `end_reason`: why a subscription ended

Set only when `status` is `ended`. It may be null on one that ended before Mesub recorded reasons.

| `end_reason` | What happened | Whose doing |
|---|---|---|
| `cancelled` | The customer cancelled and the paid period ran out | The customer |
| `closed` | The customer closed the subscription through Mesub | The customer |
| `authority_closed` | The wallet closed its authorisation outside Mesub | The customer |
| `plan_ended` | The plan reached its own end date | The user |
| `plan_removed` | The user deleted the plan | The user |
| `plan_replaced` | Another plan now stands at its address | The user |

`ended` is final. To have access again the customer subscribes again, to a plan that still exists.

## The statuses that are not failures

| `status` | Read it as |
|---|---|
| `none` | This customer never subscribed to this plan. If they did, they are being named differently than when they subscribed |
| `pending` | Reserved, waiting for the wallet's transaction. Settled by Mesub within the hour |
| `expired` | A checkout nobody signed. Never in an access answer, only when read by id |
| `failed` | What landed on chain is not what Mesub reserved, so it is not billed. Rare and final |
| `stopped` | The retries ran out. Nothing more is charged; the customer can subscribe again |
| `superseded` | Replaced by a newer subscription of the same wallet to the same plan. Read that one |
| `cancelled` with `access: true` | Normal: the period already paid runs to `access_until` |
| any status with `paused: true` | A seat parked over the project's limit: nothing is charged, access runs to the end of the paid period |

Gate on `access`, never on `status`, and keep a default branch: a status may be added.

## Wording it for the customer

`explain`, exported by `@mesub/node` and by `@mesub/node/situations` for a page, turns an access answer or a subscription into Mesub's own sentences and the actions each side can take. Read its options in the installed package before using it.
