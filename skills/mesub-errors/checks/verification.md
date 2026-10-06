# Verification: Mesub Errors

Go through every check before saying the work is done. Say which ones you could not run.

## 1. The diagnosis rests on a fact

Write down, before any fix, what was actually observed:

- the layer that answered (a guard, the widget routes, a thrown error, a subscription read back);
- the status, and the code: `apiCode` and `code` of a `MesubError`, or `error.code` of a refusal body;
- for a payment: the subscription's `status`, `late_reason` or `end_reason`, and the newest attempts with their `outcome` and `reason`.

Pass: each of these was read from a response, a log line or a call, not inferred from a screen or from the user's summary. If the user only gave a summary, ask for the failing request's status and body, or the server log line. Never ask for the API key.

## 2. The code was looked up, not remembered

Pass: the code, reason or outcome is in `references/api-error-codes.md`, `references/reasons.md` or `references/attempts.md`, and the fix applied is the one written there. If it is in none of them, it is newer than this skill: say so, handle it by the default branch, and point the user at the errors page in `references/docs.md`. Do not invent its meaning.

## 3. The static check

From the project root:

```bash
node "<skill-dir>/scripts/check-error-handling.mjs"
```

`<skill-dir>` is the folder that holds `SKILL.md`.

Pass: no `FAIL` line. Open every `WARN` line and either fix it or say why it is fine here: a branch on the message of an error that is not Mesub's is fine, one on a Mesub error is not.

## 4. The handling you wrote

Read it against these, one by one:

- it branches on `apiCode` or `code`, never on `message`, and has a default branch that rethrows or reports;
- nothing loops on a `retryable` error, and nothing sleeps a `retryAfter` inside a request a browser waits on;
- `retryAfter` is used as milliseconds on the server, and turned into seconds for a `Retry-After` header;
- a `MesubSubmitError` leads to a `retrieve`, never straight to a new `create`;
- no `catch` turns a failed access check into `false`, and none answers the browser 401 for a refused API key;
- nothing logs the client, its options, the request headers or the environment.

Pass: all six.

## 5. It compiles

Run the project's own typecheck and build.

Pass: no new error. A type error on `error.apiCode` or `error.retryAfter` usually means the value was not narrowed with `instanceof MesubError` first. Do not silence it with a cast.

## 6. The failure, reproduced where it can be

What an agent can reproduce by itself:

- a refusal of the project's own routes, with `curl -i` against the running server: signed out for the 401, a wrong slug for `plan_not_found`, a made-up id for `subscription_not_found`;
- the handling itself, in a unit test that throws a `MesubError` built with the fields under test (`references/sdk-errors.md`, "In tests").

Pass: the route answers the status and code the tables give, and the test shows the branch taken.

What an agent cannot reproduce, and must say so:

- an error that needs real state on Mesub's side: a late payment, a full project, a rate limit, an outage, a plan changed in the dashboard;
- anything a wallet must sign, and whether a transaction landed;
- what the dashboard shows, and anything the fix asks the user to do there (a key, a plan, a receiver, a retry by hand);
- time: a retry that comes hours later, a `pending` subscription settled within the hour.

For each of these, tell the user exactly what to look at and what a good result is.

## What to report

- The fact the diagnosis rests on, and the layer it came from.
- The cause, in one sentence, and whose it is: the code, the customer's wallet, the plan, or Mesub.
- What was changed, file by file, or that nothing in the code was wrong.
- Each check above as passed, failed or not run, with the reason for any not run.
- What the user or the customer must still do, and what only time will show.
