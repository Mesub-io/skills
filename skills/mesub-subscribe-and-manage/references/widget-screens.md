# What the window does, state by state

The widget has a screen for every case below and words it itself. Do not rebuild these in the app, and do not wrap the buttons in the app's own error handling: nothing is thrown to the app. Use this page to recognise what a user reports.

Each screen says whether anything moved: "Nothing was charged." or "Nothing changed." appear only when nothing can have landed.

## Subscribing

The window goes through `plan`, `wallet`, `review`, `approve`, `confirming` and `subscribed` (its `data-mesub-step`).

| What happens | What the window does | What it means for the app |
|---|---|---|
| Nobody is signed in on the site (the routes answer 401) | Says to sign in first, offers nothing to sign | Send signed-out visitors to the login before showing the button, or let the window say it |
| No wallet is installed | Links to two wallets, and Reload | Nothing to fix in code |
| A wallet cannot sign a message, or a transaction without sending it | Leaves it out of the list and names what it lacks | Nothing to fix in code |
| The wallet refuses to connect or to sign | Nothing is submitted. Try again asks the server anew and shows the review again | `subscribe()` resolves `null` if the visitor closes there |
| The terms expired before or between the two signatures | Asks the server again and shows the review with fresh terms | Stale terms are never signed nor submitted |
| The plan is unknown (404) | "Plan not found" | The slug, or the `plans` list of the routes |
| Mesub refuses (409: already subscribed, not enough to pay the first period, plan closed) | Shows Mesub's message as written | Do not translate or replace it |
| 403 `wallet_mismatch` | Asks for another wallet | The routes name the customer by wallet, and the visitor picked a different one |
| 429 | Says how long to wait | The API key's rate limit |
| Nothing landed (`reason` on submit) | "Payment did not go through", Mesub's reason, Try again | |
| No answer on what became of the payment (90 s passed, or a 5xx) | "Still confirming", and Check again | Check again sends the same request: it never pays twice. See the host limit in the routes reference |
| Double click | One window, one subscription prepared, the wallet asked once | |

## Cancelling, resuming, closing

The window goes through `confirm`, `wallet`, `approve`, `confirming` and `done`.

| What happens | What the window does |
|---|---|
| The action is asked | Says what it does first: "You keep access until ..." for a cancellation that is paid up, "It stops now" otherwise, and that closing returns the deposit |
| The paying wallet is already connected to the site | It is found without a prompt |
| Another wallet, or another account of it, is picked | "Wrong wallet": which account the wallet is on and which one pays. Nothing is built or signed |
| The wallet refuses | "Not approved". Nothing changed |
| Mesub refuses the action | "Cannot cancel it" (or resume, close) with Mesub's message |
| The transaction did not land (`reason` on the confirm) | "It did not go through", with the reason, and Try again |
| No answer on the confirm | "Still confirming", and Check again, which sends the same confirm and no new transaction |

Only the wallet that pays a subscription can sign for it. A subscriber who lost that wallet cannot cancel from the app, and neither can the app: the API key alone changes nothing.

## Timings

- Reads and builds: 15 seconds, then "No answer" with Try again.
- Submit and the confirms: 90 seconds, since they wait for the chain.
- A plan read is shared by slug for the life of the provider; a failed one is asked again next time.
