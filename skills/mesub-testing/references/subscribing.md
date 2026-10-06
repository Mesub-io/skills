# Subscriptions and payments in the fake

How the fake answers `mesub.subscriptions` and what a test can set: for an app that subscribes or manages from its own server, or that shows a customer's subscriptions and payments. Every code below was run against the fake of `@mesub/node` 0.1.0.

## Put a subscription there

```ts
const wallet = 'wallet-of-user-42'; // any string: the fake does not check addresses

const subscription = fake.addSubscription({ wallet, plan: 'pro', external_id: 'user_42' });
fake.setAttempts(subscription.id, [{}, { outcome: 'skipped', reason: 'insufficient-balance' }]);
```

- `addSubscription(fields)` needs `wallet` and `plan`. The rest defaults to an active, paid subscription with id `sub_fake_1` and up, `external_id` and `email` null. `retrieve` and `list` then answer it.
- **It does not change the access answer.** A subscription added this way is not let through a guard until `fake.grant(...)` says so. The two are set apart on purpose.
- `setAttempts(id, attempts)` gives it its charges. Each defaults to `outcome` `paid`, `amount` `"9990000"`, `reason` null, `retry` false. `subscriptions.attempts(id)` answers them newest first with `paid: { count, amount }` over all of them. It throws for an id the fake does not hold.
- Outcomes: `paid`, `skipped`, `rejected`, `blocked`.

## The whole subscribe flow

No wallet and no chain: the fake accepts any signed transaction and lands it at once.

```ts
const created = await mesub.subscriptions.create({ plan: 'pro', wallet, external_id: 'user_42' });
// created.subscription.status === 'pending'; created.transaction and created.terms.message are made up

const { subscription } = await mesub.subscriptions.submit(created.subscription.id, {
    transaction: created.transaction,
    terms_signature: 'signed-by-the-test',
});
// subscription.status === 'active'; the customer now has access by wallet, external_id and email
```

| Call | The fake answers | Refusals |
|---|---|---|
| `create` | A `pending` subscription, a made-up `transaction`, zero `costs`, `terms` that expire in five minutes | 400 `invalid_request` without `plan` and `wallet`. 404 `plan_not_found`. 409 `plan_ended` once the plan's end date has passed. 409 `already_subscribed` when that wallet holds the plan (`active`, `cancelled`, `unpaid`) |
| `create` again, same customer, wallet and plan | The same pending subscription | |
| `submit` | `active`, paid, a period of 30 days, and access granted under each name the subscription carries. On a plan that ends inside those 30 days: `access_until` at the plan's end and `next_charge_at` null | 409 `not_awaiting_signature` when it is not `pending` |
| `retrieve`, `list` | What was added or created, newest first | 404 `subscription_not_found` |

`fake.endPlan(plan)` ends every subscription the fake holds on that plan, as it ends the access answers: `plan_ended` for an `active` or `unpaid` one, `cancelled` for a cancelled one. Giving a plan an end date: `fake-mesub.md` in this folder.

## Cancel, resume, close

Each is two calls: one builds a transaction, the other confirms the signature the wallet got. The fake takes any non-empty signature.

```ts
await mesub.subscriptions.cancel(id);
await mesub.subscriptions.confirmCancel(id, { signature: 'any' });
```

| Step | After the confirm | Refused with (409) |
|---|---|---|
| `cancel` / `confirmCancel` | `cancelled`, access kept to the end of the period, `cancelled_at` set on the access answer | `subscription_cancelled` when it already is. `subscription_not_active` unless `active`, `unpaid` or `stopped` |
| `resume` / `confirmResume` | `active` again | `subscription_not_cancelled`. `subscription_ended` once the period paid for is over |
| `close` / `confirmClose` | `ended`, `end_reason` `closed`, no access | `subscription_not_cancelled` unless cancelled or `stopped`. `close_too_early` before `access_until` has passed. `subscription_not_on_chain` when closed already |

A confirm before its step was built answers 400 `nothing_to_confirm`.

To test a close, add a subscription whose paid period is over:

```ts
const over = fake.addSubscription({
    wallet,
    plan: 'pro',
    status: 'cancelled',
    access: false,
    access_until: new Date(Date.now() - 1000).toISOString(),
});
```

## Asserting a refusal

A refusal is a `MesubError`. `code` is the kind (`conflict` for every 409, `not_found`, `plan_not_found`, `invalid_request`), `apiCode` is Mesub's own code from the tables above, `status` the HTTP status. Assert on `apiCode`:

```ts
await expect(mesub.subscriptions.resume(over.id)).rejects.toMatchObject({
    status: 409,
    apiCode: 'subscription_ended',
});
```

## What was sent

`fake.requests` holds every call. To check that the app ties a subscription to the right customer, read the body of the POST:

```ts
expect(fake.requests.find((call) => call.method === 'POST')?.body).toMatchObject({
    plan: 'pro',
    external_id: 'user_42',
});
```
