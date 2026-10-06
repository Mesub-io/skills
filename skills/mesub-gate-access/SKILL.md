---
name: mesub-gate-access
description: Use this skill when a route, an API or a page must be reserved to the subscribers of a Mesub plan, even if the user just says "only paying users should see this" or "why do subscribers get a 402". Covers hasAccess, access, accessList, the guards requirePlan, withMesub and RequirePlan of @mesub/node, several plans, onDenied, answering 401, 402 and 503 with Retry-After, the outage fallback (maxStaleMs, guardTimeout) and the cache store.
compatibility: Node 22 or later, with @mesub/node already set up (check package.json and node_modules/@mesub/node/package.json). Express 4 or 5, Next.js 14 or later (App Router) or NestJS 10 or later.
license: Apache-2.0
---

# Mesub Gate Access

## Overview

This skill makes an agent gate a route or a page on a plan: the right question, the right guard, three refusals kept apart, and a gate that neither locks subscribers out during an outage nor lets a stranger in.

## When to use this skill

- A route, an API or a page must be reserved to the subscribers of one or several plans.
- A paid route answers 401, 402, 503 or 500 and you must find why.
- A refusal must become a redirect, a page or your own JSON.
- The outage behaviour or the cache of the check must be chosen.

## Do not use this skill when

- The project has no Mesub code yet: the packages, the API key and the widget routes come first.
- The task is the subscribe or manage window, subscribing from the server, receiving events, or writing tests.

## Core guidance

### Start here

1. Check what is installed: `package.json`, the lockfile, `node_modules/@mesub/node/package.json`. The package may not be on the public registry: if it is missing, stop and tell the user. Never install a lookalike.
2. Find the code already there: the `customer` function the widget routes use, and any `new Mesub(`. Reuse both.
3. Ask the user for the plan's slug, as the dashboard shows it.

### Pick the question

| Need | Use |
|---|---|
| A route refused to anyone without the plan | A guard: `requirePlan` (`@mesub/node/express`), `withMesub` (`@mesub/node/next`, route handlers only), `RequirePlan` (`@mesub/node/nest`) |
| A page, a server component, a server action, or a route that serves less instead of refusing | `await mesub.hasAccess(customer, 'pro')` |
| Showing a customer where they stand | `mesub.access(customer, 'pro')`, or `mesub.accessList(customer)` for every plan |

`hasAccess` and the guards fall back during an outage. `access` and `accessList` throw instead: they are for screens, never the gate. Details: `references/guards.md`.

### The three refusals

| Status | `reason` | It means | The client should |
|---|---|---|---|
| 401 | `unauthenticated` | `customer` returned nothing | sign in |
| 402 | `no_access` | Mesub said no, for every plan asked | offer the plan |
| 503, `Retry-After: 30` | `unavailable` | Mesub did not answer and nothing is known about this customer | retry later |

Anything else is thrown and ends as a 500: a refused API key, an unknown slug, a malformed customer. That is on purpose. More: `references/refusals.md`.

### Rules

- **`customer` comes from a session the app verified**, never from the query, the body, a header or a wallet the page sends. Why: whoever types a subscriber's id would get their access. Name the customer as the widget routes do, or the subscription is not found.
- **Gate on `access`, never on `status`.** A `cancelled` subscription still grants until its paid period ends, an `unpaid` one may or may not, and just after a plan's end date `active` can read with `access: false`: `references/answer-and-statuses.md`.
- **Always `await hasAccess`.** An unawaited promise is truthy: everyone gets in.
- **Never turn an error into "not subscribed".** No `try` that returns `false`, no `.catch(() => false)`. Why: the SDK already answers for an outage, so what is left is a broken integration, which would silently lock every subscriber out.
- **Keep 402 and 503 apart, in the front too.** A 503 shown as "please subscribe" tells a paying customer they are not one.
- **`onDenied` takes over the answer.** In Express and Next.js it replaces all of it, `Retry-After` included: branch on `denial.reason`. In NestJS it answers by throwing, and returning keeps the default.
- **One client, built at module level, used everywhere.** A guard given no `client` uses a default one, with default options and its own cache: an app that builds `new Mesub({...})` passes it to every guard and to the widget routes (`assets/mesub-client.ts`). Why: a subscription made through another client leaves this one's cached "no" in place.
- **Three plans at most per guard, written in code**, never read from the request: each is a call to Mesub.
- **Add no cache, and never store "is subscribed".** The SDK keeps each answer for as long as Mesub says it stays true.
- **Leave `maxStaleMs` and `guardTimeout` alone unless the user decides.** `maxStaleMs: 0` makes an outage keep everyone out. With several servers or short-lived processes, plug a shared store instead: `references/outage-and-cache.md`.
- **`hasAccess` called by hand** ignores `guardTimeout`, and answers `false` both for "no" and for "Mesub is down and never saw them": word the page for both.
- **Gate on the server.** Hiding a component is not a gate, and `@mesub/react` has none.
- **In a test, never mock `@mesub/node` or the guard.** Hand the app the client of `FakeMesub` from `@mesub/node/testing`. Why: a mocked check passes on a route with no guard.
- **Before using an option this skill does not show, read it in the installed package** (`node_modules/@mesub/node/README.md` and its types). Never write a call from memory.

### The check

From the project root, with the script's path resolved under this skill's folder:

```bash
node "<skill-dir>/scripts/check-gates.mjs"
```

`<skill-dir>` is the absolute path of the folder that holds this `SKILL.md`. Do not change into it: the script reads the current directory. Then go through `checks/verification.md`. You cannot produce a real outage or a real subscriber: say what was checked and what was not.

## Related skills

<!-- related:start -->
<!-- Rendered from catalog.yaml by `pnpm render`. Do not edit. -->
This skill works alone: never assume another one is installed. The other skills of the kit: `mesub-quickstart`, `mesub-subscribe-and-manage`, `mesub-webhooks`, `mesub-testing`, `mesub-errors`, `mesub-mcp`.

For a task outside this skill, find its owner in `references/kit-directory.md` (what each skill covers, how to install it alone, its docs page), and say which skill owns it.
<!-- related:end -->

## References

- `references/guards.md`: the guards, their options, several plans, a plan per request, pages.
- `references/refusals.md`: each refusal's body, `onDenied` per framework, what is thrown, the front's side.
- `references/outage-and-cache.md`: freshness, the fallback, the options, a shared store.
- `references/answer-and-statuses.md`: every field of an answer, and what each status means for access.
- `references/docs.md`: the docs pages behind this skill.
- `references/kit-directory.md`: every skill of the kit, how to install each one alone, and its docs fallback.

## Assets

- `assets/mesub-client.ts`: the one client, with an optional shared store.
- `assets/express-gates.ts`: one plan, several, `onDenied`, and `hasAccess` by hand.
- `assets/next-gates.ts`: route handlers with several plans and with `onDenied`.
- `assets/next-paid-page.tsx`: a paid page as a server component.
- `assets/nest-gates.controller.ts`: a controller with several plans and its own refusal.

## Scripts

- `scripts/check-gates.mjs`: lists every gate and reports the mistakes above. Read-only, no network, never shows a key. Usage above.

## Checks

- `checks/verification.md`: the runbook to go through before saying the work is done.
