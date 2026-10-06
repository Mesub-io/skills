# Refusals and errors

## What a guard answers by default

| Status | Header | Body |
|---|---|---|
| 401 | | `{ "access": false, "reason": "unauthenticated" }` |
| 402 | | `{ "access": false, "reason": "no_access", "status": "none" }` |
| 503 | `Retry-After: 30` | `{ "access": false, "reason": "unavailable" }` |

- `status` in the 402 is the subscription's status for the first plan asked (`none`, `stopped`, `ended`, `unpaid` and so on). It is there only when Mesub gave an answer.
- A 402 only ever means Mesub said no. During an outage, a customer whose last known answer was "no" still gets 402: that answer is the fallback's.
- A 503 means nobody knows: Mesub failed, was rate limited, or did not answer within the guard's budget, and nothing was cached for that customer and that plan.
- In NestJS the three are thrown as an `HttpException` with the same status and body.

## `onDenied`

It receives a `Denial`:

| Field | What it holds |
|---|---|
| `reason` | `unauthenticated`, `no_access` or `unavailable` |
| `status` | 401, 402 or 503: what would be answered without `onDenied` |
| `answer` | Mesub's answer for the first plan asked, or `null` (always `null` on 401, and on a 503) |

How it answers depends on the framework:

| Framework | Signature | Rule |
|---|---|---|
| Express | `(denial, req, res, next) => unknown` | It replaces the whole default answer: send something on every path. May be async; a throw goes to `next(err)` |
| Next.js | `(denial, request) => Response \| Promise<Response>` | It must return a `Response`. It replaces the whole default answer |
| NestJS | `(denial, request) => unknown` | It answers by throwing its own exception. If it returns, the default refusal is thrown |

Rules that hold for all three:

- **Branch on `denial.reason`.** One answer for all three sends an outage to the pricing page, and a signed-out visitor too.
- **Keep the status codes.** 401, 402 and 503 are what the front, a mobile app or another service branch on. Change the body, keep `denial.status`, unless the answer is a redirect.
- **In Express and Next.js, set `Retry-After` yourself** on `unavailable`: the default header goes with the default answer.
- **In NestJS, do not throw on `unavailable`.** Return, and the default 503 keeps its `Retry-After`: `onDenied` has no response to set a header on.
- **In Express, calling `next()` from `onDenied` lets the request through ungated.** Do it only when that is the point, such as serving a preview.

`assets/express-gates.ts`, `assets/next-gates.ts` and `assets/nest-gates.controller.ts` each show one.

## What is thrown instead

A guard and `hasAccess` turn exactly one thing into an answer: Mesub being unreachable (`unavailable` or `rate_limited`, after the retries). Everything else is thrown, because it is a broken integration and must be loud.

| Thrown | When | What to do |
|---|---|---|
| `TypeError` | A guard built without `customer`, with no plan or more than three; a customer naming two identifiers or an empty one; `hasAccess` without a plan; a wrong option given to `new Mesub()` | Fix the code |
| `MesubError`, `code: 'unauthorized'` | Mesub refused the API key: wrong, rotated, or another project's | The user checks the key in the dashboard |
| `MesubError`, `code: 'plan_not_found'` | No plan of this project under that slug | Compare the slug with the dashboard |
| `MesubError`, `code: 'invalid_request'` | A wallet that is not an address, an email that is not one | Fix what `customer` returns |

Where it goes: Express hands it to `next(err)`, Next.js and NestJS let it end as a 500. Under Express the default error handler answers a thrown error's own status, so without an error handler of the app's own a refused key shows as 401 and an unknown slug as 404. Give the app an error handler that answers 500 for a `MesubError`. Leave it there. Do not map it to 401 or 402: a refused key answered as 402 tells every subscriber to pay again.

`access` and `accessList` throw in one more case: `MesubError` with `code: 'unavailable'` or `'rate_limited'` when Mesub cannot answer. They have no fallback. On a screen, catch only those:

```ts
import { MesubError } from '@mesub/node';

try {
    return await mesub.access({ external_id: user.id }, 'pro');
} catch (error) {
    // Only "Mesub cannot answer right now". A bad key or slug stays loud.
    const down = error instanceof MesubError && (error.code === 'unavailable' || error.code === 'rate_limited');
    if (down) return null;
    throw error;
}
```

A `MesubError` carries `code`, `status` (the HTTP status, or `null` when no response came back), `apiCode` (Mesub's own finer code), `retryable`, `retryAfter` (milliseconds, or `null`) and `body`. Mesub may add codes: keep a default branch.

## The front's side

Whatever calls the paid route must keep the three apart:

```ts
const response = await fetch('/api/reports', { credentials: 'include' });

if (response.status === 401) return showSignIn();
if (response.status === 402) return showPlans(); // the only case that means "subscribe"
if (response.status === 503) {
    const seconds = Number(response.headers.get('Retry-After')) || 30;
    return retryIn(seconds); // not a refusal: say so, and try again
}
```

A front that treats every non-200 as "not subscribed" shows the pricing page during an outage. A 500 is the integration itself: show a plain error, never the plans.
