---
name: mesub-subscribe-and-manage
description: Use this skill when an app that already has Mesub set up must let users subscribe, cancel, resume or close a subscription, in React or from the server, even if the user just says "add a cancel button" or "make the pay button match our design". Covers @mesub/react (SubscribeButton, useSubscribe, ManageButton, ManageSubscriptions, useSubscriptions, manageUrl, theming), the routes it calls, and mesub.subscriptions.* (create, transaction, submit, cancel, resume, close).
compatibility: Node 22 or later for @mesub/node, React 18 or 19 for @mesub/react. Needs a login the app verifies and, for the widget, the routes of @mesub/node mounted on the app's server. Check both packages in package.json and node_modules before use.
license: Apache-2.0
---

# Mesub Subscribe and Manage

## Overview

This skill covers the moments a wallet signs: subscribing, cancelling, resuming, closing. With `@mesub/react` the widget does it through the app's own routes; without it, the server calls `mesub.subscriptions.*`.

## When to use this skill

- A subscribe button of the app's own, or anything around the window: `useSubscribe`, its states, `onSubscribed`.
- Letting a customer cancel, resume or close: `ManageButton`, `ManageSubscriptions`, `useSubscriptions`, `manageUrl`.
- Theming the widget, or what its routes take and answer.
- Subscribing or managing from the server, for an app without the widget.

## Do not use this skill when

- The project has no Mesub code yet: the packages, the API key and the routes come first.
- The task is deciding who may see a paid route or page.
- The task is receiving Mesub's events, testing, or diagnosing an error code or a failed charge.

## Core guidance

### First, read what is there

Read `package.json`, the lockfile and `node_modules/@mesub/*/package.json` for the versions; a package that does not install: stop and tell the user. Then find `<MesubProvider endpoint=...>` and the `mesubRoutes` or `mesubRouteHandlers` call. With neither, setup is not done: say so.

### Pick the path

| The app | Use | Read first |
|---|---|---|
| React, no wallet UI of its own | The widget | `references/widget.md` |
| Not React, or it owns its wallet step | `mesub.subscriptions.*` | `references/server-subscribe.md`, `references/server-manage.md` |

Prefer the widget when both fit: it handles expiries and unknown outcomes. Copy an asset, adapt its `ADAPT` lines.

### Rules for the widget

- **Access is decided on the server.** `onSubscribed`, `state === 'subscribed'` and `onChanged` are signals to fetch again, never a grant. Why: client state is the visitor's to edit.
- **Do not lock out a customer who cancels.** Access runs until `access_until`.
- **Read `action` and `payable`, do not compute them.** `useSubscriptions()` says what each allows now; `payNow(id)` pays a late one. Keep a default branch on `status` (`references/statuses.md`).
- **A blocked subscription is not a late one.** `blocked_reason` is never the customer's doing; access ends at `access_until`.
- **Do not rebuild or wrap the window's screens**, and add no wallet library: `references/widget-screens.md`.
- **`manageUrl` is a path starting with one `/`, an http(s) URL or `null`**, else ignored.
- **Theme through `--mesub-*` properties only**, never class names: `references/theming.md`.
- **A value the project lacks** ("our purple" with no purple in it): build with a named placeholder marked `ADAPT`, and say so. Never stop to ask, never invent one silently.
- **A file calling a hook or handing the widget a function is a client component**, under the provider, never importing `@mesub/node`.
- **The provider's `chain` is the test network by default: set it to the plans' network** before a real subscription (`references/widget.md`).

### Rules for the server path

- **Subscribing: the wallet signs and does not send. Managing: the wallet signs and sends.** Swapped, it fails silently.
- **Identity comes from the session.** `external_id` is the verified user's id, never one the page sent. Before a call by subscription id, check whose it is: the API key reaches every subscription.
- **Terms first, transaction last.** A transaction lives half a minute (`transaction_expires_at`). Once the terms are signed, ask `subscriptions.transaction(id)`, sign at once, submit. Expired: ask again, never `create` anew.
- **Branch on the result, not on the absence of an error**: `subscription.access`, then `reason_code`, never the words of `reason`.
- **Offer Close only while `closable`** ("Close from" `closable_from`); word a stop by `stop_reason`.
- **An unknown outcome is not a failure.** On `MesubSubmitError` read the subscription back; never create anew until it reads `expired`.
- **Only the paying wallet can cancel, resume or close**, never a server call alone: say so if asked, and offer `ManageButton`.
- **`submit` waits up to 130 s, a confirm 90 s**: `references/routes.md` for hosts that cut sooner.
- **Show `terms.message` as written and the costs before the wallet is asked**, and Mesub's refusals as written. A plan's end date: `references/server-subscribe.md`.

### The check

From the project root:

```bash
node "<skill-dir>/scripts/check-wallet-side.mjs"
```

`<skill-dir>` is this skill's folder, as an absolute path: do not change into it.

**A real subscription or cancellation needs a person with a wallet.** Report it as checked up to the wallet, never as tested end to end, and say what the user must click.

## Related skills

<!-- related:start -->
<!-- Rendered from catalog.yaml by `pnpm render`. Do not edit. -->
This skill works alone: never assume another is installed. A task outside it: name its owner, from `references/kit-directory.md`. Not installed: install it only on the user's yes, else stop and say so. Going on without it is the user's call, keeping its rule:

- `mesub-quickstart`: never ask for the API key; `customer` from the verified session.
- `mesub-gate-access`: gate on the server; an error is never "not subscribed".
- `mesub-webhooks`: verify the raw body's signature; deduplicate on the event id.
- `mesub-testing`: never mock `@mesub/node`: a seam and `FakeMesub`.
- `mesub-errors`: branch on `apiCode`, never a message; never loop on `retryable`.
- `mesub-mcp`: ask before any change; never an API key.
<!-- related:end -->

## References

- `references/widget.md`: every component, hook and provider prop, what is not exported.
- `references/widget-screens.md`: what the window does in each case, its timings.
- `references/theming.md`: the stylesheet, custom properties, dark mode.
- `references/routes.md`: the widget's routes, options, answers, refusals, timings.
- `references/server-subscribe.md`: create, the fresh transaction, submit, `transaction_expired`, unknown outcomes.
- `references/server-manage.md`: cancel, resume, close (`closable`), refusals, payments.
- `references/plan-token.md`: a plan's token (an unverified one marked, its mint shown), `amount_usd`.
- `references/statuses.md`: the statuses, what each allows, `stop_reason`, blocked charges.
- `references/docs.md`: the docs pages behind this skill, where they differ from the packages.
- `references/kit-directory.md`: every skill of the kit, its install and docs.

## Assets

- `assets/custom-subscribe-button.tsx`: a button of the app's own on `useSubscribe`.
- `assets/manage-subscriptions.tsx`: `ManageButton` and `ManageSubscriptions`.
- `assets/own-subscriptions-list.tsx`: a list drawn by the app on `useSubscriptions`.
- `assets/mesub-theme.css`: custom properties that brand the widget.
- `assets/server-subscriptions.ts`: subscribe, cancel, resume, close from the server, ownership checked.

## Scripts

- `scripts/check-wallet-side.mjs`: reports a missing provider or `chain`, an ignored `manageUrl`, an access flag in the browser, a server cancel, a half-done server flow. Read-only.

## Checks

- `checks/verification.md`: the runbook before saying the work is done.
