# Every error code of the Mesub API

The lookup table. Find the code, read what it means and what to do.

- **API code**: the `code` of Mesub's error body. In `@mesub/node` it is `error.apiCode`; in a refusal of the widget routes it is `error.code` of the JSON body.
- **SDK code**: the coarser `error.code` of a `MesubError`. It follows the status: 400 `invalid_request`, 401 `unauthorized`, 403 `forbidden`, 404 `not_found` (`plan_not_found` keeps its own), 409 `conflict`, 429 `rate_limited`, 500 and above `unavailable`, anything else `unexpected`.
- **Wait**: "yes" means `retryable` is true: the same request, unchanged, may succeed later. Everything else is final until something changes.
- **`request_id`**: every error body carries it (`req_` and 24 letters or digits), and every answer, errors included, carries it in the `Mesub-Request-Id` header. Log it beside the code, and quote it to Mesub support: it finds the request in Mesub's logs. It names the HTTP request, nothing else.

New codes are added. None is renamed, save two before the first integrator: `plan_deleted` became `plan_removed` and `plan_rebuilt` became `plan_replaced`. Mesub no longer answers the old names, so a branch on them never matches. An unknown code is handled by its status and its `retryable`, never as a crash.

## General

| API code | Status | Wait | What it means | What to do |
|---|---|---|---|---|
| `invalid_request` | 400 | no | A parameter is missing, malformed, or not one the route knows | Read `message` (a validation error lists every fault; the SDK joins them with `; `) and fix the call |
| `unsupported_version` | 400 | no | `Mesub-Version` names a version the API does not serve. The message lists the ones it does | Send a version the message lists, or no header at all |
| `missing_api_key` | 401 | no | No `Authorization: Bearer` header carried a key | Only seen with raw HTTP: the SDK refuses to build a client without a key. Send the header |
| `invalid_api_key` | 401 | no | Not a key Mesub issued, or one rotated since | The user checks the key in the dashboard and the server's environment. Never show it as "signed out" |
| `forbidden` | 403 | no | The request is understood and refused | Treat as a broken integration, not as the customer's doing |
| `not_found` | 404 | no | Nothing at that address | Check the path and the base URL. See "404" in `sdk-errors.md` |
| `conflict` | 409 | no | The request does not fit the current state | Read the subscription back and decide from its `status` |
| `payload_too_large` | 413 | no | The body is too large | Send only what the route asks for. The SDK reads this status as `unexpected` |
| `rate_limited` | 429 | yes | Too many calls this minute | Wait for `Retry-After`. Then find the loop: per API key and per route, every read (access, plans, subscriptions, attempts, events) is limited to 1,000 a minute, every write (create, transaction, submit, cancel, resume, close, their confirms, retry) to 60 |
| `internal_error` | 500 | yes | A failure on Mesub's side | Wait and send again later. Nothing to fix in the app |
| `unavailable` | 503 | yes | Mesub cannot answer right now | Same |
| `network_unavailable` | 503 | yes | The Solana network does not answer, on any call that reaches it: create, transaction, submit, retry, cancel, resume, close and their confirms | Wait for `Retry-After`, about ten seconds. `submit` already does it |

## Plans

| API code | Status | Wait | What it means | What to do |
|---|---|---|---|---|
| `plan_not_found` | 404 | no | No plan of the project under that slug | Fix the slug, or the key is another project's. A broken integration, never "not subscribed" |
| `plan_not_on_chain` | 409 | no | The plan was never published: still a draft | The user publishes it in the dashboard |
| `plan_removed` | 409 | no | The plan is gone from the chain (was `plan_deleted`) | Nothing to resume: the customer subscribes to a plan that exists |
| `plan_sunset` | 409 | no | The plan takes no new subscribers | Stop offering it: show "Subscribe" only when the plan's `available` is true |
| `plan_ended` | 409 | no | The plan is past its end date. With an API key, the answer of `create` | Stop offering it, as for `plan_sunset`. Its subscriptions ended with it: `end_reason` `plan_ended` in `reasons.md`. The dashboard answers the same code elsewhere: see below |
| `plan_replaced` | 409 | no | Another plan now stands at its address, not the one a subscription was signed for (was `plan_rebuilt`) | The user checks the plan in the dashboard |
| `plan_mismatch` | 409 | no | The plan on chain is not the one Mesub recorded | The user checks the plan in the dashboard |
| `receiver_account_missing` | 409 | no | Nobody the plan pays has an account for its token | The user opens a token account for the receiving wallet |
| `receiver_account_frozen` | 409 | no | The account the plan pays for its token is frozen, so the first charge would fail | The user, with whoever froze it. Nothing the customer can do |
| `mint_not_on_chain` | 400 | no | The plan's token does not exist on chain | The user fixes the plan's token |

`plan_ended` in the dashboard: the same code refuses closing that plan to new subscribers, changing its names, and retrying one of its payments by hand. Nothing can be charged on it any more, so none of the three is to be tried again.

### A plan's end date (the dashboard only)

Answered when the user creates a plan with an end date in the dashboard. No call made with an API key answers them, so app code has no branch to write for them: when the user reports one, the fix is the date.

| API code | Status | Wait | What it means | What to do |
|---|---|---|---|---|
| `end_date_too_soon` | 400 | no | The end date is less than one billing period, plus five minutes, away | The user picks a later date, or no end date |
| `end_date_too_far` | 400 | no | The end date is more than 100 years away | Almost always a date sent in milliseconds: an end date is counted in Unix seconds |
| `end_date_stale` | 409 | no | The plan was left unsigned until its end date no longer held | The user changes the date, then signs the creation |

## Subscribing (`create`, and `submit` where noted)

| API code | Status | Wait | What it means | What to do |
|---|---|---|---|---|
| `already_subscribed` | 409 | no | This wallet already holds a running subscription to this plan | Not a failure to fix: show the subscription the customer has |
| `insufficient_balance` | 409 | no | The wallet holds less of the plan's token than the first period costs | The customer adds funds, then create again |
| `seat_cap_reached` | 409 | no | The project is at its tier's subscriber limit | The user frees a seat or changes tier. Nothing the customer can do |
| `pending_cap_reached` | 429 | yes | Too many subscriptions wait for a signature, in the project or for this customer | `Retry-After` says when one frees up, and may be most of an hour: tell the customer, do not hold the request |
| `wallet_mismatch` | 409 | no | The wallet is not the one the subscription was created for | Sign with the wallet that subscribed. The widget routes also answer a 403 of their own under this code: see `where-it-failed.md` |
| `payment_pending` | 409 | no | A payment on this plan failed and is being retried | No new subscription is needed. Read `late_reason` (`reasons.md`): on `insufficient_balance` the customer adds funds and the retry pays |
| `subscription_cancelled` | 409 | no | The wallet's subscription is cancelled and runs to the end of its period. On `cancel`: cancelled already | Resume it rather than subscribe again |
| `subscription_stopped` | 409 | no | The wallet's subscription stopped after missed payments | Read the subscription back and show Mesub's `message`. This table cannot say more: read the errors page named in `docs.md` |
| `subscription_terms_changed` | 409 | no | The plan's terms changed since the wallet's subscription stopped | Create again so the customer reads and signs the terms as they are now |
| `comeback_in_flight` | 409 | yes | A return to this plan may still land | Ask again later, and read the subscription back first |
| `comeback_landed` | 409 | no | A return to this plan landed and is being confirmed | Read the subscription: it is there |
| `comeback_period_rolling` | 409 | yes | A return asked within about two minutes of the end of a billing period | Wait for `Retry-After`, then **create again**: a transaction built before the wait is not taken |
| `subscription_changed` | 409 | yes | Another call took the waiting subscription over meanwhile | Ask again: it settles |

## Signing and sending (`submit`)

| API code | Status | Wait | What it means | What to do |
|---|---|---|---|---|
| `terms_missing` | 403 | no | No terms were handed out for this subscription, or none are left unsigned | Create again and sign what it answers |
| `terms_expired` | 403 | no | The terms ran out, five minutes after `create` | Create again and sign the fresh terms |
| `invalid_terms_signature` | 403 | no | The signature is not the subscription's wallet's, over the terms Mesub handed out | Sign `terms.message` as it came, with the wallet given to `create` |
| `terms_used` | 403 | no | The terms were already spent by another submit | Read the subscription back: an earlier submit may have landed |
| `terms_changed` | 409 | no | Newer terms were handed out, or the plan changed since they were signed. Also when the terms name a second charge and the plan's end date has since come too close for it | Create again: the new terms say what is charged now, a single charge in that last case |
| `not_our_transaction` | 400 | no | The transaction is not the one Mesub built, or the wallet's signature on it is missing or wrong | Send back the last transaction Mesub handed out (`create`, or `subscriptions.transaction(id)` after it), signed and not rebuilt |
| `transaction_not_built` | 409 | no | Submitted before any transaction was built | Call `create` first |
| `transaction_expired` | 409 | no | The transaction was signed too late: it lives about half a minute. Nothing was sent | Ask for a new transaction with `subscriptions.transaction(id)`, have the wallet sign it at once, and the terms again if `terms.message` changed, then submit under the same id. Never create a new subscription for it |
| `transaction_refused` | 409 | no | The network's simulation refused the transaction. Nothing was sent | Nothing was charged. Create again; if it repeats, give the user Mesub's `message` as written |
| `not_awaiting_signature` | 409 | no | The subscription is no longer waiting for a signature: settled, expired or failed | Read it back: its `status` says which |

## Managing (`cancel`, `resume`, `close` and their confirms)

| API code | Status | Wait | What it means | What to do |
|---|---|---|---|---|
| `subscription_not_found` | 404 | no | No subscription of the project under that id | Check the id, and that the key is the project's |
| `subscription_not_active` | 409 | no | Cancel: it is not `active`, `unpaid` or `stopped` | Read its `status`: there is nothing to cancel |
| `subscription_not_cancelled` | 409 | no | Resume or close: nothing cancelled it | Cancel first, or do nothing |
| `subscription_ended` | 409 | no | Resume: the paid period is over | Too late to resume: subscribe again |
| `close_too_early` | 409 | no | Close: its end has not passed yet | Offer Close only when the subscription's `closable` is true; `closable_from` says from when |
| `subscription_not_on_chain` | 409 | no | It is closed already, or gone from the chain | Nothing left to do |
| `nothing_to_confirm` | 400 | no | A confirm before any transaction was built | Call `cancel`, `resume` or `close` first, and confirm with the signature of that transaction |
| `retry_deadline_passed` | 409 | no | A retry by hand after the deadline, on the Free tier | Raised by a retry by hand: the user's from the dashboard, or the customer's Pay now (`subscriptions.retry`). Past the deadline the subscription turns `stopped` |

## Paying a late payment now (`subscriptions.retry`, Pay now)

`POST /v1/subscriptions/{id}/retry` charges the missed period at once, with nothing for the wallet to sign: the customer's Pay now in the widget, or the app's own call. The user's retry from the dashboard follows the same rules: on Free it is one of the missed period's three, whoever fires it. It answers 202 with the subscription, still `unpaid`: the outcome comes with the charge, as `subscription.renewed` or `subscription.payment_failed`. Mesub refuses it first when it cannot succeed, so a refusal spends no retry: it reads the wallet on chain before queuing it, here and on a retry an agent fires through the Mesub MCP server, but not on the user's own click in the dashboard.

| API code | Status | Wait | What it means | What to do |
|---|---|---|---|---|
| `subscription_not_late` | 409 | no | It is not `unpaid`: nothing to pay | Offer Pay now only on an `unpaid` one (the widget's `payable`) |
| `subscription_paused` | 409 | no | A late seat parked over the project's tier cap: nothing may charge it | The user frees a seat or raises the tier. Nothing the customer can do |
| `insufficient_balance` | 409 | no | The wallet holds less than the period costs. No retry was spent | The customer adds funds, then pays again |
| `retry_too_soon` | 409 | yes | The wait since the last retry by hand is not over: 10 minutes on Free, doubling on Dev and Business | Wait for `Retry-After` (`error.retryAfter`) |
| `retries_spent` | 409 | no | On Free, the missed period's three retries by hand are spent | It stops at that period's end. The customer subscribes again then |
| `pull_running` | 409 | yes | A charge of this subscription runs now | Read the subscription back in a moment: it may be paid already |
| `retry_cannot_succeed` | 409 | no | The wallet no longer approves the subscription, its token account is frozen, its authority is closed, or the plan's token no longer exists: the message says which, and `late_reason` names a revoked approval or a closed authority | Adding funds does not help. A revoked approval or a closed authority: the customer subscribes again |
| `subscription_changed` | 409 | yes | Two retries met, or a charge moved the subscription on | Read it back before asking again |
| `plan_ended` | 409 | no | The plan is past its end date | Nothing can be charged on it |
| `unavailable` | 503 | yes | The charge could not be queued. Nothing changed | Wait for `Retry-After`, about 20 seconds |

Sent once and never retried by the SDK: a second call is a second retry.

## Events (`GET /v1/events/{id}`)

| API code | Status | Wait | What it means | What to do |
|---|---|---|---|---|
| `event_not_found` | 404 | no | No event of the project under that id in the last 30 days, or one from before `available_since` | Nothing to catch up on that id: read the subscription for its state now |

A code that is not in this file: fall back on its status and on `retryable`, and read the errors page named in `docs.md`.
