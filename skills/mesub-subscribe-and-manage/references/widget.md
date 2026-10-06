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

**`chain`** has a default, and the docs page does not list this prop. A plan lives on one network (its `network` field, in what `GET <endpoint>/plans/<slug>` answers). If the provider's chain is not that network, the wallet is asked to sign for the wrong one. Read `MesubProviderProps` and the provider's default in the installed build, compare with the plan's `network`, and ask the user before changing it.

**Requests** go with `credentials: 'include'`, so the session cookie travels. A custom `fetch` receives that `init` and must pass it on, `signal` included.

## SubscribeButton

```tsx
<SubscribeButton plan="pro" onSubscribed={(subscription) => refresh()}>
    Subscribe to Pro
</SubscribeButton>
```

- `plan`: the plan's slug. Required.
- `onSubscribed(subscription)`: called once Mesub confirmed the first payment, even if the window was closed meanwhile.
- `children`: the label, "Subscribe" by default. While signing, confirming and once subscribed the button words itself.
- Every other `<button>` prop goes to the button, and the ref is forwarded. An `onClick` that calls `preventDefault()` stops the window from opening: that is how to run the app's own check first.
- It carries `data-mesub-subscribe` and `data-mesub-state`. Once subscribed it is disabled and followed by a `<span data-mesub-receipt>` with the next charge and a receipt link.

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

The signed-in customer's subscriptions, in the page: plan, price, status, the next date that matters, the paying wallet, and one button per row for what it allows. It words every state itself (loading, signed out, error with Try again, none yet).

- `onChanged(subscription)`: called once one was cancelled, resumed or closed.
- Other `<div>` props go to its root, which carries `data-mesub-subscriptions` and `data-mesub-state`.

## useSubscriptions

```tsx
const { state, subscriptions, error, reload, manage } = useSubscriptions();
```

| Returned | What it is |
|---|---|
| `state` | `loading`, `ready`, `signed-out` (the routes answered 401) or `error` |
| `subscriptions` | Newest first, each with `action`: `cancel`, `resume`, `close` or `null`. Checkouts nobody signed are left out |
| `error` | The server's message in the `error` state, `null` otherwise |
| `reload()` | Reads the list again |
| `manage(id)` | Opens the window for what that subscription allows. Resolves when it closes: the subscription as it is now, or `null` if nothing changed or it allows nothing |

Fields are as the server serves them: snake case, dates as ISO strings, `plan` is the slug. The app's own id and email are never in them.

## What is not exported

- No hook reads a plan. For a pricing page, call `mesub.plans.retrieve(slug)` or `mesub.plans.list()` on the server, or fetch `GET <endpoint>/plans/<slug>`, which is public. Show the subscribe button only when the plan's `available` is true, and print `amount_display` with `symbol`, never a number computed from `amount`.
- The error class and the window's parts are internal. Do not import from a path inside the package.
- One window at a time: a second `subscribe()` or `manage()` while one is open gets the first one's answer.
