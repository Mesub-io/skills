# Verification: Mesub Quickstart

Go through every check before saying the work is done. Say which ones you could not run.

## 1. The static check

From the project root:

```bash
node "<skill-dir>/scripts/check-setup.mjs"
```

`<skill-dir>` is the folder that holds `SKILL.md`. Add `--server-only` for a project with no React front.

Pass: no `FAIL` line. Read every `WARN` and either fix it or say why it is fine here. A `WARN` about the customer coming from the request is never fine: open the file and prove where the id comes from.

## 2. The key never left the server

Read, do not assume:

- `git status` and `git diff` show no env file added and no value starting with `SUB_`.
- The env file that holds `MESUB_API_KEY` is matched by `.gitignore`.
- No client file, and nothing under a browser prefix, names the key.
- Nothing you wrote logs the key or the whole environment.

Pass: all four. If a key was written to a tracked file or shown in the conversation at any point, tell the user it must be rotated in the dashboard, even if the file was fixed since.

## 3. It compiles

Run the project's own typecheck and build (`tsc --noEmit`, `next build`, `nest build`, whichever it uses).

Pass: no new error. Do not silence a type error from the SDK with a cast: it usually means a wrong option name or a `customer` that can return `undefined`.

## 4. The routes answer, signed out

Start the server the way the project does, then, with the real mount path and the real slug:

```bash
curl -i http://localhost:3000/api/mesub/plans/pro
curl -i http://localhost:3000/api/mesub/subscriptions
curl -i http://localhost:3000/api/analytics
```

Pass:

- the plan read answers 200 with the plan's name and price. This single call proves the mount path, the key and the slug at once. A 404 `plan_not_found` is a wrong slug, a 404 without that code is a wrong path, a 500 is a refused key (under Express with no error handler of the app's own, a 401 even when signed in). If the app's login middleware rejects signed-out requests it answers 401 here: repeat it signed in.
- the subscriptions read answers 401 `unauthenticated`. A 200 here means `customer` names somebody without a session: stop and fix it.
- the paid route answers 401, not 200 and not 402.

## 5. The paid route refuses a signed-in user who has not paid

Signed in as a user with no subscription (a session cookie from the browser, or the project's own test login), call the paid route.

Pass: 402. A 200 means the route is not gated. A 401 means the session does not reach the guard.

If you cannot sign in from where you run, say so and leave this check to the user.

## 6. The window opens

Open the page that holds the button, signed in.

Pass: the click opens the window and it shows the plan's name, price and period. "Sign in first" means the session cookie does not reach the routes. An error instead of the plan sends you back to check 4.

If you have no browser, say so and leave this check to the user.

## 7. The subscription, by the user

This one needs a person with a wallet that holds enough of the plan's token for the first period, and a little SOL for the deposit and the network fee. Tell the user exactly this:

1. Sign in to the app and click the button.
2. Pick the wallet, read the review, then approve twice: the terms, then the first payment.
3. Call the paid route again: it now answers 200.
4. In the dashboard, the subscription is under Subscriptions and its first payment under Collection.

Pass: the user confirms step 3. Until then, report the integration as wired and checked up to the window, not as tested end to end.

## What to report

- The files you created or changed, and the slug they use.
- Each check above as passed, failed or not run, with the reason for any not run.
- What the user must still do: the key in production's environment, and check 7.
