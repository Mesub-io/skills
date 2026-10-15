# Subscribing from the server, without the widget

For an app that has its own wallet UI, or no React. Three calls from the server, with the wallet in between: the server creates, the wallet signs the terms, the server asks for a fresh transaction, the wallet signs it, the server submits. The API key never leaves the server. `assets/server-subscriptions.ts` holds the server part ready to copy.

If the app is React and has no reason to own the wallet step, use the widget instead: it does all of this, the fresh transaction, expired terms and unknown outcomes included.

## Two clocks

| What | Lives | So |
|---|---|---|
| The terms | Five minutes today: read `terms.expires_at` | The customer has time to read them |
| A transaction | 150 blocks from the moment it is built, about half a minute: `transaction_expires_at` estimates when | It is asked for last, and signed at once |

`create` builds both together, so the time the customer spends reading the terms is taken off its transaction. That is why the order is: terms signed first, then a fresh transaction, signed at once, then submit.

## 1. Create, on the server

```ts
const { subscription, transaction, terms, costs } = await mesub.subscriptions.create({
    plan: 'pro',
    wallet, // the wallet that signs and pays
    external_id: user.id, // optional: the app's own id for this customer
    email: user.email, // optional: where their notices go
});
```

- **Pass `external_id` when the app has a login**, from the verified session. It is how an access check by `external_id` finds this customer later, whichever wallet pays. Without it the subscription is only known by its wallet.
- `wallet` is the address the page's wallet connected. `plan` is chosen on the server from a list the app wrote, not copied from the request unchecked.
- Keep `subscription.id`. Send `terms` and `costs` to the page. The `transaction` of `create` is already ageing: the wallet signs the one of step 3.
- `create` is sent once and never retried by the SDK.
- Called again for the same plan, wallet and customer while nothing has landed, it answers the same subscription with a fresh transaction. The customer is the `external_id`, or the `email` when no id was given. To refresh the transaction of a subscription the app holds the id of, `transaction(id)` is the call (step 3).

What it answers:

| Field | What it is |
|---|---|
| `subscription` | `{ id, status }`, `pending` at this point |
| `transaction` | Base64, signed by nobody. Good for about half a minute |
| `last_valid_block_height` | A string: the block height after which the transaction can no longer land |
| `transaction_expires_at` | ISO date: when that height is expected to pass, about half a minute after the answer. An estimate that errs early. Use it for a countdown, or to ask a fresh transaction before it runs out |
| `terms.message` | Plain text, one fact per line: the amount, the period, who is paid, how to cancel, and when the plan ends if it has an end date (below) |
| `terms.expires_at` | ISO date, five minutes after `create` today. Read the field, do not hard-code the delay |
| `costs` | In lamports, as strings. `rent` is a deposit returned when the subscription is closed, `fee` is spent. `rent.authority` is `null` when the customer already has one for that token |

### A plan with an end date

Nobody has access past a plan's end date, and the last period is charged in full even when the plan ends inside it. Mesub writes both in `terms.message`, so the customer reads them before signing. The lines that say what is charged, for a plan of 20 USDC every 30 days:

```text
Amount: 20 USDC every 30 days
First charge: 20 USDC now, in the transaction you sign next
Then: 20 USDC every 30 days, until you cancel, or the plan ends on 2027-01-01
Last charge: 20 USDC, in full, for the last period that starts before the plan ends
Access: stops when the plan ends on 2027-01-01, even if the last period paid for is not over
```

With no end date the third line stops at "until you cancel" and the last two are absent. When the plan ends before a second charge can be made, the first one is the only one:

```text
Amount: 20 USDC, a single charge
Single charge: 20 USDC now, in full, in the transaction you sign next
Access: until the plan ends on 2026-10-02, even if the period paid for is not over
No further charge: the plan ends on 2026-10-02
```

- **Show the message as it is.** The date is the plan's end, as a day in UTC. A page that words these lines its own way, or prints "per month" beside a single charge, tells the customer something other than what they sign.
- Do not work out which case it is from the plan: read it in the terms. The `Amount` line ends with `, a single charge` when it is one.
- After a single charge the subscription has `next_charge_at` `null` and `access_until` at the plan's end.

## 2. Sign the terms, in the browser

Show `terms.message` and the costs **before** asking the wallet anything. Then the first signature, before `terms.expires_at`: the terms, as a message, over the UTF-8 bytes of `terms.message`. It goes back as base58: `terms_signature`. Keep the message that was signed beside it.

The snippets of this page are written with a wallet from the app's own wallet library. Check `bs58` and the Solana library are installed in the project before using them, and adapt them to the wallet API the app already has.

```ts
import bs58 from 'bs58';

const signedMessage = terms.message;
const signature = await wallet.signMessage(new TextEncoder().encode(signedMessage));
const terms_signature = bs58.encode(signature);
```

## 3. A fresh transaction, on the server, then the wallet signs it

Once the terms are signed and the wallet is ready, the page asks the app's server, which asks Mesub:

```ts
const fresh = await mesub.subscriptions.transaction(subscriptionId);
// what create answers: { subscription, transaction, last_valid_block_height, transaction_expires_at, terms, costs }
```

Check the id belongs to the signed-in user first (the asset does). The call takes the id and nothing else: the wallet, the plan and the customer are the subscription's own, and nothing new is reserved. Its half minute starts here, so the page has the wallet sign `fresh.transaction` **at once, without sending it**:

```ts
import { VersionedTransaction } from '@solana/web3.js';

const bytes = Uint8Array.from(atob(fresh.transaction), (c) => c.charCodeAt(0));
const signed = await wallet.signTransaction(VersionedTransaction.deserialize(bytes));
const signedTransaction = btoa(String.fromCharCode(...signed.serialize()));
```

- **The wallet must not send this transaction.** Mesub co-signs it and sends it. A page that calls the wallet's "sign and send" here breaks the subscription.
- **Always sign the transaction of the last call.** An older one is not the one Mesub expects any more.
- **Compare `fresh.terms.message` with the message the wallet signed.** The message carries the nonce and the expiry of the terms, so the comparison is exact. The same text: the same terms, submit with the signature already made. Another text: new terms, so show them and have the wallet sign that message before the transaction. The old signature is refused with `invalid_terms_signature`.
- The terms come back unchanged while they have more than two minutes left before `terms.expires_at`. New ones come after that, after a submit that spent them, or when the plan changed.
- Put nothing between the call and the signature: no confirmation screen, no extra click.
- **Ask again before it runs out, not after.** When the wallet is not ready by `transaction_expires_at` (a wallet popup left open, a slow hardware wallet), call `transaction(id)` again and have the new one signed. Do not trust the date over the chain: a transaction refused as expired is rebuilt whatever the time says. An installed package whose types do not name `transaction_expires_at` still hands it back: read it as `(fresh as { transaction_expires_at?: string }).transaction_expires_at`.

It is refused like `create` (the plan stopped taking subscribers, `insufficient_balance`, `already_subscribed`), with `subscription_not_found`, and with `not_awaiting_signature` (409) when the subscription is no longer `pending`: signed already, expired or ended. For one that expired, `create` again.

`subscriptions.transaction` is newer than `create` and `submit`: check it in the installed `node_modules/@mesub/node/dist/index.d.ts`. In a version without it, calling `create` again with the same plan, wallet and customer answers the same subscription with a fresh transaction, and is what to call in its place. Tell the user the package is behind.

## 4. Submit, on the server

```ts
const result = await mesub.subscriptions.submit(subscriptionId, {
    transaction: signedTransaction,
    terms_signature,
});
// An older package's types do not name reason_code: it is in the answer all the same.
const reasonCode = (result as { reason_code?: string }).reason_code;

if (result.subscription.access) {
    // it landed
} else if (reasonCode === 'transaction_expired') {
    // not a failed payment: nothing was charged. Ask transaction(id) again, as in step 3
} else if (reasonCode === 'nothing_landed') {
    // still pending: it may land. Read it back later, never create anew
} else {
    // it did not land: show `reason`, a sentence that may be reworded, and keep this default branch
}
```

Check the id belongs to the signed-in user before submitting (the asset does). Branch on `subscription.access`, then on `reason_code`, never on the words of `reason` nor on the absence of an error. A subscription returned with access makes the SDK drop the cached "no" for that customer, so an access check right after asks Mesub again.

## How long submit takes

It waits for the chain: up to 90 seconds for one send, and up to 130 seconds in all with its own replays. Lower it where the host cuts sooner:

```ts
await mesub.subscriptions.submit(id, body, { timeout: 25_000, budget: 40_000 });
```

`timeout` is per send, `budget` the whole submit, both in milliseconds. A replay sends the same request: Mesub recognises what it already co-signed and answers from the chain, so a customer is never charged twice.

## When the outcome is unknown

When no send got an answer and the subscription read back is not running, `submit` throws a `MesubSubmitError`. **The wallet may still have paid: do not create a new subscription.**

```ts
import { MesubSubmitError } from '@mesub/node';

try {
    await mesub.subscriptions.submit(id, body);
} catch (error) {
    if (error instanceof MesubSubmitError) {
        // error.subscription: the subscription read back, or null if that read failed too
        const now = await mesub.subscriptions.retrieve(id);
        // active: it landed. pending: it may still land, read again later.
    }
    throw error;
}
```

A `pending` subscription is settled by Mesub on its own within the hour: `active` if the transaction landed, `expired` if it did not. Create a new one only once it reads `expired`. Tell the customer the payment may be pending, never that it failed.

## Refusals

Thrown as a `MesubError`. `apiCode` is Mesub's own code, `code` the SDK's broader one (`conflict`, `forbidden`, `plan_not_found`, `not_found`, `rate_limited`, `unavailable`). New codes get added: keep a default branch.

| On | `apiCode` | What to do |
|---|---|---|
| `create` | `already_subscribed` | This wallet already holds this plan: show it, do not retry |
| `create` | `insufficient_balance` | The wallet cannot pay the first period |
| `create` | `plan_not_found` | Fix the slug |
| `create` | `plan_ended` | The plan is past its end date: stop offering it |
| `transaction` | `not_awaiting_signature` | It is no longer `pending`. Read it back: `active` landed, `expired` needs a new `create` |
| `submit` | `terms_expired` | Create again and have the fresh terms signed |
| `submit` | `terms_changed` | The plan changed since, or its end has come too close for the second charge the terms name. Create again: the new terms say it is a single charge |
| `submit` | `transaction_expired` | The transaction was signed too late: nothing was sent, nothing was charged. Ask `transaction(id)` for a new one, as in step 3, and submit again under the same id. **Never create a new subscription for it** |
| `submit` | `transaction_refused` | The network's simulation refused it for another cause. Nothing was sent. Not the same case: show Mesub's `message` as written |
| `submit` | `subscription_not_found` | The id is not one of the project's |

### After `transaction_expired`

```ts
try {
    return await mesub.subscriptions.submit(id, signed);
} catch (error) {
    if (!(error instanceof MesubError) || error.apiCode !== 'transaction_expired') throw error;
    const fresh = await mesub.subscriptions.transaction(id); // same id, no create
    // back to the page: sign fresh.transaction at once, and fresh.terms.message if it is not the text already signed
    return { expired: true, transaction: fresh.transaction, terms: fresh.terms };
}
```

The same submit sent again cannot land, and the terms may have been spent by it: that is why the new transaction comes with terms to compare. The subscription is still the same `pending` one. Do not loop without the customer: each round needs their wallet. Tell them the signature came too late and nothing was charged, then ask again.

`create`, `transaction` and `submit` are each limited to 60 calls a minute per API key.

A 429 carries `retryAfter`, in milliseconds, and on `create` it may ask for most of an hour. Show Mesub's `message` as written when `apiCode` is set.

## Reading back

```ts
await mesub.subscriptions.retrieve(id);
await mesub.subscriptions.list({ external_id: user.id }); // { data, has_more }, 20 a page

for await (const sub of mesub.subscriptions.listAll({ external_id: user.id })) {
    // every page
}
```

`list` names the customer by exactly one of `external_id`, `wallet` or `email`: none or two throws a `TypeError`. It also takes `plan`, `limit` (1 to 100) and `starting_after`. Expired checkouts are in the list: filter on `status` before showing it.
