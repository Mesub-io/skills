# Which layer answered

The same status means different things depending on who answered. Find the layer first.

## A guard (`requirePlan`, `withMesub`, the NestJS guard)

A refusal, not an error. The body is `{ access: false, reason }`.

| Status | `reason` | What it means | What to check |
|---|---|---|---|
| 401 | `unauthenticated` | `customer` returned nothing | The session does not reach the guard, or nobody is signed in |
| 402 | `no_access` | Mesub said this customer has no access. The body also carries `status` | Read `status`, then `late_reason` or `end_reason` in `reasons.md`. Check the customer is named the same way as when subscribing |
| 503 | `unavailable` | Mesub could not answer about a customer it never saw. `Retry-After: 30` | An outage or a rate limit, not a no. A customer already seen is served the last answer known |
| 500 | none | The guard threw: a refused API key or an unknown plan | Read the server log. It is a `MesubError` `unauthorized` or `plan_not_found` |

`hasAccess` behaves the same without a response: the last answer known in an outage, `false` for a customer never seen, and it throws on a refused key or an unknown slug. `access` always throws.

## The widget routes (`mesubRoutes`, `mesubRouteHandlers`)

A refusal is `{ error: { code, message } }`.

| Status | `code` | What it means |
|---|---|---|
| 401 | `unauthenticated` | Nobody is signed in on the site. Always the app's own session, never the API key |
| 400 | `invalid_request` | The body lacks a field, or is not JSON |
| 403 | `wallet_mismatch` | The customer is named by wallet and another wallet tried to subscribe. The routes' own check |
| 404 | `plan_not_found` | No such plan, or one left out of the `plans` option |
| 404 | `subscription_not_found` | No such subscription, or one that is not this customer's: the two are answered alike on purpose |
| 404 | `not_found` | A path the routes do not have |
| 405 | `method_not_allowed` | Neither GET nor POST |
| 413 | `payload_too_large` | A body over 64 kB |
| 415 | `unsupported_media_type` | A POST that is not JSON |
| 429 | `rate_limited` | Mesub's rate limit, handed on at once with its `Retry-After` |
| 502 | `unavailable` or `unexpected` | Mesub did not answer, or answered something the SDK cannot read. A fixed message, none of the server's details |
| any other | an API code | Mesub's own refusal, with its status, its code and its sentence: look it up in `api-error-codes.md` |
| 500 | none | The routes threw to the framework: Mesub refused the API key, or `customer` returned a malformed value. Read the server log |

A 404 on every route, with no `error.code` in the body, is not the routes answering: the mount path and the provider's `endpoint` differ.

## The widget in the browser (`@mesub/react`)

The widget handles its own failures and shows a screen for each. An app does not catch them: `useSubscriptions` reports `state: 'error'` with `error`, the server's message.

| What the customer sees | What happened |
|---|---|
| "Sign in first" | The routes answered 401 |
| "Wrong wallet" | 403 from the routes |
| "Plan not found" | 404 on the plan |
| "Cannot subscribe", with Mesub's sentence | A 409: Mesub's refusal, as written |
| "Too many requests" | A 429, with the wait in seconds |
| "No answer" | Nothing came back within 15 s on a read or a build |
| "Still confirming" | No word after the transaction was sent. "Check again" never pays twice |

Read the failing request in the browser's network panel: its status and `error.code` are the facts, the screen is a summary.

## A direct call to Mesub from the server

A thrown `MesubError`: `sdk-errors.md`.

## A subscription that exists but does not grant access

Nothing failed in the code. Read the subscription: `reasons.md`, then its payments: `attempts.md`.
