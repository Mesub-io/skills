# The guards

One guard per framework. All three ask the same question as `hasAccess`, within a time budget, and answer the refusals themselves.

| Framework | Import | Call |
|---|---|---|
| Express 4 or 5 | `@mesub/node/express` | `requirePlan(plan, options)` returns a middleware |
| Next.js, App Router | `@mesub/node/next` | `withMesub(handler, { plan, ...options })` returns a route handler |
| NestJS | `@mesub/node/nest` | `RequirePlan(plan, options)` returns a guard for `@UseGuards` |

## The options

| Option | Required | What it is |
|---|---|---|
| `customer` | yes | A function of the request that returns who is signed in, or `null`. May be async |
| `client` | no | The `Mesub` client to ask with. Left out, the guard uses one default client built from `MESUB_API_KEY`, shared by every guard and widget route given none |
| `onDenied` | no | Answer a refusal yourself: see `refusals.md` in this folder |

`plan` is the first argument of `requirePlan` and `RequirePlan`, and an option of `withMesub`.

A guard checks its arguments when it is built, so a mistake fails at start-up, not on the first request: no `customer` function, an empty plan, or more than three plans throws a `TypeError`.

## What `customer` returns

- `{ external_id: '...' }`: the app's own id for the user. Prefer it: it follows the person whichever wallet pays.
- `{ wallet: '...' }`, or the wallet as a string alone: when the connected wallet is the customer.
- `{ email: '...' }`: the address typed when subscribing, which Mesub never verified. For a support lookup, not a gate.
- `null` or `undefined`: nobody is signed in. The guard answers 401.

Exactly one of the three. Two of them, a value that is not a string, or an empty string throws: it is a broken integration, not a refusal.

It must come from a session the app verified. Name the customer the way the subscription was made: one made for `{ external_id: 'u_1' }` is not found by asking about a wallet the page sends, or about an email.

## What the handler receives

Once let through, the route gets a `MesubAccess`:

| Field | What it holds |
|---|---|
| `customer` | Who was asked about: `{ kind, value }`, `kind` being `wallet`, `external_id` or `email` |
| `plan` | The plan that let the request through: with a list, the first that granted |
| `wallet` | The wallet that pays, or `null` when the answer came from the fallback and holds none |
| `answer` | Mesub's answer for that plan: see `answer-and-statuses.md` in this folder. Typed as nullable |
| `stale` | `true` when the answer came from the outage fallback |

Where it is:

- Express: `res.locals.mesub` (type `MesubLocals`).
- Next.js: the second argument of the handler, `(request, mesub, context)`. Next's own `context`, with `params`, is passed through as the third.
- NestJS: the `@MesubAccess()` parameter decorator, or `request.mesub`.

## Several plans

```ts
requirePlan(['pro', 'team'], { client: mesub, customer });
```

- The first plan of the list that grants lets the request through. `plan` says which.
- The plans are asked at once, so several fit the same time budget. Each one that is not cached is one call to Mesub, on every request, against the key's 1,000 access calls a minute.
- Three at most, counted once each. A longer list throws when the guard is built.
- A refusal is 402 only when Mesub said no for every plan. If none grants and Mesub could not answer for one of them, it is 503.
- On a refusal, `denial.answer` is the answer for the first plan asked.
- An unknown slug in the list is thrown, unless a plan before it already granted. So a typo in the second slug can hide behind subscribers of the first: test each slug.

## A plan worked out per request

`plan` may be a function of the request that returns a slug or a list:

```ts
const PLAN_OF = { reports: 'pro', exports: 'team' } as const;

requirePlan((req) => PLAN_OF[req.params.feature as keyof typeof PLAN_OF] ?? 'team', {
    client: mesub,
    customer,
});
```

- Pick from a list written in code. Never hand the request's own text to Mesub as a slug: the caller would choose which plan is checked.
- It runs only once somebody is identified, and is checked then: returning nothing, or an empty string, throws.

## Pages and server components

There is no guard for a page. `withMesub` wraps App Router route handlers only: not `middleware.ts`, not pages, not server components. On a page, a server component or a server action, ask and decide what to render:

```tsx
const paid = await mesub.hasAccess({ external_id: session.userId }, 'pro');
return paid ? <Reports /> : <Upsell />;
```

`assets/next-paid-page.tsx` is the whole page. Three things differ from a guard:

- `hasAccess` answers `false` both when Mesub said no and when Mesub is down and never saw this customer. A guard tells them apart (402 or 503); a page cannot, so word the refusal for both, or serve the paid part from a guarded route handler.
- It is not bound by `guardTimeout`. During an outage it waits for the client's own `timeout` and `maxRetries` (5 seconds an attempt and two retries by default) before it falls back.
- Load the paid data after the check, in the same server code. A check in a layout does not protect a page's own data.

A component that hides itself in the browser is not a gate: the data already left the server. `@mesub/react` opens the subscribe and manage windows and lists a customer's subscriptions for display. It has no guard.

## NestJS

- Put the app's own auth guard first: `@UseGuards(YourAuthGuard, RequirePlan('pro', { customer }))`. `RequirePlan` reads what the auth guard wrote on the request.
- Name the request type to read `req.user` without a cast: `RequirePlan<AuthedRequest>(...)`, with `AuthedRequest extends MesubRequest`.
- The 503's `Retry-After` is set on the response whether the platform is Express or Fastify.
