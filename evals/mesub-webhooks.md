# Eval: mesub-webhooks

## Prompt 1: React to a missed payment in an Express app

Fixture: [express-mesub](fixtures/express-mesub/README.md).

> Our Express API already takes subscriptions with Mesub. Send our support channel a message whenever a customer's payment fails.

### Expected behaviours

- [ ] Checks the installed `@mesub/node` before writing a call.
- [ ] Verifies the delivery on the raw body, with `express.raw` on the route, before reading anything from it.
- [ ] Answers 400 when the check throws `invalid_webhook`, and lets other errors fail.
- [ ] Records the event's id (`event.id` as the installed package hands it back) with one atomic write and answers 2xx to a repeat without sending a second message.
- [ ] Reads the failure's `reason` from `detail` at the top of the body, not from `data.detail`.
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
node --env-file=.env "<skill-dir>/scripts/send-test-delivery.mjs" <base-url>/webhooks/mesub
```

## Prompt 2: Cut access when a customer cancels

Fixture: [next-mesub](fixtures/next-mesub/README.md).

> When someone cancels their plan in our Next.js app, remove their premium flag in our database right away.

### Expected behaviours

- [ ] Says that a cancelled subscription keeps access until the end of the paid period, and does not cut it on `subscription.cancelled`.
- [ ] Says that only `subscription.access_revoked` tells when a cancellation reaches its end, and that Mesub does not send it yet, so a flag kept from the other events is never cleared.
- [ ] Proposes asking `hasAccess` on each request until the access events arrive, and keeps the other branches for side effects.
- [ ] If it writes access branches, applies `subscription.access_granted` and `subscription.access_revoked` by `sequence`, skipping one at or below the last applied for that subscription.
- [ ] If it keeps a per-user flag, keeps one row per subscription with the user it names, and reads the user's flag over all of their subscriptions.
- [ ] Reads the body with `request.text()` in the route handler.
- [ ] When the project has no database or no premium flag, builds against a clearly named placeholder marked `ADAPT` (the flag store behind the access events) and says so in the reply, rather than stopping to ask or inventing a table silently.

### Must not

- [ ] Sets or clears an access flag from `subscription.cancelled` or any event other than the two access events.
- [ ] Applies an access event without comparing its `sequence`, or applies the `data` of an event that has none.
- [ ] Reads the body with `request.json()` before the check.

### Checks

```bash
# Exits 0 with no FAIL line (a handler written against a marked placeholder store passes)
node "<skill-dir>/scripts/check-webhooks.mjs"
```

## Prompt 3: Deliveries rejected after a refactor

Fixture: [express-mesub](fixtures/express-mesub/README.md).

> We must receive Mesub's webhooks in this API. Our last attempt answered bad signature to every delivery since the app has a global JSON body parser, so we removed it. Add it back so it works. The secret has not changed.

### Expected behaviours

- [ ] Names the cause: the body reaches the check parsed or rebuilt, not as sent.
- [ ] Registers the webhook route before the global parser, or keeps the parser off that path, with `express.raw` on the route.
- [ ] Leaves the timestamp tolerance alone.

### Must not

- [ ] Turns the check off, or answers 2xx when it fails.
- [ ] Asks the user to paste the signing secret to compare it.

### Checks

Nothing beyond the two scripts of prompt 1 can be checked mechanically.

## Prompt 4: Events missed while the endpoint was down

Fixture: [express-mesub](fixtures/express-mesub/README.md).

> Our server was down most of Saturday. Make sure the support channel still hears about every payment that failed meanwhile, and that nobody gets the message twice.

### Expected behaviours

- [ ] Reads the missed events from `GET /v1/events` (or the installed package's events call), filtered on `subscription.payment_failed`.
- [ ] Pages with `starting_after` set to the last event's `id` while `has_more` is true.
- [ ] Feeds each event to the same handler as the deliveries, deduplicated on the same event `id` (an `events.list` item through `fromEventsList`, or the same mapping).
- [ ] Hands the message to an outbox, or the app's queue, drained after the 2xx, and says what can still repeat.
- [ ] Says the API keeps 30 days of events, and none before `available_since`.
- [ ] Keeps the API key on the server: in the `Authorization` header, never in a URL or a log.

### Must not

- [ ] Deduplicates the catch-up on `webhook-id`, which the events list does not carry.
- [ ] Stops paging at the first id already seen.
- [ ] Re-sends a message for an event a delivery already handled.

### Checks

```bash
# Exits 0 with no FAIL line
node "<skill-dir>/scripts/check-webhooks.mjs"

# Exits 0: the code reads the events list
grep -rn '/v1/events\|events\.list' src
```
