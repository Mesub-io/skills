# `reason_code`, `late_reason`, `stop_reason` and `end_reason`

The fields that say why, on different objects. They are not error codes: nothing was thrown.

## `reason` and `reason_code` of a submit or a confirm

`subscriptions.submit`, `confirmCancel`, `confirmResume` and `confirmClose` answer `{ subscription, reason?, reason_code? }`.

- Both are **absent** when the action settled.
- Both are **present** when nothing was settled, or when what landed is not what Mesub built. One never comes without the other.
- `reason` is a sentence for a person, for instance "The transaction expired before it landed.". Mesub may reword it: show it, never compare it.
- `reason_code` is the same cause for a program: snake case, never reworded. **Branch on it.** It is an open family: Mesub adds codes without a new version, so keep a default branch.

An installed `@mesub/node` whose types do not name `reason_code` still hands it back: the SDK checks the answer and returns the body as Mesub sent it. Read it as `(result as { reason_code?: string }).reason_code` until the package types it.

| `reason_code` | On | What happened | What to do |
|---|---|---|---|
| `transaction_expired` | submit, confirms | Its blockhash ran out before it landed: it never will | **Not a failed payment**, nothing was charged. Ask for a fresh transaction (`subscriptions.transaction(id)` on a checkout, `cancel`, `resume` or `close` again on the others), sign it at once, send it again |
| `nothing_landed` | submit | No subscription stands at its address yet: it stays `pending` | Not a failure either. Read it back later: Mesub settles a `pending` one within the hour. Never create anew until it reads `expired` |
| `transaction_failed` | submit, confirms | It landed and the chain refused it: nothing it held happened | Nothing was charged. Show `reason` and build again |
| `not_our_transaction` | submit | The signature is not of a transaction Mesub built for this subscription | Send the signature of the transaction Mesub handed out, not rebuilt |
| `subscription_mismatch` | submit | What landed names another wallet, plan, amount or period: it is now `failed` | Create again. Never retry the same transaction |
| `subscription_remade` | submit | It landed, and the subscription was closed and made again without Mesub since: now `failed` | Read the customer's subscriptions back |
| `dev_not_running` | submit | Mesub's own Dev plan landed cancelled or part paid: now `failed` | Concerns Mesub's own plan only |
| `earlier_subscription_running` | submit | A comeback paid while the subscription it came back over ran again | Nothing: Mesub was told and sorts it out |
| `cancellation_not_landed` | confirmCancel | It stands on chain with no cancellation | Build again with `cancel` |
| `resume_not_landed` | confirmResume | It stands on chain still cancelled | Build again with `resume` |
| `close_not_landed` | confirmClose | It still stands on chain | Build again with `close` |
| `subscription_not_on_chain` | confirmCancel, confirmResume | It no longer exists on chain | Read it back: nothing left to change |
| `subscription_changed` | confirmCancel | It moved on while the cancellation was read, and was left as it is | Read it back and decide from its `status` |
| `subscription_not_cancelled` | confirmResume | It is no longer cancelled: nothing to resume | Read it back |
| `cancelled_subscription_remade`, `resume_unverified` | confirmResume | The cancelled one cannot be told to be the one on chain: it stays `cancelled` | Read it back. To ask Mesub support, quote the answer's `Mesub-Request-Id` header |
| any other | | A code newer than this file | Show `reason`, read the subscription, and decide from its `status` |

Never compare `reason`'s text, and read the subscription too:

| Call | Settled when | With a `reason` |
|---|---|---|
| `submit` | `subscription.access` is true (`active`, or `cancelled` if the wallet set an end) | `pending`: nothing landed, it may still (`transaction_expired`: ask a fresh transaction under the same id). `failed`: what landed is not what Mesub reserved. Create again once it is `expired` or `failed` |
| `confirmCancel` | No `reason_code`: `cancelled`, and `access_until` says when access ends | Nothing changed. Build a new transaction with `cancel` to try again |
| `confirmResume` | No `reason_code`: `active` again | Nothing changed. Build again with `resume` |
| `confirmClose` | No `reason_code`: `ended` with `end_reason: 'closed'` | Nothing changed. Build again with `close` |

A confirm that timed out changed nothing by itself: send it again with the same signature. A transaction built and never sent changes nothing either.

A submit that throws instead of answering is a refusal (a `MesubError`) or an unknown outcome (a `MesubSubmitError`): `sdk-errors.md`.

## `late_reason`: why a payment is late

Set while `status` is `unpaid`, and on a `stopped` one for the payment it stopped on, on an access answer and on a subscription. Null on every other status, and when Mesub cannot name the cause.

| `late_reason` | What happened | What fixes it |
|---|---|---|
| `insufficient_balance` | The wallet holds less than the price | The customer adds funds. On Dev and Business the next retry then pays, with nothing to sign. On Free nothing retries by itself: the customer's Pay now, or the user's retry from the dashboard, before `retry_deadline` |
| `approval_revoked` | The wallet no longer lets Mesub charge it: revoked in the wallet, or replaced when another app was approved on the same token | **Not** adding funds, and no Mesub route restores the approval: every retry fails, and subscribing again is refused (`payment_pending`). The way out is the customer's: cancel, close once `closable`, then subscribe again |
| `authority_closed` | The wallet closed its authorisation, for good | Nothing: no retry can succeed. It stops with `stop_reason` `authority_closed`, and the customer can close it at once to get the subscription's deposit back |

Read `late_reason` before telling a customer to top up: on two of the three it does not help.

A null `late_reason` on an `unpaid` subscription means the wallet refused the payment and Mesub cannot place why: check that it still holds the amount and can send it.

What happens next depends on the project's tier:

- **Dev and Business**: Mesub retries by itself, 3 times by default, each after a quarter of the period and a day at most. Access stays on while retries run. `next_retry_at` says when, `next_retry_number` and `retries_allowed` which one, and `access_until` is the date of the last retry. When that one fails too the subscription turns `stopped`, `stop_reason` `out_of_retries`.
- **Free**: no automatic retry, and an `unpaid` subscription grants no access. Each retry is by hand, up to 3 for the missed period, until `retry_deadline`: the user's from the dashboard, or the customer's own Pay now in the widget (`subscriptions.retry` on the server), both counted against the same 3. Past it the subscription turns `stopped`, `stop_reason` `retry_deadline_passed`.

So "a paying customer is locked out" on Free is the documented behaviour of an `unpaid` subscription, not a bug in the gate.

## `stop_reason`: why a subscription stopped

Set only when `status` is `stopped`. Null on every other status, and on one that stopped before Mesub recorded why. Keep a default branch: values are added.

| `stop_reason` | What happened | What the customer can do |
|---|---|---|
| `out_of_retries` | Every retry of the missed payment failed | Come back by subscribing again, or cancel it and close it once the period ends |
| `retry_deadline_passed` | On Free, the last day to pay the missed payment passed | The same |
| `authority_closed` | The wallet closed the account that lets Mesub charge it, for good | Nobody can charge it again and it cannot come back. Close it now (`closable` is true) to get the subscription's deposit back |

The webhook `subscription.stopped` carries the last charge's reason in its `detail.reason`; `data.stop_reason` is the one to branch on.

## `end_reason`: why a subscription ended

Set only when `status` is `ended`. It may be null on one that ended before Mesub recorded reasons.

| `end_reason` | What happened | Whose doing |
|---|---|---|
| `cancelled` | The customer cancelled and the paid period ran out | The customer |
| `closed` | The customer closed the subscription through Mesub | The customer |
| `closed_elsewhere` | The subscription account was closed outside Mesub | The customer |
| `plan_ended` | The plan reached its own end date. Its last period was charged in full, and access stopped at that date | The user |
| `plan_removed` | The user deleted the plan | The user |
| `plan_replaced` | Another plan now stands at its address | The user |

`ended` is final. To have access again the customer subscribes again, to a plan that still exists.

`authority_closed` was the `end_reason` of a subscription account closed outside Mesub: Mesub serves `closed_elsewhere` now, and `authority_closed` only names the authorisation closed for good, as `late_reason` and `stop_reason` do. `@mesub/node` 0.1.0 still types `authority_closed` as an `end_reason`, and `explain` reads it as `closed_elsewhere`: a branch may keep both, but Mesub no longer sends the old one.

## Whether it can be closed: `closable` and `closable_from`

Closing a subscription on chain returns the subscription account's deposit to the wallet. The wallet's account for that token, shared by its subscriptions in it, stays open: its deposit does not come back. Every subscription and every access answer says whether that is possible now: never work it out from `status`.

- `closable: true`: the customer can close it now. A cancellation whose end has passed, one that ended with its plan, or one stopped with `stop_reason` `authority_closed`.
- `closable: false` with `closable_from` set: from that date, the end of the period a cancellation set.
- `closable: false` with `closable_from: null`: no date is known yet. A running subscription, or one stopped with `out_of_retries`, must be cancelled first.

Both are as Mesub last read the chain: the close reads it again and may still be refused (`close_too_early`, `subscription_not_on_chain`).

## A plan with an end date

A plan can carry an end date (`ends_at` on the plan, `null` for one with no end). Four things it does look like failures and are not:

| What is seen | Why |
|---|---|
| `access: false` with `status` `active` and `paused` false, or with `unpaid` off the Free tier | The plan's end date has passed. Nobody has access after it, and Mesub ends the subscription within a few minutes: until then the status is unchanged |
| An `active` subscription with `next_charge_at` null, and no charge at the end of its period | Its last period: the plan ends before another charge. `access_until` is never later than the plan's end |
| An `unpaid` one with `next_retry_at` null on Dev or Business | The plan ends before the next retry, so none is scheduled. It stays `unpaid` to the plan's end, then ends |
| A customer charged a full period days before the plan ended | The last period is charged in full even when the plan ends inside it, and access still stops at the end. The terms they signed say both |

At the plan's end an `active` or `unpaid` subscription turns `ended` with `end_reason` `plan_ended`. One the customer had cancelled ends with `cancelled`. A subscription that is cancelled and paid up, with `access: false`, is one cut short by its plan's end.

## The statuses that are not failures

| `status` | Read it as |
|---|---|
| `none` | This customer never subscribed to this plan. If they did, they are being named differently than when they subscribed |
| `pending` | Reserved, waiting for the wallet's transaction. Settled by Mesub within the hour |
| `expired` | A checkout nobody signed. Never in an access answer, only when read by id |
| `failed` | What landed on chain is not what Mesub reserved, so it is not billed. Rare and final |
| `stopped` | Nothing more is charged. `stop_reason` says why: on `out_of_retries` and `retry_deadline_passed` the customer can subscribe again, on `authority_closed` only close it |
| `superseded` | Replaced by a newer subscription of the same wallet to the same plan. Read that one |
| `cancelled` with `access: true` | Normal: the period already paid runs to `access_until` |
| `active` with `access: false` and `paused: false` | The plan's end date has passed: see above. Or its charges are blocked and `access_until` has passed: see below |
| `active` or `unpaid` with `blocked_since` set | Its charges are blocked for a cause that is not the customer's: see below |
| any status with `paused: true` | A seat parked over the project's limit: nothing is charged, access runs to the end of the paid period |

Gate on `access`, never on `status`, and keep a default branch: a status may be added.

## Charges that are blocked

`blocked_since` and `blocked_reason`, on an access answer and on a subscription, say that every charge fails for a cause that is not the customer's. Its attempts read `blocked`. Both are `null` otherwise.

| `blocked_reason` | Cause | Who acts |
|---|---|---|
| `puller_not_allowed` | Mesub's puller was taken off the plan | The user, on the plan |
| `receiver_not_allowed` | The receiving wallet is not among the plan's destinations | The user, on the plan |
| `receiver_account_missing` | The receiving wallet has no account for the plan's token | The user |
| `receiver_account_frozen` | The receiving wallet's account for the plan's token is frozen | The user, with whoever froze it |
| `mint_gone` | The plan's token no longer exists | Not the app, not the customer |
| `mint_paused` | The token's issuer paused it (Token-2022) | The issuer, by lifting the pause |
| `mint_transfer_hook` | The token's issuer gave its transfers a program Mesub does not support (Token-2022) | The issuer, by removing it |
| `mesub` | A cause on Mesub's side | Nobody: wait |

- The status does not change and the customer is never `late` for it. Do not tell them to add funds.
- Access ends on `access_until` all the same: the end of the period after the one paid for under `mesub`, sooner under a cause of the plan's setup.
- Mesub keeps trying. Access comes back with the first charge that goes through, with nothing for the customer to sign.
- Keep a default branch on `blocked_reason`. `@mesub/node` 0.1.0 does not type `mint_paused` and `mint_transfer_hook`: compare them as strings.

## Wording it for the customer

`explain`, exported by `@mesub/node` and by `@mesub/node/situations` for a page, turns an access answer or a subscription into Mesub's own sentences and the actions each side can take. Read its options in the installed package before using it.

Its `key` names the situation. Around a plan's end:

| `key` | When |
|---|---|
| `active_last_period` | `active` with access, an `access_until` and no `next_charge_at`: the plan ends before another charge |
| `unpaid_last_period` | `unpaid` with access and no `next_retry_at`, off the Free tier: the plan ends before the next retry |
| `ended_plan_ended` | `ended` with `end_reason` `plan_ended`, and also `active`, or `unpaid` off the Free tier with no retry ahead, without access: the minutes before Mesub ends it |
| `cancelled_ended` | `ended` with `end_reason` `cancelled`, and also `cancelled`, paid up, without access: cut short by the plan's end |

Keys are added: keep a default branch, and `unknown` is the key of a status or a reason newer than the installed package.
