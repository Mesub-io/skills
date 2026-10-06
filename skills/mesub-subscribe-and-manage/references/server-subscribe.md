# Subscribing from the server, without the widget

For an app that has its own wallet UI, or no React. Three calls, with the wallet in the middle: the server creates, the wallet signs twice, the server submits. The API key never leaves the server. `assets/server-subscriptions.ts` holds the server part ready to copy.

If the app is React and has no reason to own the wallet step, use the widget instead: it does all of this, expired terms and unknown outcomes included.

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
- Keep `subscription.id`. Send `transaction`, `terms` and `costs` to the page.
- `create` is sent once and never retried by the SDK.
- Called again for the same plan, wallet and customer while nothing has landed, it answers the same subscription with a fresh transaction. The customer is the `external_id`, or the `email` when no id was given.

What it answers:

| Field | What it is |
|---|---|
| `subscription` | `{ id, status }`, `pending` at this point |
| `transaction` | Base64, signed by nobody |
| `last_valid_block_height` | A string |
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

## 2. Sign, in the browser

Show `terms.message` and the costs **before** asking the wallet anything. Then two signatures, in this order, both before `terms.expires_at`:

1. the terms, as a message, over the UTF-8 bytes of `terms.message`. Its signature goes back as base58: `terms_signature`;
2. the transaction, **signed and not sent**. It goes back as base64.

The snippet below is the one of the docs page, with a wallet from the app's own wallet library. Check `bs58` and the Solana library are installed in the project before using it, and adapt it to the wallet API the app already has.

```ts
import bs58 from 'bs58';
import { VersionedTransaction } from '@solana/web3.js';

const signature = await wallet.signMessage(new TextEncoder().encode(terms.message));
const terms_signature = bs58.encode(signature);

const bytes = Uint8Array.from(atob(transaction), (c) => c.charCodeAt(0));
const signed = await wallet.signTransaction(VersionedTransaction.deserialize(bytes));
const signedTransaction = btoa(String.fromCharCode(...signed.serialize()));
```

**The wallet must not send this transaction.** Mesub co-signs it and sends it. A page that calls the wallet's "sign and send" here breaks the subscription.

## 3. Submit, on the server

```ts
const { subscription, reason } = await mesub.subscriptions.submit(subscriptionId, {
    transaction: signedTransaction,
    terms_signature,
});

if (subscription.access) {
    // it landed
} else {
    // it did not land, and `reason` says why: create again
}
```

Check the id belongs to the signed-in user before submitting (the asset does). Branch on `subscription.access`, not on the absence of an error. A subscription returned with access makes the SDK drop the cached "no" for that customer, so an access check right after asks Mesub again.

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
| `submit` | `terms_expired` | Create again and have the fresh terms signed |
| `submit` | `terms_changed` | The plan changed since, or its end has come too close for the second charge the terms name. Create again: the new terms say it is a single charge |
| `submit` | `transaction_expired` | Create again |
| `submit` | `subscription_not_found` | The id is not one of the project's |

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
