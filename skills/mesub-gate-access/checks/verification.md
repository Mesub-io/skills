# Verification: Mesub Gate Access

Go through every check before saying the work is done. Say which ones you could not run.

## 1. The static check

From the project root:

```bash
node "<skill-dir>/scripts/check-gates.mjs"
```

`<skill-dir>` is the folder that holds `SKILL.md`.

Pass: no `FAIL` line, and every route you meant to gate is in the list of gates. Read every `WARN` and either fix it or say why it is fine here. A `WARN` about the customer coming from the request is never fine: open the file and prove where the id comes from. The script reads code: a gate it lists is not a gate that works.

## 2. Read each gate

For every paid route or page, read the code and answer:

- Does the paid data leave the server only after the check?
- Is `customer` the signed-in user, read the same way as in the widget routes?
- Is `hasAccess` awaited?
- Is any error of the check caught and answered as "no"? It must not be.
- With `onDenied`: does each of the three reasons get its own answer, and does `unavailable` say when to retry?
- If the app builds its own client: does every guard receive it as `client`?

Pass: all six, for each gate.

## 3. It compiles

Run the project's own typecheck and build.

Pass: no new error. Do not silence a type error from the SDK with a cast: it usually means a wrong option name, or a `customer` that can return something else than a customer or `null`.

## 4. Signed out: 401

Start the server the way the project does, then call each paid route with no session:

```bash
curl -i http://localhost:3000/api/reports
```

Pass: 401 with `"reason": "unauthenticated"` (or what `onDenied` answers for it). A 200 means the route is not gated. A 402 means `customer` names somebody without a session: stop and fix it. A 500 here is `customer` throwing, or no API key in this process's environment: read the server's log.

## 5. Signed in, not subscribed: 402

Signed in as a user with no subscription (a session cookie from the browser, or the project's own test login), call each paid route.

Pass: 402 with `"reason": "no_access"` and a `status`. A 401 means the session does not reach the guard: the order of the middlewares or guards. A 500 is a refused API key or a slug that is not a plan of this project: the log names which, and the user checks it in the dashboard.

If you cannot sign in from where you run, say so and leave this check to the user.

## 6. A subscriber: 200

This needs a customer who really holds the plan, so a person with a wallet subscribed at some point. Ask the user whether one exists.

Pass: the route answers 200 for them, and with several plans the handler sees the right `plan`. A 402 for a known subscriber is almost always the customer named differently from how the subscription was made.

If there is no subscriber yet, say so: checks 4 and 5 prove the refusals, not the way in.

## 7. An outage

You cannot make Mesub fail, so this cannot be checked against the real service. It can be checked in the project's own tests, with the fake Mesub that ships in the package, if `node_modules/@mesub/node/package.json` lists a `./testing` export:

```ts
import { FakeMesub } from '@mesub/node/testing';

const fake = new FakeMesub();
const mesub = fake.client(); // hand it to the guard under test as `client`

fake.grant({ external_id: 'seen' }, 'pro');
await mesub.hasAccess({ external_id: 'seen' }, 'pro'); // true, and now known

fake.fail('outage'); // every call answers 503, until fake.fail(null)
await mesub.hasAccess({ external_id: 'seen' }, 'pro'); // still true
await mesub.hasAccess({ external_id: 'never' }, 'pro'); // false; a guard answers 503
```

Pass, when the project has tests: a customer seen before is still let in, one never seen gets 503 with `Retry-After` from a guard, and the front shows "try again", not the plans.

If the project has no tests, do not add a test suite for this alone unless the user asks. Read the `onDenied` and the front's handling of 503 instead, and report the outage path as read, not run.

## What you cannot verify

Say each of these plainly instead of reporting the gate as tested end to end:

- **A real outage.** Only the fake reproduces it.
- **A real subscriber**, unless the user has one: subscribing needs a person with a wallet.
- **Production's shape.** Whether there is one process or many, and how long they live, decides whether the memory cache is enough. It is not in the code: ask.
- **The API key in production.** A gate that works locally answers 500 everywhere if the key is missing or wrong there.

## What to report

- Each gated route or page, the plans it asks about, and what it answers for each refusal.
- Each check above as passed, failed or not run, with the reason for any not run.
- Any option changed from its default (`maxStaleMs`, `guardTimeout`, a store), and that the user chose it.
- What the user must still do: a subscriber's 200, and the key in production's environment.
