# What the fake does not do

A green test run against the fake proves the app's own code: who it asks about, what it answers in each case, what it does with an event. It proves nothing below. Say so when reporting.

## Not checked by the fake

| The fake | The real Mesub |
|---|---|
| Accepts any string as a wallet, an email or an id | Refuses a wallet that is not an address |
| Accepts any `transaction` and any `terms_signature` on submit, any non-empty `signature` on a confirm | Checks them against what the wallet really signed |
| Lands a submit or a confirm at once | Waits for the network, and may answer late or not at all |
| Never moves by itself: no renewal, no retry, no status change, no event sent | Charges every period, retries, stops, and sends the events |
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

- **`revalidate_after` is 0** on every answer the fake gives, so a change shows on the next call. A real answer is cached for a while. A test that needs "the subscriber is out at once" to hold in production must set `revalidate_after` and send the event, as `webhooks.md` in this folder shows.
- **`reset()` empties the fake, not a client.** A client that outlives a test serves, during an outage, the last answer another test left it. One client per test.
