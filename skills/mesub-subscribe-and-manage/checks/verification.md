# Verification: Mesub Subscribe and Manage

Go through every check before saying the work is done. Say which ones you could not run. Checks 1 to 3 apply to every task; 4 and 5 to the widget; 6 to the server path; 7 is the user's.

## 1. The static check

From the project root:

```bash
node "<skill-dir>/scripts/check-wallet-side.mjs"
```

`<skill-dir>` is the folder that holds `SKILL.md`.

Pass: no `FAIL` line. Read every `WARN` and either fix it or say why it is fine here. Two are never fine without proof: a customer taken from the request, and a call by subscription id with no ownership check. Open the file and show where the id comes from.

A `PASS` is a reading of the code. The script cannot tell whether a slug exists in the dashboard, whether a session is real, or whether anything works in a browser.

## 2. It compiles

Run the project's own typecheck and build.

Pass: no new error. Do not silence a type error from either package with a cast: it usually means a prop or an option that does not exist in the installed version. Read `node_modules/@mesub/react/dist/index.d.ts` or `node_modules/@mesub/node/dist/index.d.ts` and use what is there.

## 3. Nothing decides access in the browser

Read what you wrote:

- no paid content is shown because `onSubscribed` fired or `state` is `subscribed`: those only trigger a fetch, and the server answers;
- nothing is hidden or revoked because a subscription was cancelled: the server keeps asking Mesub;
- no client file imports `@mesub/node`, and no value from the server's environment reaches a client file.

Pass: all three.

## 4. The routes answer as expected

With the server running, the real mount path and a real slug:

```bash
curl -i http://localhost:3000/api/mesub/plans/pro
curl -i http://localhost:3000/api/mesub/subscriptions
curl -i -X POST http://localhost:3000/api/mesub/subscriptions/x/cancel -H 'Content-Type: application/json' -d '{}'
```

Pass: 200 with the plan, then 401 `unauthenticated` twice. A 200 on the second, signed out, means `customer` names somebody without a session: stop and fix it. A 404 `plan_not_found` is a wrong slug, or a slug left out of the routes' `plans` list. A 500 is Mesub refusing the API key: tell the user, do not turn it into a 401. If the app's login middleware rejects signed-out requests, the plan read answers 401 too: repeat it signed in.

Signed in (a session cookie from the browser, or the project's own test login), the second answers 200 with `{ "subscriptions": [...], "has_more": ... }`, and no subscription in it carries `external_id` or `email`. If you cannot sign in from where you run, say so and leave it to the user.

## 5. The window opens, and looks right

Needs a browser. Signed in, on the page that holds the button:

- the subscribe button opens the window on the plan's name, price and period, and closing it brings the button back to its idle label;
- the manage button opens the customer's subscription, or "No subscription yet";
- the list shows "Sign in on this site to see your subscriptions." when signed out, not an error;
- the window carries the app's colours, in light and in dark if the app has both, and is a bottom sheet under 480px;
- if `manageUrl` is set, it is a page that exists and shows the customer's subscriptions.

Pass: all that apply. If you have no browser, say so: a typecheck does not prove any of this.

## 6. The server path, without a wallet

For an app that calls `mesub.subscriptions.*` itself. Signed out, each of the app's own routes answers 401. Signed in as a user who is not the owner, a call with somebody else's subscription id answers 404 and reaches no build, no submit and no confirm.

Then read the code against these, one by one:

- `create` gets `external_id` from the session;
- the page shows `terms.message` and the costs before the wallet is asked;
- subscribing asks the wallet to sign without sending; managing asks it to sign and send;
- `submit` branches on `subscription.access`, a confirm on `reason`;
- a `MesubSubmitError` leads to a read of the subscription, never to a new `create`;
- a timed-out confirm is sent again with the same signature;
- the route that submits may run as long as the timeout it was given, on this host.

Pass: every line. An agent cannot produce a wallet's signature, so `submit` and the confirms cannot be run for real from here: say so.

## 7. The real thing, by the user

This needs a person with a wallet that holds enough of the plan's token for one period and a little SOL for the deposit and the network fee. Tell the user exactly this:

1. Sign in, click the button, pick the wallet, read the review, approve twice: the terms, then the first payment.
2. Open the manage window or the list. The subscription shows as active with its next charge.
3. Cancel it with the same wallet. It shows as cancelled with "Access until", and what the plan unlocks still works.
4. Resume it. It shows as active again.
5. Optional: try with another wallet. The window says "Wrong wallet" and nothing is signed.

Closing can only be checked once a cancelled subscription has passed its end.

Pass: the user confirms steps 1 to 4. Until then, report the work as wired and checked up to the wallet, not as tested end to end.

## What to report

- The files you created or changed, and the slugs they use.
- Each check above as passed, failed or not run, with the reason for any not run.
- The provider's `chain` and the plan's `network` as you read them, and whether the user confirmed they agree.
- What the user must still do: check 7, and on a serverless host the time limit of the routes that wait for the chain.
