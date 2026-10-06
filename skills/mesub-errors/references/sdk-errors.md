# What `@mesub/node` throws

## `MesubError`

Every failed call to Mesub, after the SDK's own retries.

| Field | What it holds |
|---|---|
| `status` | The HTTP status, or `null` when no response came back (network error, timeout) |
| `code` | One of ten: `invalid_request`, `unauthorized`, `forbidden`, `not_found`, `plan_not_found`, `conflict`, `rate_limited`, `unavailable`, `invalid_webhook`, `unexpected` |
| `apiCode` | Mesub's own finer code (`already_subscribed`, `close_too_early`, ...), or `null` when no Mesub error came back |
| `retryable` | Whether the same call, unchanged, may succeed later. Mesub's flag when it sent one, otherwise true for 408, 429, 5xx and when nothing answered |
| `retryAfter` | **Milliseconds** Mesub asked to wait, from `Retry-After`, or `null` |
| `body` | What Mesub answered, parsed when it is JSON; `undefined` when nothing came back |
| `message` | Mesub's sentence, for a person. It may be reworded: never branch on it |
| `cause` | The underlying error, when there is one |

`code` tells the kind of failure, `apiCode` tells the cause within it. Two wallets refused for different reasons are both `conflict`: branch on `apiCode` to tell them apart, and keep a default branch on both.

### The codes that are not Mesub saying no

| `code` | When | What to do |
|---|---|---|
| `unauthorized` | Mesub refused the API key | The user checks the key. Let it throw: the framework logs it and answers 500 |
| `plan_not_found` | The slug is not a plan of this project | Fix the slug |
| `unexpected` | A status with no code of its own (408, 413), a 2xx whose body is not what the SDK reads, or a 404 that is not Mesub's | The message names `baseUrl` on a 404: check the base URL and any proxy in front |
| `invalid_webhook` | A webhook that fails verification: a header missing, no signature matching, a timestamp too far from now | Answer 400. It is thrown by verification, not by a call to Mesub |
| `unavailable` with `status: null` | No response: a timeout or a network error, after the retries | Mesub may be fine and the server's network not: check outbound access before blaming Mesub |

### 404

Four different things answer 404:

- `plan_not_found`: a slug.
- `not_found` with `apiCode: 'subscription_not_found'`: an id.
- `not_found` with `apiCode: null` from `subscriptions.attempts`: this Mesub does not serve the attempts route yet.
- `unexpected`: the 404 carries no Mesub error at all. The base URL is wrong or has a path prefix too many.

## What the SDK already retried

| Call | Timeout | Retried by the SDK |
|---|---|---|
| Reads (`access`, `plans.*`, `subscriptions.retrieve`, `list`, `attempts`) | 5 s per try (`timeout`) | Twice (`maxRetries`), with backoff, waiting a `Retry-After` up to 60 s |
| `subscriptions.create`, `cancel`, `resume`, `close` | 5 s | Never |
| `confirmCancel`, `confirmResume`, `confirmClose` | 90 s | Never. A confirm cut short changed nothing: send it again with the same signature |
| `subscriptions.submit` | 90 s per send, 120 s in all (`timeout`, `budget`), plus up to 10 s to read back | The same request up to twice more, when a send got no answer or a retryable error |

So an error that reaches the app has already been retried where retrying is safe. A loop around it multiplies the calls and, on a rate limit, feeds it.

## `MesubSubmitError`

A `MesubError` thrown by `subscriptions.submit` when no answer said what became of the transaction. It adds `subscription` (the subscription read back, never `active` nor `cancelled`, or `null` when that read failed too) and `sends` (how many times the submit was sent).

| Case | `code` | `retryable` |
|---|---|---|
| No send got an answer that says: a timeout, a network error, a 5xx | `unavailable` | true |
| A replay refused with `not_awaiting_signature` after a send that got no answer | `conflict` | false |
| A 2xx the SDK cannot read | `unexpected` | false |

In all three **the wallet may have paid**. Read the subscription with `subscriptions.retrieve` before anything else: `active` means it landed, `pending` may still land and Mesub settles it by itself within the hour (`active` or `expired`). Create a new one only once it reads `expired` or `failed`.

Sending the same submit again, with the same transaction and the same terms signature, is safe: Mesub recognises what it already co-signed and answers from the chain, so nothing is paid twice.

`submit` needs up to 130 s by default. On a host that cuts requests sooner, pass `{ timeout, budget }` as its third argument, both in milliseconds; a send cut short may still land, so read the subscription back.

`assets/settle-submit.ts` is this handling, ready to copy.

## Errors that are not a `MesubError`

- A `TypeError` from `new Mesub()`: an option is wrong or the API key is missing. It names the option. Thrown at start, before any call.
- A `TypeError` from a guard or the widget routes: `customer` returned something Mesub cannot be asked about (two identifiers, an empty one).
- The reason of an `AbortSignal` passed in `options.signal`: the caller's own abort, thrown as is.
- `MesubError` with `status: null` and `code: 'invalid_request'`: an empty subscription id, refused before any call.

## In tests

`MesubError` and `MesubSubmitError` are exported from `@mesub/node` with their constructors, so a test can throw one with the fields it needs:

```ts
import { MesubError } from '@mesub/node';

throw new MesubError('You are already subscribed to this plan.', {
    status: 409,
    code: 'conflict',
    apiCode: 'already_subscribed',
});
```
