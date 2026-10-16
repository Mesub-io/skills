# Cancel, resume and close from the server, without the widget

Each action is two calls from the server with the wallet in between. `assets/server-subscriptions.ts` holds the server part ready to copy.

**The API key alone changes nothing.** Only the wallet that pays a subscription can sign for it. There is no call that cancels a customer's subscription from the server, an admin page or a job: if the user asks for one, say so instead of writing something that looks like it.

| To | Build | Confirm | It becomes |
|---|---|---|---|
| Stop the renewals of a running subscription | `cancel(id)` | `confirmCancel(id, { signature })` | `cancelled` |
| Take a cancellation back before its end | `resume(id)` | `confirmResume(id, { signature })` | `active` |
| Close one that is over, and return its deposit | `close(id)` | `confirmClose(id, { signature })` | `ended`, `end_reason: "closed"`. Only while `closable` is true |

All six are methods of `mesub.subscriptions`, and so is the one action that needs no wallet:

- **Pay a late payment now**: `retry(id)`. It charges the missed period at once, with nothing to sign, since the wallet approved the plan when it subscribed. It answers the subscription, still `unpaid`: the outcome comes with the charge, as `subscription.renewed` or `subscription.payment_failed`. On Free it is one of the missed period's three retries by hand, whoever fires it. Mesub refuses it first when it cannot succeed (`subscription_paused`, `subscription_not_late`, `plan_ended`, `retry_too_soon` with `retryAfter`, on Free `retry_deadline_passed` and `retries_spent`, `pull_running`, `retry_cannot_succeed`, `insufficient_balance`, `subscription_changed`), so a refusal spends no retry. A 503 `unavailable` with `retryAfter` means Mesub could not take it now: nothing was charged, ask again after the wait. Sent once and never retried: a second call is a second retry. Offer it only to the customer it belongs to, on an `unpaid` subscription.

## The three steps

The same for the three actions. Here with `cancel`.

### 1. Build, on the server

```ts
const { transaction } = await mesub.subscriptions.cancel(subscriptionId);
```

Find the customer's subscription with `subscriptions.list`, or take `subscription_id` from their access answer, and check the id is theirs before building. Send `transaction` (base64) to the page. **Nothing is cancelled yet.** A build is sent once and never retried by the SDK. A transaction built and never sent changes nothing. It lives about half a minute: `transaction_expires_at` estimates when, and past it the server builds a new one rather than letting the wallet send a dead one.

### 2. Sign and send, in the browser

Unlike subscribing, **the wallet sends this one itself** and pays its network fee. Mesub signs nothing of it. The paying wallet must be the one connected.

The snippet is the one of the docs page, with a wallet and a connection from the app's own wallet library. Check the library is installed and adapt it to the wallet API the app already has.

```ts
import { VersionedTransaction } from '@solana/web3.js';

const bytes = Uint8Array.from(atob(transaction), (c) => c.charCodeAt(0));
const signature = await wallet.sendTransaction(VersionedTransaction.deserialize(bytes), connection);
```

Send `signature` (base58) back to the server.

### 3. Confirm, on the server

```ts
const result = await mesub.subscriptions.confirmCancel(subscriptionId, { signature });
// An older package's types do not name reason_code: it is in the answer all the same.
const reasonCode = (result as { reason_code?: string }).reason_code;

if (reasonCode === undefined) {
    // cancelled: result.subscription.access_until says when access ends
} else if (reasonCode === 'transaction_expired' || reasonCode === 'cancellation_not_landed') {
    // nothing changed and nothing failed: build a new transaction and have it sent again
} else {
    // nothing changed: show result.reason, a sentence that may be reworded. Keep this default branch
}
```

Mesub waits for the chain, up to 90 seconds (`{ timeout }` in milliseconds as a third argument lowers it), and answers the subscription as it now stands.

- **Branch on `reason_code`, not on the absence of an error, nor on the words of `reason`.** A confirm that returns with one changed nothing. `transaction_expired` is no failure of the customer's: the transaction ran out before it landed, build another. Keep a default branch: codes are added.
- **A confirm that timed out changed nothing by itself: send it again with the same signature.** The same confirm is answered the same. Do not build a new transaction for it.
- **Do not skip the confirm.** It is what says whether the transaction landed and what the subscription became. Settled without a `reason`, it also makes the SDK drop the cached access answers of that customer on that plan, so an access check right after asks Mesub again.

## What cancelling does

A cancellation is not an immediate stop.

- A subscription that is paid up **keeps its access until the end of the period it paid for** (`access_until`), and can be resumed until then. Do not lock the customer out when they cancel: keep asking Mesub, which answers yes until that date.
- Once the date has passed it reads `ended`, and closing it returns the deposit the wallet paid when subscribing. Until then `closable` is false and `closable_from` holds that date.
- A subscription cancelled while `unpaid` or `stopped` has no access, and its missed period is never collected.
- On a plan with an end date, access never runs past the plan's end, cancelled or not, and the last period is charged in full even when the plan ends inside it: the terms the customer signed say so. In that last period `next_charge_at` is `null`, and resuming a cancellation brings no charge back: it runs to `access_until`, then ends.

Say this to the customer before they sign: what they keep, until when, and that closing returns the deposit.

## When to offer Close

Never work it out from `status`: read `closable` and `closable_from`, served on every subscription and every access answer.

| `closable` | `closable_from` | Offer |
|---|---|---|
| `true` | `null` | Close, now. A cancellation whose end has passed, one that ended with its plan, or one stopped with `stop_reason` `authority_closed` |
| `false` | a date | "Close from" that date: the end of the period a cancellation set |
| `false` | `null` | No Close. A running subscription, or one stopped with `out_of_retries`, must be cancelled first |

Both are as Mesub last read the chain: `close` reads it again and may still refuse (`close_too_early`, `subscription_not_on_chain`). A stopped subscription with `stop_reason` `authority_closed` can never be charged again nor come back: Close is the one thing left, and it returns the deposit.

## Refusals

Thrown as a `MesubError`. `apiCode` says which. Keep a default branch: codes get added.

| `apiCode` | When |
|---|---|
| `subscription_not_found` | No subscription of the project under that id |
| `subscription_not_active` | `cancel`: it is not `active`, `unpaid` or `stopped` |
| `subscription_cancelled` | `cancel`: it was cancelled already |
| `subscription_not_cancelled` | `resume` or `close`: nothing cancelled it |
| `subscription_ended` | `resume`: the paid period is over. Subscribe again |
| `plan_removed` | `resume`: its plan is gone (was `plan_deleted`, which Mesub no longer answers) |
| `close_too_early` | `close`: its end has not passed yet. Offer Close only when `closable` is true |
| `subscription_not_on_chain` | It is closed already |
| `nothing_to_confirm` | A confirm before any transaction was built |

These six calls are limited to 60 a minute per API key. Offer only the action the subscription allows now (see the statuses reference, and `closable` above) rather than trying one and catching the refusal. A refusal carries `request_id` in its body: log it, and quote it to Mesub support.

## Its payments

```ts
const { data, has_more, paid } = await mesub.subscriptions.attempts(id);

for await (const attempt of mesub.subscriptions.allAttempts(id)) {
    // every page
}
```

`attempts` answers the charges of that subscription, newest first, 20 a page (`{ limit, starting_after }` as a second argument, `limit` 1 to 100). `paid` is `{ count, amount }` over every paid charge since it began, not over the page.

| Field | What it says |
|---|---|
| `id`, `attempted_at` | The attempt, and when Mesub recorded it |
| `outcome` | `paid`, `skipped`, `rejected` or `blocked`. Only `rejected` counts against the customer |
| `reason` | Why it did not pay, a short stable string. `null` on a `paid` one |
| `amount` | What was asked for, in the token's smallest unit, as a string |
| `amount_usd` | `amount` in US dollars at the instant of the charge, a decimal string. `null` until Mesub has priced it. Naming the token: `plan-token.md` |
| `signature` | The transaction that paid. `null` unless the outcome is `paid` |
| `retry`, `retry_number`, `retries_allowed` | Whether it was a retry, which one, out of how many. The two numbers are `null` when it is not a retry of the plan's |
| `period_start` | The start of the period it was for, or `null` |

When every charge is `blocked`, the subscription says so itself: `blocked_since` and `blocked_reason`, in the statuses reference.

Never do arithmetic on `amount` as a JavaScript number: it is a string because it does not fit one. Keep a default branch on `outcome` and on `reason`. The full table of reasons is on the docs page for managing from the server.

On a Mesub that does not serve this route yet, `attempts` throws a `not_found` whose `apiCode` is `null`. An id the project does not hold is a `not_found` whose `apiCode` is `subscription_not_found`.
