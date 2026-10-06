---
name: mesub-quickstart
description: Use this skill when a project with no Mesub code yet must start taking subscriptions or recurring payments on Solana, even if the user just says "users should pay monthly" or "add a paywall". Covers the first setup of @mesub/node and @mesub/react on Express, Next.js or NestJS (MESUB_API_KEY, mesubRoutes, requirePlan, withMesub, MesubProvider, SubscribeButton), checking it end to end, and the directory of every Mesub skill.
compatibility: Node 22 or later. Express 4 or 5, Next.js 14 or later (App Router) or NestJS 10 or later. React 18 or 19 for the widget.
license: Apache-2.0
---

# Mesub Quickstart

## Overview

This skill takes a project from no Mesub code to one paying subscriber: the packages, the API key, the routes the widget calls, one paid route and the subscribe button. It also carries the directory of the kit, so a task that belongs to another Mesub skill finds its owner.

## When to use this skill

- The project has no Mesub code and the user wants subscriptions, recurring payments or a paid area.
- A setup exists and must be checked from the packages to the button.
- You need to know which Mesub skill owns a task: `references/kit-directory.md`.

## Do not use this skill when

- The setup works and the task is one paid route's rules, its refusals or its outage behaviour.
- The task is the subscribe or manage window itself, or subscribing from the server.
- The task is receiving events, testing, or reading an error code.

`references/kit-directory.md` names the owner of each, and what to read when it is not installed.

## Core guidance

### Four facts to hold first

1. **The subscriber has no Mesub account.** Who they are comes from the app's own login. An app with no login needs one first.
2. **The API key lives on the server only.** `@mesub/react` holds no key and never talks to Mesub: it calls routes on the app's own server.
3. **A plan is named by its slug** (`pro` for a plan called Pro). Price, token and period live in the dashboard, not in code.
4. **Mesub charges every period by itself.** No cron, no job, no renewal code in the app.

### The six steps

Do them in order. Each one is detailed in `references/steps.md`: read the step before writing its code.

0. **Read the project, ask the user.** Find the framework and how a request learns who the user is. Check what is installed. Ask for the plan's slug, and ask the user to put `MESUB_API_KEY` in the server's environment themselves.
1. **The API key.** `new Mesub()` reads `MESUB_API_KEY` by itself. Confirm the env file is ignored by git.
2. **Install** `@mesub/node` (in `dependencies`) and `@mesub/react` with the project's own package manager.
3. **Mount the routes the widget calls** at `/api/mesub`, after the app's login: `assets/express-mesub.ts` or `assets/next-mesub-route.ts`.
4. **Gate one paid route** on the server: `assets/express-mesub.ts`, `assets/next-paid-route.ts` or `assets/nest-paid.controller.ts`.
5. **The provider and the button**: `assets/mesub-provider.tsx`, then `assets/subscribe-button.tsx`. The provider's `endpoint` is exactly the path of step 3.
6. **Check**: run the script below, then go through `checks/verification.md`.

Copy an asset, then adapt the lines marked `ADAPT`. What each framework needs beyond that is in `references/frameworks.md`.

### Rules that are never negotiable

- **Never ask for the API key in the conversation, and never write its value anywhere.** Check that the name is set without reading the value. Why: a key pasted in a chat or committed must be treated as leaked and rotated.
- **Never give the key a browser prefix** (`NEXT_PUBLIC_`, `VITE_` and the like), never import it in client code, never log it. Say "API key".
- **`customer` comes from a session the app verified, never from the request itself**: not the query, the body, a header or a wallet the page sends. Why: every subscription and every paid route hangs on it, so an id read from the request lets anyone type a subscriber's id and get their access. Return `null` when nobody is signed in.
- **Name the customer the same way everywhere**, by `external_id`, the app's own id for the user. Otherwise a subscription made under one name is not found under the other.
- **If the install says the package does not exist, stop and tell the user.** The packages are in early 0.x and may not be published. Do not install a lookalike, copy the SDK's source, or call the HTTP API instead. Why: a lookalike package is how a key gets stolen.
- **Gate on the server.** Hiding a button is not a gate.
- **Do not catch the check's errors as "not subscribed"**, do not cache its answer, and do not store "is subscribed" in the app's database. The SDK already caches and already handles an outage; a wrong key or slug throws on purpose.
- **Do not build the subscribe flow or add a wallet library.** The widget does both.
- **Before using an option this skill does not show, read it in the installed package** (`node_modules/@mesub/node/README.md` and its types). Never write a call from memory.

### The check

From the project root, with the script's path resolved under this skill's folder:

```bash
node "<skill-dir>/scripts/check-setup.mjs"
```

`<skill-dir>` is the absolute path of the folder that holds this `SKILL.md`. Do not change into it: the script reads the current directory. Add `--server-only` for a project with no React front.

**The subscription itself needs a person with a wallet**, who approves twice in the window. Report the integration as wired and checked up to the window, never as tested end to end, and say what the user must click. When something fails on the first run, read `references/first-run-failures.md`.

## Related skills

<!-- related:start -->
<!-- Rendered from catalog.yaml by `pnpm render`. Do not edit. -->
This skill works alone: never assume another one is installed. The other skills of the kit: `mesub-gate-access`, `mesub-subscribe-and-manage`, `mesub-webhooks`, `mesub-testing`, `mesub-errors`, `mesub-mcp`.

For a task outside this skill, find its owner in `references/kit-directory.md` (what each skill covers, how to install it alone, its docs page), and say which skill owns it.
<!-- related:end -->

## References

- `references/steps.md`: each of the six steps in full, with its reasons.
- `references/frameworks.md`: what Express, Next.js and NestJS each need, plus bearer tokens, another origin and the edge runtime.
- `references/first-run-failures.md`: what is seen on a first run, what it means and what to do.
- `references/docs.md`: the docs pages behind this skill, and when to read them.
- `references/kit-directory.md`: every skill of the kit, how to install each one alone, and its docs fallback.

## Assets

- `assets/express-mesub.ts`: the widget routes and a guard, for Express and the `main.ts` of NestJS.
- `assets/next-mesub-route.ts`: the widget routes as an App Router catch-all.
- `assets/next-paid-route.ts`: one paid App Router route.
- `assets/nest-paid.controller.ts`: one paid NestJS controller.
- `assets/mesub-provider.tsx`: the provider and the stylesheet.
- `assets/subscribe-button.tsx`: the subscribe button for one plan.

## Scripts

- `scripts/check-setup.mjs`: reads the project and reports whether the packages, the key, the routes, a gated route, the provider and the button are in place. Read-only, no network, never shows a key. Usage above.

## Checks

- `checks/verification.md`: the runbook to go through before saying the work is done.
