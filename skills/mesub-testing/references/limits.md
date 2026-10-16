# What the fake does not do

A green test run against the fake proves the app's own code: who it asks about, what it answers in each case, what it does with an event. It proves nothing below. Say so when reporting.

## Not checked by the fake

| The fake | The real Mesub |
|---|---|
| Refuses, with 400 `invalid_request`, a wallet that is not a base58 address (32 to 44 characters) and an email Mesub would refuse, on `access`, `list` and `create`; takes any string in `grant`, `addSubscription` and as an id | Refuses the same, and checks that the address and the ids are real |
| Accepts any `transaction` and any `terms_signature` on submit, any non-empty `signature` on a confirm | Checks them against what the wallet really signed |
| Lands a submit or a confirm at once | Waits for the network, and may answer late or not at all |
| Hands out a transaction that never expires | Lets a transaction live about half a minute, then refuses its submit with `transaction_expired` |
| Serves `blocked_since` and `blocked_reason` as the test set them, and null otherwise | Blocks a subscription when its charges cannot be made, ends its access on `access_until`, and unblocks it by itself |
| Never moves by itself: no renewal, no retry, no status change, no webhook sent. It records the events of what it changes (a submit, a confirm) and of `addEvent`, served on `/v1/events` | Charges every period, retries, stops, and sends the events |
| On a plan with an end date, refuses access once the date has passed, and ends nothing until `endPlan` is called | Ends each subscription within a few minutes of the plan's end, and sends `subscription.ended` |
| Serves a charge or a retry dated any time before a plan's end | Serves none due in the last two minutes before the end either |
| Hands out made-up terms, one line, the same for every plan | Writes the real terms, with the lines about a plan's end date and a single charge |
| Has no rate limit and no cap unless `fail()` says so | Has both |
| Knows the plans the test named, at a made-up price | Knows the project's real plans, their token and their period |
| Accepts its own made-up key and signs with its own made-up secret | Accepts the project's API key, signs with the endpoint's secret |

## So a test here cannot tell

- Whether `MESUB_API_KEY` is set on the server and accepted by Mesub.
- Whether the slug in the code is a plan of the project.
- Whether `MESUB_WEBHOOK_SECRET` is the endpoint's, and whether Mesub can reach the endpoint.
- Whether the app's real session read names the user: the test replaced it, unless it signs in through the app's own test login.
- Whether a real wallet can subscribe. The subscribe window needs a person with a wallet, who approves in it. `@mesub/react` ships no fake: a component test of the widget would have to invent what the server answers, and would test that invention.

These are checked once, against the real Mesub, by the user: the paid route called signed in and signed out, one subscription made by hand, one test delivery sent from the dashboard.

## Two traps of the fake itself

- **`revalidate_after` is Mesub's own** unless the test says otherwise: a client keeps a yes up to five minutes, a no 10 seconds. A client that asked before a change keeps the old answer: build one client per test, or `new FakeMesub({ revalidateAfter: 0 })` to see every change on the next call. A test that needs "the subscriber is out at once" to hold in production must send the event, as `webhooks.md` in this folder shows.
- **`reset()` empties the fake, not a client.** A client that outlives a test serves, during an outage, the last answer another test left it. One client per test.
