# The routes the widget calls

`@mesub/react` never talks to Mesub. It calls routes on the app's own server, mounted by `mesubRoutes` (`@mesub/node/express`, also for the `main.ts` of NestJS) or `mesubRouteHandlers` (`@mesub/node/next`). Mounting them for the first time is the first-setup task and is not repeated here: this page is what they take, what they answer and how they fail.

## Options

| Option | What it is |
|---|---|
| `customer` | Required. A function of the request returning who is signed in: `{ external_id }`, `{ wallet }`, `{ email }`, or `null` for nobody. From a session the app verified, never from the request itself |
| `email` | A function of the request returning where that customer's notices go, when `customer` is not an email. Mesub does not verify it |
| `plans` | The slugs the widget may read and subscribe to: `['pro', 'team']`. Any plan of the project by default. Name them to keep a plan off the site |
| `client` | A `Mesub` the app built itself. By default one built from `MESUB_API_KEY` |

Leaving `customer` out throws a `TypeError` when the routes are built. A `customer` that returns an empty string throws on the request: return `null` when nobody is signed in.

## The routes

Paths are under the mount point.

| Route | What it does | Answers |
|---|---|---|
| `GET /plans/:slug` | The plan to show. Public: nobody needs to be signed in | 200 with the plan, 404 `plan_not_found` |
| `GET /subscriptions` | The customer's subscriptions, newest first, the 500 newest at most | 200 `{ subscriptions, has_more }` |
| `GET /subscriptions/:id` | One of them, with what is charged next and its latest payments | 200 `{ subscription, upcoming, payments, paid, payments_error }` |
| `POST /subscriptions` | Prepares one: body `{ plan, wallet }` | 201 with the terms and a transaction |
| `POST /subscriptions/:id/submit` | Sends what the wallet signed: body `{ transaction, terms_signature }` | 201 `{ subscription, reason? }` |
| `POST /subscriptions/:id/cancel`, `/resume`, `/close` | Builds the transaction the wallet signs and sends | 201 `{ transaction, last_valid_block_height }` |
| `POST /subscriptions/:id/cancel/confirm`, and the two others | Confirms it: body `{ signature }` | 201 `{ subscription, reason? }` |

What the routes guarantee, so the app does not add it on top:

- **Every subscription is tied to what `customer` returned**, whatever the browser sends. The body of `POST /subscriptions` carries a plan and a wallet, never an identity.
- **A subscription that is not that customer's answers 404** `subscription_not_found`, the same as one that does not exist.
- **The app's own id and email never reach the browser**: `external_id` and `email` are removed from every subscription served.
- A `POST` that is not `application/json` is refused (415), so a plain form on another site cannot send one. A body over 64 kB is refused (413).
- Every answer carries `Cache-Control: no-store`.

## Refusals

A refusal is `{ "error": { "code": "...", "message": "..." } }`.

| Status | `code` | When |
|---|---|---|
| 400 | `invalid_request` | A body that is not JSON, or misses `plan` and `wallet`, the signed pair, or `signature` |
| 401 | `unauthenticated` | `customer` returned `null`. Always "nobody is signed in on the site", never anything else |
| 403 | `wallet_mismatch` | `customer` names a wallet and the page asked to subscribe another one |
| 404 | `plan_not_found`, `subscription_not_found`, `not_found` | An unknown slug or one outside `plans`, a subscription that is not theirs, any other path |
| 405 | `method_not_allowed` | Neither GET nor POST |
| 409 and others | Mesub's own code | Mesub refused: its status, its code and its message, handed on as written |
| 429 | Mesub's code, or `rate_limited` | The API key's rate limit, answered at once with `Retry-After` |
| 502 | the SDK's code | Mesub could not be reached or answered something unreadable. A fixed message, never the server's own details |
| 500 | none | Thrown to the framework: Mesub refused the API key (missing, wrong, rotated), or something in front of Mesub turned the server away |

**Never turn that 500 into a 401.** The widget reads a 401 as "sign in first", and every visitor would get the sign-in screen for a broken key.

## Timings

- A plan is read from the project's plan list, kept in memory for 60 seconds per `Mesub` client: a change to a plan shows in the widget within a minute. `mesub.plans.list` and `mesub.plans.retrieve` themselves are never cached.
- Each request gives Mesub 10 seconds for its reads.
- **Submit and the confirms hold the request while Mesub waits for the chain.** A confirm takes up to 90 seconds, and the submit route up to 130 with the SDK's own replays, while the widget waits 90. The routes take no option to shorten this. On a host that cuts requests sooner (many serverless functions do), the window shows "Still confirming" and Check again, which is safe but slow: raise that route's limit in the host's own settings, and tell the user when you cannot.

## Checking by hand

```bash
curl -i http://localhost:3000/api/mesub/plans/pro          # 200 and the plan, signed out
curl -i http://localhost:3000/api/mesub/subscriptions       # 401 unauthenticated, signed out
```

Signed in (a session cookie from the browser), the second answers 200 with that customer's list. A 200 while signed out means `customer` names somebody without a session: stop and fix it.
