---
name: mesub-quickstart
description: Use this skill when a project must start taking recurring payments or subscriptions on Solana with Mesub and has no Mesub code yet, even if the user just says "users should pay monthly", "add a paywall", "put this page behind a subscription" or "charge in USDC every month". Covers installing @mesub/node and @mesub/react, MESUB_API_KEY, mesubRoutes, mesubRouteHandlers, hasAccess, requirePlan, withMesub, RequirePlan, MesubProvider and SubscribeButton on Express, Next.js or NestJS, checking the setup end to end, and the directory of every Mesub skill.
compatibility: Node 22 or later on the server. Express 4 or 5, Next.js 14 or later (App Router) or NestJS 10 or later. React 18 or 19 for the widget. Check package.json and node_modules/@mesub/*/package.json before anything else.
license: Apache-2.0
---

# Mesub Quickstart

## Overview

This skill takes a project from no Mesub code to one paying subscriber: the packages, the API key, the routes the widget calls, one paid route, and the subscribe button. It fixes the order of the work and the four mistakes that make a first integration unsafe or silently broken. It also carries the directory of the kit, so a task that belongs to another Mesub skill finds its owner.

## When to use this skill

- The project has no Mesub code and the user wants subscriptions, recurring payments or a paid area.
- The user asks for a first end-to-end setup on Express, Next.js or NestJS.
- A setup exists and must be checked from the packages to the button before more is built on it.
- You need to know which Mesub skill owns a task: read `references/kit-directory.md`.

## Do not use this skill when

- The setup works and the task is the rules of one paid route: several plans, custom refusals, what happens when Mesub does not answer.
- The task is the subscribe or manage window itself: its states, its theming, a list of subscriptions, or subscribing from the server without the widget.
- The task is receiving events (renewals, missed payments, cancellations).
- The task is testing the integration, or reading an error code or a failed payment.

For each of these, `references/kit-directory.md` names the owner and what to read when it is not installed.

## Core guidance

### How Mesub fits, in four facts

Hold these before writing a line. Each one rules out a design that looks reasonable and is wrong.

1. **The subscriber has no Mesub account.** Who they are comes from the app's own login. So there is no Mesub sign-in to add, and an app with no login needs one first.
2. **The API key lives on the server only.** `@mesub/node` reads it there. `@mesub/react` holds no key and never talks to Mesub: it calls routes on the app's own server.
3. **A plan is named by its slug.** A plan called Pro has the slug `pro`. The slug is the only thing the code needs to know about a plan: its price, token and period live in the dashboard.
4. **Mesub charges every period by itself.** After the first payment nothing is scheduled in the app: no cron, no job, no renewal code.

### Step 0: read the project and ask for what only the user has

Before writing code:

1. Find the framework and the login. Read `package.json` for `express`, `next` or `@nestjs/common`, then find how a request learns who the user is (a session middleware, an auth library's server helper, a guard). Everything below hangs on that one line.
2. If there is no login at all, stop and say so. Mesub ties a subscription to a customer the app names: without a verified identity there is nothing safe to tie it to. Do not invent one, and do not take an id from the browser.
3. Check what is installed: `package.json`, the lockfile, and `node_modules/@mesub/node/package.json` for the version. Neither package may be on the public registry yet, so do not assume an install will succeed (step 2).
4. Ask the user for two things an agent cannot produce:
   - **The plan's slug.** They create the plan in the dashboard, under Plans, and their wallet signs it. The plan's Implement tab shows the slug. If they have no plan yet, they make one first: code written against a slug that does not exist answers 404.
   - **That the API key is in the server's environment.** They create it in the dashboard, under Developers. It starts with `SUB_` and is shown once.

**Never ask the user to paste the API key into the conversation, and never write its value anywhere.** Ask them to add `MESUB_API_KEY` to the server's environment themselves, then check that the name is set without reading the value (the script below does). Why: a key pasted in a chat or committed to a file must be treated as leaked and rotated.

### Step 1: the API key

- The variable is `MESUB_API_KEY`. `new Mesub()` reads it by itself: do not pass it by hand unless the runtime has no `process.env` (an edge runtime), where it is passed as an option from the runtime's own bindings.
- It goes in the server's environment: the env file the framework already loads locally, and the host's settings in production. Confirm that file is ignored by git before the user fills it.
- Never give it a prefix that a bundler ships to the browser (`NEXT_PUBLIC_`, `VITE_`, `REACT_APP_` and the like), never import it in a client component, never log it, never commit it, not even in an example file.
- Say "API key". The other key Mesub has, the publishable key, is not used anywhere in this setup.
- A missing key makes `new Mesub()` throw on start with "Missing Mesub API key". That is the intended behaviour: do not catch it.

### Step 2: install

Install with the project's own package manager, the one its lockfile shows:

```bash
npm install @mesub/node
npm install @mesub/react
```

`@mesub/node` goes in `dependencies`, not `devDependencies`: the server needs it in production. It has no runtime dependency. `@mesub/react` brings what it needs for wallets: install nothing for Solana by hand.

If the install answers that the package does not exist, **stop and tell the user**: the packages are in early 0.x and may not be published yet. Do not install a package with a similar name, do not copy the SDK's source into the project, and do not rewrite the calls against the HTTP API to get around it. Why: a lookalike package on a registry is the classic way a key gets stolen.

### Step 3: mount the routes the widget calls

The widget needs a handful of routes on the app's server (read a plan, prepare a subscription, submit what the wallet signed, cancel, resume, close). One call mounts all of them:

| Framework | Call | Where | Ready to copy |
|---|---|---|---|
| Express | `mesubRoutes` from `@mesub/node/express` | `app.use('/api/mesub', yourLogin, ...)` | `assets/express-mesub.ts` |
| Next.js | `mesubRouteHandlers` from `@mesub/node/next` | `app/api/mesub/[...mesub]/route.ts` | `assets/next-mesub-route.ts` |
| NestJS | `mesubRoutes` from `@mesub/node/express` | `app.use(...)` in `main.ts` | `assets/express-mesub.ts` |

Copy the asset, then adapt the lines marked `ADAPT`. What each framework needs beyond that (the catch-all folder, the body parser, the order of guards) is in `references/frameworks.md`: read the section for the project's framework before editing.

The one option that matters is `customer`: a function that says who is asking.

```ts
customer: (req) => (req.user ? { external_id: req.user.id } : null)
```

- **It must come from a session the app verified, never from the request itself.** Not the query string, not the body, not a header the browser sets, not a wallet address the page sends. Why: every subscription is tied to what this function returns, and a paid route is opened on it. A function that reads `req.query.user` lets anyone type a subscriber's id and get their access.
- Return `null` when nobody is signed in. The routes then answer 401, and the widget tells the visitor to sign in first.
- Name the customer by `external_id`, the app's own stable id for the user. Use the same one everywhere: the routes and every paid route must name the same person the same way, or the subscription made under one name is not found under the other.

### Step 4: gate one paid route

Mounting the routes takes money; it gives nothing. Something must ask Mesub before serving what is paid. The question is `hasAccess(customer, slug)`, and each framework has a guard that asks it and answers the refusals itself:

| Framework | Guard | Ready to copy |
|---|---|---|
| Express | `requirePlan('pro', { customer })` | `assets/express-mesub.ts` |
| Next.js | `withMesub(handler, { plan: 'pro', customer })` | `assets/next-paid-route.ts` |
| NestJS | `@UseGuards(YourAuthGuard, RequirePlan('pro', { customer }))` | `assets/nest-paid.controller.ts` |

A guard answers **401** when nobody is signed in, **402** when the customer has no access, and **503** with `Retry-After` when Mesub could not answer about a customer it never saw. Keep those three apart: a client that treats them alike shows "please subscribe" during an outage.

Rules that hold whatever the framework:

- **Gate on the server.** Hiding a button in React is not a gate: the data must not leave the server without the check.
- **Do not cache the answer yourself.** The SDK already keeps answers and already handles an outage: it serves the last answer it knew for that customer for up to 24 hours, and refuses one it never saw. A second cache on top only makes a cancellation arrive late.
- **Do not turn an error into "not subscribed".** A wrong key or an unknown slug throws on purpose, so a broken integration is loud. Wrapping the check in a `try` that returns `false` hides it and locks out every paying subscriber.
- **Do not store "is subscribed" in the app's database** to read it later. Ask Mesub on each request: it is the one that knows about the renewal that just failed.

### Step 5: the provider and the button

Two pieces, both in `assets/`:

1. `assets/mesub-provider.tsx`: `MesubProvider`, once, around the app, with the stylesheet. Its `endpoint` is exactly the path of step 3.
2. `assets/subscribe-button.tsx`: `SubscribeButton` with the plan's slug.

- `endpoint` and the mount path must be the same string. A mismatch is the most common first-run failure: the window opens on an error instead of the plan.
- Requests go with the session cookie. If the app's login is a bearer token instead, the provider takes a `fetch` that adds the header: see `references/frameworks.md`.
- Do not add a wallet library, a wallet adapter or a connect button for this. The widget finds installed wallets itself, asks for an account when it needs a signature, and never disconnects one.
- Do not build the subscribe flow by hand. It is two signatures in a fixed order with terms that expire: the widget does it, and a hand-made version charges twice or not at all.

### Step 6: check, then hand the wallet part to the user

Run the check from the project root, with the script's path resolved under this skill's folder:

```bash
node "<skill-dir>/scripts/check-setup.mjs"
```

Replace `<skill-dir>` with the absolute path of the folder that holds this `SKILL.md`. Do not change into that folder first: the script reads the current directory. Add `--server-only` when the project has no React front. It only reads files, and shows where a key is, never its value.

Then go through `checks/verification.md`. It ends with the one step an agent cannot do: **the subscription itself needs a person with a wallet**, who approves twice in the window (the terms, then the first payment). Say so plainly instead of reporting the feature as tested. Report what you checked, what you could not, and what the user must click.

### What goes wrong on a first run

| What is seen | What it means | What to do |
|---|---|---|
| The server throws "Missing Mesub API key" on start | `MESUB_API_KEY` is not in that process's environment | Check the env file is the one the framework loads, and that the server was restarted |
| A paid route or the plan read answers 500 | Mesub refused the key (wrong, rotated, or another project's) | The user checks the key in the dashboard. Never answer it as a 401 |
| The window opens on an error instead of the plan, the plan read is 404 | `endpoint` is not the mount path, or the slug is not a plan of this project | Compare the two paths, then the slug with the dashboard |
| The window says "Sign in first" | The routes answer 401: `customer` returned `null` | The session is not reaching the route: cookie, middleware order, or a cross-origin call without credentials |
| A subscriber is refused on the paid route (402) | The paid route names the customer differently from the widget routes | Use one `customer` function for both |
| No wallet is offered | No wallet extension is installed in that browser | Nothing to fix in code |

Past these, the failure belongs to another skill: see `references/kit-directory.md`.

### Where the docs are

This skill holds what a first setup needs. The docs hold the rest, and they are the reference when the two disagree: the skill is written from them and may be a version behind.

| Page | Read it for |
|---|---|
| [First subscriber](https://docs.mesub.io/docs/quickstart) | The same four steps, written for a person: send the user there to follow along |
| [API key](https://docs.mesub.io/docs/api-key) | Creating, rotating and revoking the key in the dashboard |
| [Check access](https://docs.mesub.io/docs/access) | Every field of an access answer, several plans, the outage fallback |
| [React widget](https://docs.mesub.io/docs/react) | Every prop, the manage window, theming |

- Read a page when the task goes past this skill and its owner is not installed: `references/kit-directory.md` gives the page for each skill.
- Before using an option or a function this skill does not show, check it in the installed package (`node_modules/@mesub/node/README.md` and its type declarations). The installed version is what runs: never write a call from memory.
- If a docs page cannot be reached, say so and work from the installed package. Do not guess what the page said.
- When you finish, give the user the First subscriber link, so they can check the work against it.

## Related skills

<!-- related:start -->
<!-- Rendered from catalog.yaml by `pnpm render`. Do not edit. -->
This skill works alone and hands off to no other skill.

Every skill of the kit, with the same three answers for each: `references/kit-directory.md`.
<!-- related:end -->

## References

- `references/frameworks.md`: what Express, Next.js and NestJS each need, section by section, with the bearer-token and edge-runtime cases.
- `references/kit-directory.md`: every skill of the kit, how to install each one alone, and its docs fallback.

## Assets

- `assets/express-mesub.ts`: the widget routes and a guard for paid routes, for Express and for the `main.ts` of NestJS.
- `assets/next-mesub-route.ts`: the widget routes as an App Router catch-all.
- `assets/next-paid-route.ts`: one paid App Router route with `withMesub`.
- `assets/nest-paid.controller.ts`: one paid NestJS controller with `RequirePlan`.
- `assets/mesub-provider.tsx`: the provider and the stylesheet, once around the app.
- `assets/subscribe-button.tsx`: the subscribe button for one plan.

## Scripts

- `scripts/check-setup.mjs`: reads the project and reports, line by line, whether the packages, the API key, the routes, a gated route, the provider and the button are in place. Run it from the project root as `node "<skill-dir>/scripts/check-setup.mjs" [--help] [--server-only]`, where `<skill-dir>` is the folder of this `SKILL.md`. Read-only, no network.

## Checks

- `checks/verification.md`: the runbook to go through before saying the work is done.
