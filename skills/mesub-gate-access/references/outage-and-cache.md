# The cache and the outage fallback

The SDK already does both. Read this before changing an option, adding a store, or explaining why a route answered what it did.

## Fresh, stale, gone

Every answer of Mesub carries `revalidate_after`, the seconds it stays true. The client keeps it:

1. **Fresh**, for `revalidate_after` seconds: served without calling Mesub.
2. **Stale**, for `maxStaleMs` more (24 hours by default): Mesub is asked again on the next call. The stale answer is used only if that call fails.
3. **Gone** after that.

So a gate is not instant: a subscription that stopped can keep its "yes" until the fresh answer runs out. That delay is Mesub's own choice, sent with each answer. Do not shorten it with a second cache or by skipping the SDK.

The cached answers of a customer are dropped early, on the same client, when:

- a subscription of theirs lands through it (`subscriptions.submit`, `retrieve` or `list` answering one that grants access): a cached "no" is dropped, so the paid route opens right after subscribing;
- a cancel, a resume or a close is confirmed through it, or `mesub.webhooks.verify` reads an event about them: every cached answer is dropped, the "yes" too.

This is why the guards, the widget routes and the webhook handler must share one client, or one store.

## When Mesub does not answer

"Does not answer" is a 5xx, a timeout or a network error after the retries, or a rate limit.

| Asked through | Customer seen before | Customer never seen |
|---|---|---|
| `hasAccess` | the last answer known | `false` |
| A guard | the last answer known | 503 with `Retry-After: 30` |
| `access`, `accessList` | throws a `MesubError` | throws a `MesubError` |

- "Seen" is per customer **and per plan**, as the customer was named: asked by `external_id` before, asked by `wallet` now, is never seen.
- The last answer known may be a "no": a guard then answers 402 during the outage, not 503.
- A stale "yes" with no charge or retry ahead (a cancelled subscription, a parked seat) stops granting at its own `access_until`. One with a renewal ahead keeps granting: it was most likely paid while Mesub was down.
- A paying customer never seen by this process gets 503 from a guard, and `false` from `hasAccess`. With the default memory cache that is everyone after a restart: see the store below.

## The options

All on `new Mesub({...})`, checked there: a wrong value throws a `TypeError` naming the option.

| Option | Default | What it does |
|---|---|---|
| `maxStaleMs` | 24 hours | How long a stale answer is kept for the fallback, in milliseconds. `0` turns the fallback off: an outage then keeps everyone out |
| `guardTimeout` | 2000 | How long a guard gives Mesub, retries included, in milliseconds. Then it falls back. Must be above 0 |
| `timeout` | 5000 | Per attempt of a read, in milliseconds |
| `maxRetries` | 2 | How many times a failed read is sent again |
| `cache` | memory, 10,000 answers | Where answers are kept |

- `guardTimeout` binds the guards only. Within it, a guard does not wait out a rate limit: it falls back at once.
- `hasAccess`, `access` and `accessList` called by hand use `timeout` and `maxRetries`: up to three attempts of 5 seconds each by default before `hasAccess` falls back. On a page that must not hang, lowering them is the user's decision, and it applies to every read of that client.
- These options live on the client. A guard given no `client` uses the default one, with the defaults: pass `client` to every guard, or the options change nothing for them.
- Choosing a shorter `maxStaleMs` trades subscribers locked out during a long outage against a cancelled customer served a little longer. That is a product decision: put it to the user, do not pick.

## The store

The default is a memory store: 10,000 answers, the least recently used dropped first, **per process and emptied on restart**. `new MemoryStore({ maxEntries })`, exported by `@mesub/node`, changes the size.

Plug a shared store when:

- there are several servers or workers: each one otherwise learns each customer by itself;
- processes do not live long (serverless functions, frequent deploys): a restart during an outage answers 503 to every subscriber.

A store is `get` and `set`, and `delete` if it can. `assets/mesub-client.ts` is one, ready to adapt:

```ts
interface CacheStore<T> {
    get(key: string): CacheEntry<T> | undefined | Promise<CacheEntry<T> | undefined>;
    set(key: string, entry: CacheEntry<T>, ttlMs: number): void | Promise<void>;
    delete?(key: string): void | Promise<void>;
}
```

- An entry is `{ value, freshUntil, keepUntil }`, the last two in epoch milliseconds. Store it whole and give it back whole.
- `ttlMs` is how long until `keepUntil`: let the store expire the key by itself.
- Without `delete`, an answer to drop is rewritten as stale instead, which also makes the next call ask Mesub.
- A store that throws never breaks a request: a failed read is a miss, a failed write is dropped.
- Keys read `mesub:access:key-<hash>:<plan>:<kind>:<id>`, and `mesub:access-list:key-<hash>:<kind>:<id>` for `accessList`. `<hash>` is the start of a SHA-256 of the API key, never the key. A wallet is written as it is; an external id or an email only as an HMAC under the API key. Several projects can share one store.
- Rotating the API key starts an empty cache: the first request of each customer asks Mesub again, and the fallback has nothing for them until then.

`access` and `accessList` asked with `{ attempts: true }` skip the cache both ways.

## What an agent cannot see

Whether production runs one process or many, and how long they live, is not in the code. Ask the user before deciding that the memory store is enough.
