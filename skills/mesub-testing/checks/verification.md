# Verification: Mesub Testing

Go through every check before saying the work is done. Say which ones you could not run.

## 1. The static check

From the project root:

```bash
node "<skill-dir>/scripts/check-tests.mjs"
```

`<skill-dir>` is the folder that holds `SKILL.md`.

Pass: no `FAIL` line. Read every `WARN` and either fix it or say why it is fine here. Two are never fine: a test header read by code that ships, and a mock of the SDK's module.

## 2. The tests run, with no network

Run the project's own test command.

Pass: every test you wrote passes, and none needs `MESUB_API_KEY`, `MESUB_WEBHOOK_SECRET` or a connection. To prove it, run them once with both variables unset and, if you can, offline. A test that fails only then was calling the real Mesub: find the guard or the handler that was not given the fake's client.

When the fake stands behind the shared default client (`references/seams.md`), the two variables are set by the test setup itself, to the fake's own values: check that they are, and that no real value sits in an env file.

## 3. Each test can fail

A test that cannot fail proves nothing. For each of these, break the code on purpose, see the test go red, then put the code back:

- Remove the guard from the paid route: the 402, 401 and 503 tests must fail.
- Make the webhook handler skip verification (parse the body directly): the "changed body answers 400" test must fail.
- Remove the check on `event.id` from the handler: the "same delivery twice" test must fail.

Pass: each break turned at least one test red. Check with the project's diff tool that nothing of the three breaks is left.

If you cannot edit and re-run, say so and name the tests the user should try this on.

## 4. Nothing for tests is in the code that ships

Read the diff of the files that are not tests:

- No import of `@mesub/node/testing`.
- No branch on the test environment around a guard, a `customer` function or a signature check.
- No header, query or body field that names the signed-in user.
- The only change is the seam: the app or the route built from a client and a `customer` handed in, and production still hands in the real ones.

Pass: all four. The project's typecheck and build still pass.

## 5. No key and no secret was written

- No test file, env file for tests or CI file holds a value starting with `SUB_` or a real `whsec_` value.
- Nothing you wrote prints `fake.apiKey`, `fake.webhookSecret` or the environment.

Pass: both. If a real key or a real signing secret was pasted into a file or the conversation at any point, tell the user it must be rotated in the dashboard, even if the file was fixed since.

## 6. The cases are there

Compare the tests with `references/cases.md`:

- Each paid route: let through, 402, 401, and 503 during an outage for a user never seen.
- The widget routes: 401 signed out, only the user's own subscriptions, the subscription tied to the signed-in user.
- A webhook handler, if any: a signed delivery handled, a changed body refused, a repeat handled once.

Pass: each is covered, or you say which is not and why.

## What an agent cannot verify here

Say these as not covered, whatever the test results. They need the real Mesub and the user:

- That `MESUB_API_KEY` is set on the server and accepted.
- That the slug in the code is a plan of the project.
- That the endpoint's real signing secret is the one in the server's environment, and that Mesub reaches the endpoint: the user sends a test delivery from the dashboard.
- That a person with a wallet can subscribe, and that the paid route then answers 200 for them.

## What to report

- The test files you created or changed, and the one change made to the code that ships, if any.
- Each check above as passed, failed or not run, with the reason for any not run.
- Anything the tests showed about the app: for instance a refused key answered 401 by Express's default error handler.
- The list above, as what the tests do not prove.
