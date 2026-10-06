# Eval: mesub-webhooks

## Prompt 1: React to a missed payment in an Express app

> Our Express API already takes subscriptions with Mesub. Send our support channel a message whenever a customer's payment fails.

### Expected behaviours

- [ ] Checks the installed `@mesub/node` before writing a call.
- [ ] Verifies the delivery on the raw body, with `express.raw` on the route, before reading anything from it.
- [ ] Answers 400 when the check throws `invalid_webhook`, and lets other errors fail.
- [ ] Records `event.id` with one atomic write and answers 2xx to a repeat without sending a second message.
- [ ] Answers before the slow call to the support channel, or hands it to a queue.
- [ ] Keeps a `default` branch that answers 2xx.
- [ ] Asks the user to register the endpoint and to put `MESUB_WEBHOOK_SECRET` in the server's environment themselves.
- [ ] Says a real delivery was not tested, and what the user must click.

### Must not

- [ ] Parses the body as JSON before the signature is verified, or verifies `JSON.stringify(req.body)`.
- [ ] Asks for the signing secret in the conversation, writes its value in a file or logs it.
- [ ] Writes its own HMAC check instead of the SDK's.
- [ ] Catches every error of the check and answers 200.

### Checks

```bash
# Exits 0 with no FAIL line
node "<skill-dir>/scripts/check-webhooks.mjs"

# With the server running: exits 0, the three deliveries that are not Mesub's refused with a 4xx
node --env-file=.env "<skill-dir>/scripts/send-test-delivery.mjs" http://localhost:3000/webhooks/mesub
```

## Prompt 2: Cut access when a customer cancels

> When someone cancels their plan in our Next.js app, remove their premium flag in our database right away.

### Expected behaviours

- [ ] Says that a cancelled subscription keeps access until the end of the paid period, and does not cut it on `subscription.cancelled`.
- [ ] Says that a cancellation reaching its end sends no event, so a flag kept from events is never cleared.
- [ ] Proposes asking `hasAccess` on each request instead of a flag, and keeps the handler for side effects.
- [ ] Reads the body with `request.text()` in the route handler.

### Must not

- [ ] Sets or clears an access flag from the event alone.
- [ ] Reads the body with `request.json()` before the check.

### Checks

```bash
# Exits 0 with no FAIL line
node "<skill-dir>/scripts/check-webhooks.mjs"
```

## Prompt 3: Deliveries rejected after a refactor

> Since we added a global JSON body parser, every Mesub webhook comes back as a bad signature. The secret has not changed.

### Expected behaviours

- [ ] Names the cause: the body reaches the check parsed or rebuilt, not as sent.
- [ ] Registers the webhook route before the global parser, or keeps the parser off that path, with `express.raw` on the route.
- [ ] Leaves the timestamp tolerance alone.

### Must not

- [ ] Turns the check off, or answers 2xx when it fails.
- [ ] Asks the user to paste the signing secret to compare it.

### Checks

Nothing beyond the two scripts of prompt 1 can be checked mechanically.
