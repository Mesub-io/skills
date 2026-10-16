# Retries, duplicates and order

How Mesub delivers, and what the handler owes it in return.

## What counts as received

A 2xx answer within 10 seconds. Anything else is a failure and is sent again: a 4xx, a 5xx, a timeout, and a redirect too.

So the route must:

- **answer before any slow work.** Mail, a call to another service, a long query: record the event and hand the work to the app's own queue or job runner, then answer. A handler that does the work first passes every test and times out the day the other service is slow.
- **never redirect.** Common causes: the app's login middleware sending signed-out requests to a sign-in page, a trailing-slash rule, a forced host or scheme change in front of the app.
- **be reachable without a session.** Mesub sends no cookie and no token of the app. Leave the route out of the login, and out of CSRF protection: the signature is what proves who sent it.

**No database or queue in the app yet.** The deduplication needs a durable store anyway, and the smallest one serves both. A single SQLite file is enough for one instance: `node:sqlite` is built in from Node 22.13 (behind a flag before), otherwise a SQLite library or the app's existing database. Then an outbox instead of a queue: `assets/handle-event.ts` decides the work from the event first (`workFor`), and `claim(id, work)` records the id and the work rows in one transaction (below); answer 2xx; drain the rows after the answer, from the same process or a timer: take each row with one conditional update so two drainers never send it at once, send, then mark it done. A send can still repeat if the process dies between sending and marking: make the effect safe to repeat where it can be, or say so. Several instances need a shared database, not a file each.

`node:sqlite` is still experimental: Node 22 and 24 print `ExperimentalWarning: SQLite is an experimental feature` once at start. It is harmless. Tell the user rather than hide it; to silence that one warning only, start Node with `--disable-warning=ExperimentalWarning` (in the start script or `NODE_OPTIONS`), never `--no-warnings`, which hides every other warning too.

## Retries

When the answer is not a 2xx, the same event is tried again after 1 minute, 5 minutes, 30 minutes, 2 hours, then every 12 hours, for about three days in all. Each try carries the same bytes (the event's `id` among them), the same `webhook-id` header and a new `webhook-timestamp`.

An endpoint that fails for three days with no success in between is **disabled**. Nothing is sent to it until the user enables it again in the dashboard, under Developers, then Webhooks. What it missed meanwhile is not sent again: catch up with `GET /v1/events` (below). A handler that answers 500 to one kind of event it cannot handle will, after three days, stop receiving every event: acknowledge what you do not handle.

What to answer:

| Situation | Answer | Why |
|---|---|---|
| The check throws `invalid_webhook` | 400 | Not Mesub's, or replayed. Nothing to retry |
| The event is a repeat | 2xx | It was handled: anything else makes Mesub send it again |
| The type is unknown or not handled | 2xx | It was received. A failure here disables the endpoint in the end |
| The app's own handling failed (database down) | 5xx | Mesub sends it again later, which is what you want |
| The check throws anything else | 5xx, and fix it | A missing secret or a parsed body is a fault of the server |

## Rotating the signing secret

The user regenerates an endpoint's secret in the dashboard, with an overlap of 24 hours or none (`regenerate_webhook_secret` takes 0 to 24). During the overlap the old secret keeps signing beside the new one: every delivery, retries included, carries two signatures in `webhook-signature`, space separated, the new secret's first:

```text
webhook-signature: v1,<signed with the new secret> v1,<signed with the old secret>
```

The check accepts the delivery when any one matches, and `verifyWebhook` and `mesub.webhooks.verify` already do. They take one secret, so the server never needs both: the old one keeps verifying until the new one is deployed, and the new one verifies from then on. After the overlap, deliveries carry the new signature alone.

The rollout to tell the user:

1. Regenerate the secret with an overlap.
2. Put the new secret in the server's environment as `MESUB_WEBHOOK_SECRET` and restart, before the overlap ends. No delivery fails at any point.
3. With no overlap, the old secret stops at once: every delivery is refused (400, `invalid_webhook`) until the new one is deployed. Retries cover about three days, so deploy it at once, and catch up with `GET /v1/events` if the endpoint was disabled meanwhile.

A secret that leaked gets no overlap: whoever holds it could sign deliveries until the overlap ends.

## Duplicates

The same event can arrive more than once: a retry after a slow answer that had in fact succeeded, or two tries close together. Deduplicate on an id that stays the same across them. Two do:

| Id | Where | Same on every retry | Same on every endpoint | In `GET /v1/events` |
|---|---|---|---|---|
| The event's `id` | The body | Yes | Yes | Yes |
| `webhook-id` | The header | Yes | No: one per endpoint | No |

Prefer the event's `id`: one table then covers every endpoint and the catch-up below. A body written before `available_since` has no `id`: fall back on `webhook-id` for it. What `event.id` holds after `verify` depends on the installed package (`events.md`, "What the installed package hands back"): an older one puts `webhook-id` there, which still deduplicates one endpoint.

- **One atomic write.** Insert the id under a unique key and let the database refuse the second insert. A read ("have I seen it?") followed by a write lets two deliveries arriving together both pass.
- **Release the id when the handling fails**, or do the handling and the insert in one database transaction. Otherwise the retry is dropped as a repeat and the event is lost for good.
- **Not in memory.** A set in the process is emptied by a restart and is not shared between two instances.
- **`webhook-id` is per endpoint.** Two endpoints of one project receive the same event under two `webhook-id`s and one event `id`. If both feed the same code, deduplicate on the event's `id`.
- Keep the ids well past the three days of retries before pruning them: a delivery sent again later carries the same id.

A deduplication table is small, and the outbox sits beside it:

```sql
CREATE TABLE mesub_events (
    id          text PRIMARY KEY,   -- the event's id, or webhook-id for a body without one
    received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE mesub_outbox (
    id       bigserial PRIMARY KEY,
    event_id text NOT NULL REFERENCES mesub_events (id) ON DELETE CASCADE,
    kind     text NOT NULL,
    payload  jsonb NOT NULL,
    taken_at timestamptz,
    done_at  timestamptz
);
-- claim(id, work), in ONE transaction: the id, then the work only when the id was new.
BEGIN;
INSERT INTO mesub_events (id) VALUES ($1) ON CONFLICT (id) DO NOTHING;  -- 0 rows: a repeat, ROLLBACK and answer 2xx
INSERT INTO mesub_outbox (event_id, kind, payload) VALUES ($1, $2, $3);  -- once per row of work
COMMIT;
-- release(id): the work goes with it.
DELETE FROM mesub_events WHERE id = $1;
-- the drainer takes a row (1 row updated: this drainer sends it), sends, then sets done_at.
-- A row taken and never done, by a process that died, is taken again after 5 minutes.
UPDATE mesub_outbox SET taken_at = now()
 WHERE id = $1 AND done_at IS NULL AND (taken_at IS NULL OR taken_at < now() - interval '5 minutes');
```

In SQLite the same holds with `INSERT OR IGNORE`, `changes()` for the row count, `integer PRIMARY KEY` and `text` for the payload, inside `BEGIN IMMEDIATE ... COMMIT`, and `PRAGMA foreign_keys = ON` for the cascade.

Make the effects themselves safe to repeat where you can (set a value rather than add to one): it covers what the table misses.

## Order

Order is not guaranteed. A retry of an old event can land after a newer one: `subscription.payment_failed` after the `subscription.renewed` that fixed it.

- **Apply one subscription's events in the order of `sequence`**: keep, per subscription, the highest `sequence` applied, and skip an event at or below it. One conditional write does it (`UPDATE ... SET last_sequence = $1 ... WHERE subscription_id = $2 AND last_sequence < $1`). `created_at` does not order events: it is when Mesub wrote them.
- **An event without `sequence`** (a body written before Mesub numbered events, or one it could not number) cannot be placed: read the state now with `mesub.subscriptions.retrieve` or `hasAccess` rather than applying its `data`.
- **Access comes from `subscription.access_granted` and `subscription.access_revoked` alone**, applied by `sequence`; every other event says why, not whether. Mesub does not send these two yet (`events.md`, "Order and access"): until an endpoint receives them, ask `hasAccess` before granting or revoking anything, and do not keep "is subscribed" from the other events, since a cancellation reaching its end sends none of them yet.
- `event.data` is the subscription as it stood right after the change that raised the event, however late the delivery: on a retry hours later it is hours old. (A body written before `available_since` carries it as it was at the delivery's first attempt instead.)

`mesub.webhooks.verify` helps here: once the event is verified, the client drops every answer it had cached for that subscription's customer, so the next `hasAccess` in that process asks Mesub again. The bare `verifyWebhook` function has no client and drops nothing. Where the same process gates routes, prefer the client's method.

Who to ask about: the subscription names its customer three ways, `data.external_id` (the app's own id, null when none was given at checkout), `data.wallet` and `data.email`. Use the one the app's paid routes already use, and the plan's slug from `data.plan`.

## Catching up: `GET /v1/events`

Mesub keeps every event of the project for 30 days and serves the very bodies its webhooks carry, byte for byte once parsed, with the same `id`. Read it after an outage, after the endpoint was disabled, or to backfill an endpoint added late.

```ts
// ADAPT: with a package that has no events call, the same GET with the API key as a bearer token.
const page = await fetch('https://api.mesub.io/v1/events?limit=100', {
    headers: { Authorization: `Bearer ${process.env.MESUB_API_KEY}`, 'Mesub-Version': '2026-10-02' },
}).then((response) => response.json());
// page: { data: Event[], has_more, available_since }
```

- **Newest first**, 25 a page by default, `limit` 1 to 100. The next page: `starting_after` set to the `id` of the last event of this one, while `has_more` is true.
- **Filters**: `type` (one event name) and `subscription` (one subscription's id).
- **Feed each body to the same handler**, deduplicated on the same event `id`: what was already handled by a delivery is skipped. The same `sequence` rule applies: the list is newest first, so feed one subscription's events oldest first. An item of `mesub.events.list` is typed `MesubEvent`, with no `delivery_id`: `assets/handle-event.ts` has `fromEventsList(event)`, which sets `delivery_id` to the event's `id` for `receiveEvent`.
- **A bounded window** ("since Saturday"): page until an event's `created_at` is older than its start, then stop.
- **Polling for what is new: do not stop at the first id you know.** An event's `created_at` is set a moment before it becomes visible, so one can appear below an event already read. Page on until `created_at` is a minute older than the newest you held, and skip the ids already seen.
- **30 days, counted from each call.** Events before `available_since` are not served at all, whatever the window: their deliveries carried the older shape.
- An event whose capture failed is missing until Mesub recovers it: Mesub is alerted and never serves it with a later state.
- `GET /v1/events/{id}` reads one, by the `id` its body carries; `event_not_found` (404) past the 30 days or before `available_since`.
- A read route of the API, counted in the 1,000 a minute per API key. A catch-up loop pages, it does not hammer.

Before writing it, look in `node_modules/@mesub/node` for an events call (`mesub.events`): a package that has one does the paging and checks the bodies. Never put the API key in a URL, a log or client code.
