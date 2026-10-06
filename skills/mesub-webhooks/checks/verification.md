# Verification: Mesub Webhooks

Go through every check before saying the work is done. Say which ones you could not run.

## 1. The static check

From the project root:

```bash
node "<skill-dir>/scripts/check-webhooks.mjs"
```

`<skill-dir>` is the folder that holds `SKILL.md`.

Pass: no `FAIL` line. Read every `WARN` and either fix it or say why it is fine here. A `PASS` on the raw body or on the event id is a reading of the code: open the handler and confirm it.

## 2. The signing secret never left the server

Read, do not assume:

- `git status` and `git diff` show no env file added and no value starting with `whsec_`.
- The env file that holds `MESUB_WEBHOOK_SECRET` is matched by `.gitignore`.
- No client file, and nothing under a browser prefix, names it.
- Nothing you wrote logs it, the `webhook-signature` header, the request headers as a whole or the whole environment.

Pass: all four. If the secret was written to a tracked file or shown in the conversation at any point, tell the user it must be replaced in the dashboard, even if the file was fixed since.

## 3. It compiles

Run the project's own typecheck and build.

Pass: no new error. Do not silence an error on an event name or on `test` with `any` over the whole event: narrow the one read, as `assets/handle-event.ts` does, so the other branches stay typed.

## 4. The handler refuses what is not Mesub's

Start the server the way the project does, then, with the real port and path:

```bash
node --env-file=.env "<skill-dir>/scripts/send-test-delivery.mjs" http://localhost:3000/webhooks/mesub
```

`--env-file` names the env file the server itself reads. If the secret is only in the host's settings, the script cannot sign: say so and go to check 7.

Pass:

- the three deliveries that are not Mesub's (unsigned, another secret, an hour old) are refused with a 4xx. A 2xx on any of them means anyone can post events: stop and fix it.
- the delivery signed correctly is answered 2xx. A 500 or a 400 here means the body was parsed before the check, or the server runs with another secret. A 3xx, 401 or 403 means the route is behind the app's login.
- the same delivery again is answered 2xx.

## 5. One event, one effect

The script cannot see this. Read the handler, or run it in the project's tests with two deliveries carrying the same id (`references/local-testing.md`):

- the id is recorded by one atomic write, in a store that survives a restart and is shared by every instance;
- a second delivery with the same id is answered 2xx and does nothing;
- when the handling throws, the id is released (or the write was in the same transaction), and the answer is a 5xx.

Pass: all three, each shown in the code or by a test. If the store is a stub or in memory, the work is not done: say so.

## 6. It answers in time, and the unknown is acknowledged

- No call to another service, mail or long query sits between the request and the answer. Slow work is handed off first.
- A type the code does not handle is answered 2xx, by a `default` branch.
- A test delivery (`"test": true`, `sub_test`) has no side effect.
- No branch grants or revokes access from the event alone.

Pass: all four, read in the code.

## 7. A real delivery, by the user

An agent cannot register an endpoint, read its secret or receive a delivery from Mesub. Tell the user exactly this:

1. In the dashboard, under Developers then Webhooks, add the endpoint's public HTTPS URL and select its events. `subscription.renewal_upcoming` is only sent if selected.
2. Put that endpoint's signing secret in the server's environment as `MESUB_WEBHOOK_SECRET`, without pasting it anywhere else, and restart the server.
3. On the endpoint, click **Send test**, once with no event picked and once for each event the handler has a branch for.
4. Confirm each one reached the handler and was answered with a 2xx.

For a server on a laptop, steps 1 to 3 need a tunnel first: `references/local-testing.md`.

Pass: the user confirms step 4. Until then, report the handler as written and checked locally, not as receiving events.

## What nothing here proves

- A real renewal, missed payment or `subscription.renewal_upcoming`: they come from a subscription living through its period.
- The behaviour over three days of retries, and an endpoint being disabled.
- That production has the secret: only the user can see the host's settings.

## What to report

- The files you created or changed, the route's path, and where event ids are stored.
- Each check above as passed, failed or not run, with the reason for any not run.
- What the user must still do: checks 7 and, in production, the endpoint, its events and its secret.
