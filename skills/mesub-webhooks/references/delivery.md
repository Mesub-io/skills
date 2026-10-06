# Retries, duplicates and order

How Mesub delivers, and what the handler owes it in return.

## What counts as received

A 2xx answer within 10 seconds. Anything else is a failure and is sent again: a 4xx, a 5xx, a timeout, and a redirect too.

So the route must:

- **answer before any slow work.** Mail, a call to another service, a long query: record the event and hand the work to the app's own queue or job runner, then answer. A handler that does the work first passes every test and times out the day the other service is slow.
- **never redirect.** Common causes: the app's login middleware sending signed-out requests to a sign-in page, a trailing-slash rule, a forced host or scheme change in front of the app.
- **be reachable without a session.** Mesub sends no cookie and no token of the app. Leave the route out of the login, and out of CSRF protection: the signature is what proves who sent it.

## Retries

When the answer is not a 2xx, the same event is tried again after 1 minute, 5 minutes, 30 minutes, 2 hours, then every 12 hours, for about three days in all. Each try carries the same `event.id` and a new `webhook-timestamp`.

An endpoint that fails for three days with no success in between is **disabled**. Nothing is sent to it until the user enables it again in the dashboard, under Developers, then Webhooks. A handler that answers 500 to one kind of event it cannot handle will, after three days, stop receiving every event: acknowledge what you do not handle.

What to answer:

| Situation | Answer | Why |
|---|---|---|
| The check throws `invalid_webhook` | 400 | Not Mesub's, or replayed. Nothing to retry |
| The event is a repeat | 2xx | It was handled: anything else makes Mesub send it again |
| The type is unknown or not handled | 2xx | It was received. A failure here disables the endpoint in the end |
| The app's own handling failed (database down) | 5xx | Mesub sends it again later, which is what you want |
| The check throws anything else | 5xx, and fix it | A missing secret or a parsed body is a fault of the server |

## Duplicates

The same event can arrive more than once: a retry after a slow answer that had in fact succeeded, or two tries close together. Deduplicate on `event.id`.

- **One atomic write.** Insert the id under a unique key and let the database refuse the second insert. A read ("have I seen it?") followed by a write lets two deliveries arriving together both pass.
- **Release the id when the handling fails**, or do the handling and the insert in one database transaction. Otherwise the retry is dropped as a repeat and the event is lost for good.
- **Not in memory.** A set in the process is emptied by a restart and is not shared between two instances.
- **The id is per endpoint.** Two endpoints of one project receive the same event under different ids. If both feed the same code, deduplicate on what the event means as well.
- Keep the ids well past the three days of retries before pruning them: a delivery sent again later carries the same id.

A deduplication table is small:

```sql
CREATE TABLE mesub_events (
    id          text PRIMARY KEY,   -- event.id
    received_at timestamptz NOT NULL DEFAULT now()
);
-- claim: true when a row was inserted
INSERT INTO mesub_events (id) VALUES ($1) ON CONFLICT (id) DO NOTHING;
```

Make the effects themselves safe to repeat where you can (set a value rather than add to one): it covers what the table misses.

## Order

Order is not guaranteed. A retry of an old event can land after a newer one: `subscription.payment_failed` after the `subscription.renewed` that fixed it.

- **Before granting or revoking anything, ask `hasAccess`**, rather than trusting the last event seen. An event says something changed. Mesub says what is true now.
- `event.data` is the subscription as it was when the delivery was first tried, so it can already be newer than the event. It is still a copy: on a retry hours later it is hours old.
- Do not keep "is subscribed" in the app's database from events. Besides the order, a cancellation reaching its end sends no event at all.
- Compare `event.created_at` if the app keeps a history, and never let an older event overwrite a newer state.

`mesub.webhooks.verify` helps here: once the event is verified, the client drops every answer it had cached for that subscription's customer, so the next `hasAccess` in that process asks Mesub again. The bare `verifyWebhook` function has no client and drops nothing. Where the same process gates routes, prefer the client's method.

Who to ask about: the subscription names its customer three ways, `data.external_id` (the app's own id, null when none was given at checkout), `data.wallet` and `data.email`. Use the one the app's paid routes already use, and the plan's slug from `data.plan`.
