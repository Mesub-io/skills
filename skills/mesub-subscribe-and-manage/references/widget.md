# The components and hooks of @mesub/react

Everything the package exports for an app, checked against its source. Before using a prop that is not here, read `node_modules/@mesub/react/dist/index.d.ts`: the installed build is what runs.

All of them must render under `MesubProvider`. Outside it, a hook throws "@mesub/react must be used inside <MesubProvider>". The build starts with `'use client'`: in an App Router project, a file that calls a hook or passes a function prop (`onSubscribed`, `onChanged`, `fetch`) must itself be a client component.

## MesubProvider

Once, around the app. It renders the one window every button and hook opens.

| Prop | What it is |
|---|---|
| `endpoint` | Where the server mounted the routes. A path on the site, or a full URL. Required |
| `theme` | `light`, `dark` or `auto`, set on the widget as `data-mesub-theme`. Left out, the widget inherits it from an ancestor |
| `fetch` | The app's own `(url, init) => Promise<Response>`, to add a header such as a bearer token |
| `manageUrl` | Where "Cancel any time" leads on the receipt: see below |
| `chain` | The network the wallet signs for and sends on, a `solana:...` string. See below |

**`manageUrl`** takes three kinds of value, and a fourth that fails silently:

- left out: the link opens Mesub's own page, in a new tab;
- a path of the site that starts with one `/` (`/account`): the link opens that page in place;
- a full `http://` or `https://` URL: it opens in a new tab;
- `null`: no link at all.

Any other string (`account`, `//host/page`, a value with a space) is ignored and the link falls back to Mesub's page. Nothing warns about it. Point it at the page that renders `ManageSubscriptions` or a list built on `useSubscriptions`.

**`chain`**: Mesub runs on Solana mainnet, so set `chain="solana:mainnet"`. A plan's `network` field (in what `GET <endpoint>/plans/<slug>` answers) reads `mainnet-beta`, and `solana:mainnet` is the wallet's name for it. Left out, the provider's default is not mainnet, and the wallet is asked to sign for the wrong network.

Never `solana:mainnet-beta`: it type-checks, but no wallet knows that chain.

**Requests** go with `credentials: 'include'`, so the session cookie travels. A custom `fetch` receives that `init` and must pass it on, `signal` included.

## SubscribeButton

```tsx
<SubscribeButton plan="pro" onSubscribed={(subscription) => refresh()}>
    Subscribe to Pro
</SubscribeButton>
```

- `plan`: the plan's slug. Required. Read it in the dashboard (the plan's Implement tab) or from `mesub.plans.list()` on the server, never guess it from the plan's name: an unknown slug shows "Plan not found".
- `onSubscribed(subscription)`: called once Mesub confirmed the first payment, even if the window was closed meanwhile.
- `children`: the label, "Subscribe" by default. While signing, confirming and once subscribed the button words itself.
- Every other `<button>` prop goes to the button, and the ref is forwarded. An `onClick` that calls `preventDefault()` stops the window from opening: that is how to run the app's own check first.
- It carries `data-mesub-subscribe` and `data-mesub-state`. Once subscribed it is disabled and followed by a `<span data-mesub-receipt>` with the next charge, when there is one, and a receipt link.

## useSubscribe

```tsx
const { state, subscription, signature, subscribe } = useSubscribe('pro', { onSubscribed });
```

| Returned | What it is |
|---|---|
| `state` | `idle`, `open` (the window is up, nothing is being signed), `signing`, `confirming` or `subscribed` |
| `subscribe()` | Opens the window. Resolves when it closes: the subscription, or `null` when it did not go through |
| `subscription` | The subscription once confirmed, `null` before |
| `signature` | The transaction that paid the first period, base58, or `null` |

A button of the app's own on this hook draws only what it draws: the `data-mesub-receipt` line of `SubscribeButton` (next charge, receipt link) is gone unless the app renders it from `subscription.next_charge_at` and `signature`. `assets/custom-subscribe-button.tsx` keeps the next charge and leaves the receipt link out, since the explorer link is not exported. Busy (`signing`, `confirming`), make it `aria-disabled` and ignore the click, not `disabled`, as `SubscribeButton` does: the keyboard focus stays on it.

`state` goes back to `idle` when the window is closed before the end. It is this component's memory only: after a reload it is `idle` again even for a subscriber. To know whether the visitor already subscribed, ask the server or `useSubscriptions`.

## ManageButton

```tsx
<ManageButton plan="pro" />
```

Opens one subscription in the Mesub window: how it stands, what is charged next, the latest payments with their receipts, and the one action it allows.

- `plan`: optional. Left out, it opens the customer's live subscription whatever its plan.
- Which one it opens: a running one (`active`, `unpaid`, `cancelled`, `stopped`) before an ended one, the newest first. With none, the window says "No subscription yet".
- `children`: the label, "Manage subscription" by default. Other `<button>` props go to the button, and `preventDefault()` in `onClick` stops it.
- **It has no callback.** To react to a change made in its window, read `useSubscriptions()` somewhere on the page: every list reads again by itself after a change made through the widget.

## ManageSubscriptions

```tsx
<ManageSubscriptions onChanged={(subscription) => refresh()} />
```

The signed-in customer's subscriptions, in the page: plan, price, status, the next date that matters (the next charge, the next try, or the end of its access), the paying wallet, and one button per row for what it allows. A late payment the customer can pay now also gets **Pay now**: nothing to sign, it charges the missed period at once; when Mesub is busy the button counts down the seconds before it can be pressed again. It words every state itself (loading, signed out, error with Try again, none yet).

- `onChanged(subscription)`: called once one was cancelled, resumed or closed.
- Other `<div>` props go to its root, which carries `data-mesub-subscriptions` and `data-mesub-state`.

## useSubscriptions

```tsx
const { state, subscriptions, error, reload, payNow, manage } = useSubscriptions();
```

| Returned | What it is |
|---|---|
| `state` | `loading`, `ready`, `signed-out` (the routes answered 401) or `error` |
| `subscriptions` | Newest first, each with `action` (`cancel`, `resume`, `close` or `null`) and `payable` (a late payment that paying now can settle: `unpaid`, not paused nor blocked, still approved by the wallet, before `retry_deadline`). Checkouts nobody signed are left out |
| `error` | The server's message in the `error` state, `null` otherwise |
| `reload()` | Reads the list again |
| `payNow(id)` | Pays that late payment now, with nothing to sign. Never throws: resolves to a `PayNowResult`, `{ ok, message, retryAfter? }`. `ok` true means the charge was sent, not paid: the list reads again and the outcome comes with the charge. `message` is the widget's own sentence for a refusal (add funds, wait N minutes, no retries left, and when Mesub is busy "Mesub can't take the payment right now. Nothing was charged."). `retryAfter`, in seconds, only when Mesub was busy (a 503 with `Retry-After`, about 20 seconds): disable the button and count it down, then clear the message. Offer it only on a `payable` row |
| `manage(id)` | Opens the window for what that subscription allows. Resolves when it closes: the subscription as it is now, or `null` if nothing changed or it allows nothing |

Fields are as the server serves them: snake case, dates as ISO strings, `plan` is the slug. The app's own id and email are never in them.

## What is not exported

- No hook reads a plan. For a pricing page, call `mesub.plans.retrieve(slug)` or `mesub.plans.list()` on the server, or fetch `GET <endpoint>/plans/<slug>`, which is public. Show the subscribe button only when the plan's `available` is true, and print `amount_display`, never a number computed from `amount`. Which token it is, how to mark an unverified one and what `amount_usd` means: `plan-token.md`. `ends_at` is the plan's end date, `null` for a plan with no end: a pricing page that prints "per month" for a plan about to end promises charges the terms do not.
- The error class and the window's parts are internal. Do not import from a path inside the package.
- One window at a time: a second `subscribe()` or `manage()` while one is open gets the first one's answer.
