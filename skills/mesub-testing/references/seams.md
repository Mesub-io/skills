# Handing the fake to the app

A test replaces two things and nothing else: the client, and who is signed in. How each framework lets a test do that.

## The two things

1. **The client.** Every guard and both route mounts take a `client` option (`requirePlan`, `mesubRoutes`, `withMesub`, `mesubRouteHandlers`, `RequirePlan`). Left out, they share one client built from `MESUB_API_KEY` on first use, which calls the real Mesub.
2. **Who is signed in.** The `customer` function. In production it reads the session the app verified. In a test it returns what the test decided.

The rule for both: the test hands them in from outside. The code that ships holds no branch for tests and reads no header a test invented. A `customer` that trusts an `x-test-user` header is a door: once deployed, whoever sends that header is that user.

If the project has a test login of its own (a session cookie minted by a helper, a seeded user), use it and leave `customer` alone: that also tests the session read.

## Express

Build the app in a function that takes the client and `customer`: `assets/create-app.ts`. The server file calls it with `new Mesub()` and the real session read, a test with `fake.client()`. If the app is built at import time today, extracting that function is the one change to make in the code that ships. Keep it small and say so to the user.

## Next.js (App Router)

A `route.ts` may only export its handlers, so the builder lives in another module:

```ts
// lib/paid-route.ts
export const paidRoute = ({ mesub, customer }: RouteDeps) =>
    withMesub(handler, { plan: 'pro', client: mesub, customer });

// app/api/analytics/route.ts
export const GET = paidRoute({ mesub: new Mesub(), customer: fromSession });
```

A test calls the builder with the fake's client, then the handler with a `Request`: `assets/next-route.test.ts`. No server is started. The widget routes take the catch-all segment as the second argument: `{ params: Promise.resolve({ mesub: ['plans', 'pro'] }) }`.

## NestJS

`RequirePlan('pro', { client, customer })` is evaluated when the controller's file is loaded, so the client must exist before that import. Checked with `@nestjs/testing` and `supertest`: a controller declared after the fake, with `client: fake.client()`, answers 200, 402, 401 and 503 as the table in `cases.md` says.

For controllers that import their client from a module of the app, use the next section: it needs no change to them.

## When the client cannot be handed in

The shared default client can be pointed at the fake without touching the app. It is built once, on first use, from the environment, and it looks up the global `fetch` on every call:

```ts
// In the test setup, before the first request of the run.
const fake = new FakeMesub({ baseUrl: 'https://api.mesub.io', plans: ['pro'] });

process.env.MESUB_API_KEY = fake.apiKey;
process.env.MESUB_WEBHOOK_SECRET = fake.webhookSecret;
const realFetch = globalThis.fetch;
globalThis.fetch = fake.fetch;
// After the run: globalThis.fetch = realFetch;
```

Checked on an Express guard with no `client` option. What it costs, compared with handing the client in:

- **One client for the whole run**, so one cache: `reset()` does not empty it. Use a different customer in each test that involves an outage or the cache.
- **Retries are on** (2 by default): an outage test waits about a second before the guard falls back.
- **The global `fetch` is the fake's** for everything in the process. A call to any other host gets a plain 404 from the fake. Restore it after the run.
- The base URL is exactly `https://api.mesub.io`: the default client has no other.

Prefer handing the client in whenever the framework allows it.

## What a test must never do to get there

- Mock the module `@mesub/node` or one of its entries, or stub `hasAccess`, a guard or `webhooks.verify`. The test then checks the mock.
- Import `@mesub/node/testing` from code that ships. The fake grants whatever it is told.
- Put a real API key or a real signing secret in a test, an env file for tests or a CI variable. Tests need neither: the fake has its own.
