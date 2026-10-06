---
name: mesub-subscribe-and-manage
description: Use this skill when an app that already has Mesub set up must let users subscribe, cancel, resume or close a subscription, in React or from the server, even if the user just says "add a cancel button" or "make the pay button match our design". Covers @mesub/react (SubscribeButton, useSubscribe, ManageButton, ManageSubscriptions, useSubscriptions, manageUrl, theming), the routes it calls, and mesub.subscriptions.* (create, submit, cancel, resume, close).
compatibility: Node 22 or later for @mesub/node, React 18 or 19 for @mesub/react. Needs a login the app verifies and, for the widget, the routes of @mesub/node mounted on the app's server. Check both packages in package.json and node_modules before use.
license: Apache-2.0
---

# Mesub Subscribe and Manage

## Overview

This skill covers the moments a wallet signs: subscribing, cancelling, resuming and closing. With `@mesub/react` the widget does the wallet work and calls routes on the app's own server. Without it, the server calls `mesub.subscriptions.*` and the app's own page has the wallet sign. The rules here keep a customer from being locked out early or left unsure whether they paid.

## When to use this skill

- A subscribe button of the app's own, or anything around the window: `useSubscribe`, its states, `onSubscribed`.
- Letting a customer cancel, resume or close: `ManageButton`, `ManageSubscriptions`, `useSubscriptions`, `manageUrl`.
- Theming the widget, or reading what its routes take and answer.
- Subscribing or managing from the server, for an app without the widget.

## Do not use this skill when

- The project has no Mesub code yet: the packages, the API key, mounting the routes and the first button come first.
- The task is deciding who may see a paid route or page.
- The task is receiving Mesub's events, testing, or diagnosing an error code or a failed charge.

## Core guidance

### First, read what is there

Read `package.json`, the lockfile and `node_modules/@mesub/*/package.json` for the versions. Neither package may be on the public registry yet: never assume an install works, and if one says the package does not exist, stop and tell the user. Then find `<MesubProvider endpoint=...>` and the `mesubRoutes` or `mesubRouteHandlers` call. With neither, first setup is not done: say so.

### Pick the path

| The app | Use | Read first |
|---|---|---|
| React, no wallet UI of its own | The widget | `references/widget.md` |
| Not React, or it owns its wallet step | `mesub.subscriptions.*` | `references/server-subscribe.md`, `references/server-manage.md` |

Prefer the widget when both fit: it handles expired terms, the wrong wallet and unknown outcomes. Copy an asset, then adapt its `ADAPT` lines.

### Rules for the widget

- **Access is decided on the server.** `onSubscribed`, `state === 'subscribed'` and `onChanged` are signals to fetch again, never a grant. Why: client state is the visitor's to edit, and `state` is `idle` again after a reload.
- **Do not lock a customer out when they cancel.** A paid-up subscription keeps access until `access_until`, never later than its plan's end date. Keep asking Mesub.
- **Read `action`, do not compute it.** `useSubscriptions()` says what each subscription allows now. Keep a default branch on `status`: `references/statuses.md`.
- **Do not rebuild or wrap the window's screens**, and add no wallet library. Every failure has its screen and says whether anything was charged: `references/widget-screens.md`.
- **`manageUrl` is a path starting with one `/`, an http(s) URL or `null`.** Any other string is ignored without a word.
- **Theme through `--mesub-*` properties only.** The widget has no class names: `references/theming.md`.
- **A file that calls a hook or hands the widget a function is a client component**, under the provider. `@mesub/node` is never imported there.
- **Check the provider's `chain` against the plan's network** before a real subscription, and ask the user: `references/widget.md`.

### Rules for the server path

- **Subscribing: the wallet signs and does not send. Managing: the wallet signs and sends.** Swapping them fails silently.
- **Identity comes from the session.** `external_id` is the verified user's id, never a value the page sent. Before any call by subscription id, check whose it is: the API key reaches every subscription of the project.
- **Branch on the result, not on the absence of an error**: `subscription.access` after `submit`, `reason === undefined` after a confirm.
- **An unknown outcome is not a failure.** On `MesubSubmitError` read the subscription back and never create anew until it reads `expired`. A confirm that timed out is sent again with the same signature.
- **Only the paying wallet can cancel, resume or close.** No server call does it alone: say so if asked for one.
- **`submit` waits up to 130 s and a confirm 90 s**, in the widget's routes too: `references/routes.md` for hosts that cut sooner.
- **Show `terms.message` as written and the costs before the wallet is asked**, and Mesub's refusal messages as written. On a plan with an end date the terms say what a page must not reword: `references/server-subscribe.md`.

### The check

From the project root:

```bash
node "<skill-dir>/scripts/check-wallet-side.mjs"
```

`<skill-dir>` is the absolute path of the folder that holds this `SKILL.md`. Do not change into it: the script reads the current directory.

**A real subscription or cancellation needs a person with a wallet.** Report the work as wired and checked up to the wallet, never as tested end to end, and say what the user must click.

## Related skills

<!-- related:start -->
<!-- Rendered from catalog.yaml by `pnpm render`. Do not edit. -->
This skill works alone: never assume another one is installed. The other skills of the kit: `mesub-quickstart`, `mesub-gate-access`, `mesub-webhooks`, `mesub-testing`, `mesub-errors`, `mesub-mcp`.

For a task outside this skill, find its owner in `references/kit-directory.md` (what each skill covers, how to install it alone, its docs page), and say which skill owns it.
<!-- related:end -->

## References

- `references/widget.md`: every component, hook and provider prop, and what is not exported.
- `references/widget-screens.md`: what the window does in each case, and its timings.
- `references/theming.md`: the stylesheet, the custom properties, dark mode, the attributes.
- `references/routes.md`: the routes the widget calls, their options, answers, refusals and timings.
- `references/server-subscribe.md`: create, sign, submit, and an unknown outcome.
- `references/server-manage.md`: cancel, resume, close, their refusals, and a subscription's payments.
- `references/statuses.md`: the nine statuses, what each allows, and the fields to read.
- `references/docs.md`: the docs pages behind this skill, and where they differ from the packages.
- `references/kit-directory.md`: every skill of the kit, how to install each one alone, and its docs fallback.

## Assets

- `assets/custom-subscribe-button.tsx`: a button of the app's own on `useSubscribe`.
- `assets/manage-subscriptions.tsx`: `ManageButton` and `ManageSubscriptions`.
- `assets/own-subscriptions-list.tsx`: a list drawn by the app on `useSubscriptions`.
- `assets/mesub-theme.css`: the custom properties that brand the widget.
- `assets/server-subscriptions.ts`: subscribe, cancel, resume and close from the server, with the ownership check.

## Scripts

- `scripts/check-wallet-side.mjs`: reports a missing provider, an ignored `manageUrl`, a refused slug, a half-done server flow. Read-only, no network, opens no env file. Usage above.

## Checks

- `checks/verification.md`: the runbook to go through before saying the work is done.
