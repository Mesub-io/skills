# Cancel, resume and close from the server, without the widget

Each action is two calls from the server with the wallet in between. `assets/server-subscriptions.ts` holds the server part ready to copy.

**The API key alone changes nothing.** Only the wallet that pays a subscription can sign for it. There is no call that cancels a customer's subscription from the server, an admin page or a job: if the user asks for one, say so instead of writing something that looks like it.

| To | Build | Confirm | It becomes |
|---|---|---|---|
| Stop the renewals of a running subscription | `cancel(id)` | `confirmCancel(id, { signature })` | `cancelled` |
| Take a cancellation back before its end | `resume(id)` | `confirmResume(id, { signature })` | `active` |
| Close one that is over, and return its deposit | `close(id)` | `confirmClose(id, { signature })` | `ended`, `end_reason: "closed"` |

All six are methods of `mesub.subscriptions`.

## The three steps

The same for the three actions. Here with `cancel`.

### 1. Build, on the server

```ts
const { transaction } = await mesub.subscriptions.cancel(subscriptionId);
```

Find the customer's subscription with `subscriptions.list`, and check the id is theirs before building. Send `transaction` (base64) to the page. **Nothing is cancelled yet.** A build is sent once and never retried by the SDK. A transaction built and never sent changes nothing.

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
const { subscription, reason } = await mesub.subscriptions.confirmCancel(subscriptionId, { signature });

if (reason === undefined) {
    // cancelled: subscription.access_until says when access ends
} else {
    // nothing changed, and reason says why: build a new one to try again
}
```

Mesub waits for the chain, up to 90 seconds (`{ timeout }` in milliseconds as a third argument lowers it), and answers the subscription as it now stands.

- **Branch on `reason`, not on the absence of an error.** A confirm that returns with a `reason` changed nothing.
- **A confirm that timed out changed nothing by itself: send it again with the same signature.** The same confirm is answered the same. Do not build a new transaction for it.
- **Do not skip the confirm.** It is what says whether the transaction landed and what the subscription became. Settled without a `reason`, it also makes the SDK drop the cached access answers of that customer on that plan, so an access check right after asks Mesub again.

## What cancelling does

A cancellation is not an immediate stop.

- A subscription that is paid up **keeps its access until the end of the period it paid for** (`access_until`), and can be resumed until then. Do not lock the customer out when they cancel: keep asking Mesub, which answers yes until that date.
- Once the date has passed it reads `ended`, and closing it returns the deposit the wallet paid when subscribing.
- A subscription cancelled while `unpaid` or `stopped` has no access, and its missed period is never collected.

Say this to the customer before they sign: what they keep, until when, and that closing returns the deposit.

## Refusals

Thrown as a `MesubError`. `apiCode` says which. Keep a default branch: codes get added.

| `apiCode` | When |
|---|---|
| `subscription_not_found` | No subscription of the project under that id |
| `subscription_not_active` | `cancel`: it is not `active`, `unpaid` or `stopped` |
| `subscription_cancelled` | `cancel`: it was cancelled already |
| `subscription_not_cancelled` | `resume` or `close`: nothing cancelled it |
| `subscription_ended` | `resume`: the paid period is over. Subscribe again |
| `plan_deleted` | `resume`: its plan is gone |
| `close_too_early` | `close`: its end has not passed yet |
| `subscription_not_on_chain` | It is closed already |
| `nothing_to_confirm` | A confirm before any transaction was built |

These six calls are limited to 60 a minute per API key. Offer only the action the subscription allows now (see the statuses reference) rather than trying one and catching the refusal.

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
| `signature` | The transaction that paid. `null` unless the outcome is `paid` |
| `retry`, `retry_number`, `retries_allowed` | Whether it was a retry, which one, out of how many. The two numbers are `null` when it is not a retry of the plan's |
| `period_start` | The start of the period it was for, or `null` |

Never do arithmetic on `amount` as a JavaScript number: it is a string because it does not fit one. Keep a default branch on `outcome` and on `reason`. The full table of reasons is on the docs page for managing from the server.

On a Mesub that does not serve this route yet, `attempts` throws a `not_found` whose `apiCode` is `null`. An id the project does not hold is a `not_found` whose `apiCode` is `subscription_not_found`.
