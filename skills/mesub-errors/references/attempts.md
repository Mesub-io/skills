# Reading an attempt

An attempt is one try at charging one period. Mesub keeps every one. Read them when a subscription is `unpaid` or `stopped` and the question is "what exactly happened to the payment".

```ts
const { data, has_more, paid } = await mesub.subscriptions.attempts(id); // newest first, 20 a page
```

`mesub.subscriptions.allAttempts(id)` walks every page with `for await`. `paid` is `{ count, amount }` over every paid attempt of the subscription, not over the page. An access answer asked with `{ attempts: true }` carries the last ones too, without the retry fields.

If `attempts` throws `not_found` with `apiCode: null`, this Mesub does not serve the route yet; with `apiCode: 'subscription_not_found'` the id is wrong.

## `outcome`

| `outcome` | What happened | Sent to the chain | Uses a retry |
|---|---|---|---|
| `paid` | The transfer landed: the period is paid | Yes | No |
| `skipped` | Mesub read the chain first and found nothing it could charge | No | No |
| `rejected` | The charge failed on the customer's side | No, or refused by the program | Yes |
| `blocked` | The charge could not be made, and the customer has no part in it | No, or not known yet | No |

**Only `rejected` counts against the customer.** The one at the due date turns the subscription `unpaid`; each retry rejected after it is one retry spent, and the last one turns it `stopped`. A `blocked` or `skipped` attempt never uses a retry, however many there are. Mesub comes back to a `blocked` one by itself, about ten minutes later.

Only a `paid` attempt has a `signature`. A `rejected` one moved nothing.

## `reason`

Null on a `paid` attempt, a short stable string in snake case on every other.

**An older Mesub hyphenates them** (`insufficient-balance`, `program:4`, `solana:<code>`). Turn `-` and `:` into `_` before comparing, and both spellings read the same. Three are being renamed, and either name may arrive for a while: `plan_gone` becomes `plan_removed`, `delegation_gone` becomes `closed_elsewhere`, `subscription_cancelled` becomes `cancelled`. Accept both.

### The customer, or their wallet

| `reason` | `outcome` | What it says | What to do |
|---|---|---|---|
| `insufficient_balance` | `rejected` | The wallet holds less than the period owes, or has no token account | The customer adds funds |
| `token_account_reassigned` | `rejected` | The wallet's token account now belongs to someone else | Adding funds does not fix it |
| `program_<code>` | `rejected` | The program refused the transfer. `<code>` is its error number | `program_4`: the wallet no longer lets Mesub charge it. `program_103`, `program_136`: the wallet closed its authorisation. Adding funds fixes neither |
| `subscription_cancelled` or `cancelled` | `skipped` | Cancelled on chain, and the period already paid is over | Nothing: it ended as asked |
| `delegation_gone` or `closed_elsewhere` | `skipped` | The subscription no longer exists on chain. It ends, `authority_closed` | Nothing |

### The user, through the plan

| `reason` | `outcome` | What it says | What to do |
|---|---|---|---|
| `plan_gone` or `plan_removed` | `skipped` | The plan was deleted. The subscription ends, `plan_removed` | Nothing to recover: customers subscribe to another plan |
| `plan_replaced` | `skipped` | Another plan stands at its address. It ends, `plan_replaced` | Same |
| `plan_ended` | `skipped` | The plan's end date has passed. It ends, `plan_ended` | Same |
| `receiver_not_allowed` | `blocked` | The plan's receiver is not among the destinations it allows | The user fixes the plan's receiver in the dashboard |
| `receiver_account_missing` | `blocked` | Neither the receiver nor the user's wallet has an account for that token | The user opens one |
| `puller_not_allowed` | `blocked` | Mesub's puller was taken off the plan | The user puts Mesub's puller back on the plan |
| `program_130`, `program_501`, `program_506`, `program_516`, `program_519` | `blocked` | One of the changes above, made while the charge was on its way | As above |

### Mesub or the network

| `reason` | `outcome` | What it says | What to do |
|---|---|---|---|
| `period_already_paid` | `skipped` | The chain holds the period as paid. Not a failure: `amount` is `0` | Nothing |
| `period_missed` | `skipped` | A whole period went by before Mesub charged it. It is never collected | Nothing |
| `terms_missing` | `blocked` | No terms were signed through Mesub. Never charged, and not tried again | Nothing is charged on it. A subscription made with `create` and `submit` carries its terms |
| `puller_missing` | `blocked` | Mesub's own record of the plan is incomplete | Not the app's to fix: report it to Mesub |
| `mint_gone` | `blocked` | The token could not be read | Wait: Mesub tries again |
| `gone_unconfirmed` | `blocked` | The plan or the subscription read as gone once. Mesub reads it again | Wait |
| `send_unconfirmed` | `blocked` | A transfer is being sent, or its send was cut short | Wait |
| `landing_unknown` | `blocked` | An earlier transfer may have landed. Mesub waits for the chain to say | Wait: a `paid` attempt is recorded if it landed |
| `program_400` | `blocked` | The program says the period is charged already: its clock is behind | Wait |
| `solana_<code>` | `blocked` | Any other error of the chain, with its number | Wait |
| `transport` | `blocked` | The network did not answer, or not in time | Wait |

`program_<code>` is the one reason that comes under two outcomes: `blocked` for the six numbers named above, `rejected` for every other. Both lists grow, and `<code>` is any number the chain answers: keep a default branch on `reason` and on `outcome`.

`assets/read-attempt.ts` is this table as a function: whose doing an attempt is, whether it spent a retry, whether Mesub tries again.

## The other fields

| Field | What it says | Null when |
|---|---|---|
| `attempted_at` | When Mesub recorded the attempt | Never |
| `amount` | What was asked for, in the token's smallest unit, as a string. On a `paid` one, what moved | Never |
| `signature` | The transaction that paid | The outcome is not `paid` |
| `retry` | True when a charge for this period had already failed | Never |
| `retry_number` | Which retry it was. 1 is the first after the missed charge | It is not a retry of the plan's |
| `retries_allowed` | How many retries the period had when the attempt ran | It is not a retry of the plan's |
| `period_start` | The start of the period it was for | Mesub stopped before reading the period |

`retry_number` and `retries_allowed` are also null, with `retry` true, on a retry fired by hand from the dashboard on Dev or Business.

## From an attempt to a diagnosis

1. Read the newest attempts until the last `paid` one.
2. Any `rejected` since: the cause is on the customer's side. Its `reason` says which, and `late_reason` on the subscription says the same more coarsely.
3. Only `blocked` or `skipped` since: the customer did nothing wrong and no retry was spent. Check the plan first (receiver, puller), then wait.
4. No attempt at all on a subscription that is `pending`, `expired` or `failed`: the checkout never started, nothing was ever charged.
5. No attempt at the end of a period on an `active` subscription whose `next_charge_at` is null: it is in the last period of a plan with an end date. Nothing failed: no charge is due, and it ends with the plan (`reasons.md`).
