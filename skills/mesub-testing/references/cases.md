# The cases to test, and what each answers

What the guards and the widget routes of `@mesub/node` answer in each situation, read from the SDK's source and run against the fake. Use it to choose the cases and to know which status is the right one to expect.

## A paid route

`requirePlan` (Express), `withMesub` (Next.js) and `RequirePlan` (NestJS) decide the same way.

| Situation | How a test sets it | Answer |
|---|---|---|
| A subscriber | `fake.grant(customer, 'pro')` | 200, the handler runs |
| Signed in, nothing on the plan | nothing, or `fake.deny(customer, 'pro')` | 402, body `{ access: false, reason: 'no_access', status: 'none' }` |
| Signed in, Mesub says no for a reason | `fake.deny(customer, 'pro', { status: 'stopped' })` | 402, `status` is the one given |
| Nobody signed in | `customer` returns `null` | 401, `reason: 'unauthenticated'`, and Mesub is not asked |
| Mesub down, customer never seen | `fake.fail('outage')` | 503, header `Retry-After: 30`, `reason: 'unavailable'` |
| Mesub rate-limits, customer never seen | `fake.fail({ status: 429, code: 'rate_limited' })` | 503, the same |
| Mesub down, customer let through before | grant, one request, then `fake.fail('outage')` | 200, from the last answer |
| Mesub down, customer refused before | deny, one request, then `fake.fail('outage')` | 402, from the last answer |
| Mesub refuses the API key | `fake.fail({ status: 401, code: 'invalid_api_key' })` | An error, never a refusal (below) |
| The slug is not a plan | `new FakeMesub({ plans: ['pro'] })` and a guard on another slug | An error, never a refusal (below) |

The minimum for any paid route is the first four rows and the first outage row. A test that only checks the 200 passes on a route with no guard at all.

What the handler receives when let through (`res.locals.mesub` in Express, the second argument in Next.js, `@MesubAccess()` in NestJS): `wallet`, `customer` (`{ kind, value }`), `plan` (the one that let the request through), `answer` (Mesub's answer) and `stale` (true when it came from the outage fallback).

With several plans, `requirePlan(['pro', 'team'], ...)`, the first that grants lets the request through and `plan` says which. Three at most.

With `onDenied`, the guard answers what that function answers: assert the app's own redirect or body, for each of the three reasons (`unauthenticated`, `no_access`, `unavailable`).

### Integration errors are thrown, not answered

A refused key, an unknown slug, or a `customer` that returns an empty value or two identifiers is a broken integration. The guard throws it rather than answer 402, so a broken setup never reads as "has not paid".

What the browser then gets depends on the framework:

- **Express**: the error goes to `next(err)`. Express's default error handler answers with the status the error carries: 401 for a refused key, 404 for an unknown slug. Measured, not 500. If the app has its own error handler, the test asserts what that one answers.
- **Next.js**: the handler rejects with the `MesubError` (`code` `unauthorized` or `plan_not_found`). Assert the rejection.
- **NestJS**: the guard throws the error as it is.

Do not assert a 500 on Express without an error handler that produces it. Tell the user when a refused key would be answered 401 on a paid route: a front that reads 401 as "signed out" will send every visitor to the login page.

## The widget routes

Paths are under the mount point (`/api/mesub` in the examples). Error bodies are `{ error: { code, message } }`. Every answer carries `Cache-Control: no-store`.

| Request | Answer |
|---|---|
| `GET /plans/:slug` | 200 with the plan, signed in or not. 404 `plan_not_found` for a slug that is not in the fake's `plans`, or not in the routes' own `plans` option |
| `GET /subscriptions` | 200 `{ subscriptions, has_more }`, only those of who is signed in, without `email` or `external_id`. 401 `unauthenticated` signed out |
| `GET /subscriptions/:id` | 200 `{ subscription, upcoming, payments, paid, payments_error }`. 404 `subscription_not_found` for another customer's, exactly as for an unknown id |
| `POST /subscriptions` with `{ plan, wallet }` | 201 with `subscription` (`id`, `status: 'pending'`), `transaction`, `terms`, `costs`. 400 `invalid_request` when one is missing. 409 `already_subscribed` when that wallet holds the plan. 403 `wallet_mismatch` when `customer` is a wallet and the body names another |
| `POST /subscriptions/:id/submit` with `{ transaction, terms_signature }` | 201 `{ subscription }`, now `active`. 409 `not_awaiting_signature` the second time |
| `POST /subscriptions/:id/cancel`, `/resume`, `/close` | 201 `{ transaction, last_valid_block_height }`, or Mesub's 409 |
| `POST /subscriptions/:id/cancel/confirm` (and `resume`, `close`) with `{ signature }` | 201 `{ subscription }`. 400 `nothing_to_confirm` before the step was built |
| A POST whose `Content-Type` is not JSON | 415 `unsupported_media_type`, nothing sent to Mesub |
| A body that is not JSON (Express) | 400 `invalid_request` |
| Any other method on `/subscriptions` | 405 `method_not_allowed` |
| Any other path | 404 `not_found` |
| Mesub down | 503 `unavailable`, handed on |
| Mesub rate-limits | 429 `rate_limited` with its `Retry-After`, handed on |
| Mesub refuses the API key | Thrown, as on a guard |

The cases that protect a customer, and that are worth a test in every app:

1. A signed-out read of `/subscriptions` answers 401.
2. A signed-in user gets only their own subscriptions, and a 404 for somebody else's id.
3. The subscription created is tied to the signed-in user: read the POST the fake received in `fake.requests` and check its `external_id`.

`assets/widget-routes.test.ts` holds all three.

## The cache

Test it only when the app depends on it. Give an answer a lifetime with `fake.grant(customer, 'pro', { revalidate_after: 60 })`: the client then serves it without asking the fake, and `fake.requests` stays at one call. A verified webhook for that customer drops it (`webhooks.md` in this folder).

Never add a cache of the app's own around the check to make a test faster: the SDK already has one, and a second one keeps a subscriber who was stopped.
