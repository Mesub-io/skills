// The one Mesub client of the server. Copy to a server-only module, then pass `mesub` as
// `client` to every guard and to the widget routes: a guard given no client builds its own,
// with default options and a cache of its own.
import { Mesub, type AccessAnswer, type AccessList, type CacheEntry, type CacheStore } from '@mesub/node';

type Cached = AccessAnswer | AccessList;

// ADAPT: the three calls of the app's own shared store (Redis or the like).
// `set` must expire the key after `ttlMs` milliseconds.
export interface KeyValue {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ttlMs: number): Promise<unknown>;
    del(key: string): Promise<unknown>;
}

// A store that throws is read as a miss: it never breaks a request.
export function sharedStore(kv: KeyValue): CacheStore<Cached> {
    return {
        get: async (key) => {
            const raw = await kv.get(key);
            return raw === null ? undefined : (JSON.parse(raw) as CacheEntry<Cached>);
        },
        set: async (key, entry, ttlMs) => {
            await kv.set(key, JSON.stringify(entry), ttlMs);
        },
        // Optional, but it is what drops a cached "no" the moment a subscription lands.
        delete: async (key) => {
            await kv.del(key);
        },
    };
}

// ADAPT: return the app's shared store when there are several servers, or processes that do
// not live long. Left undefined, answers are kept in this process's memory, emptied on restart.
function store(): KeyValue | undefined {
    return undefined;
}

const kv = store();

// Reads MESUB_API_KEY from the server's environment. Built once, at module level:
// one built per request starts with an empty cache and no outage fallback.
export const mesub = new Mesub({
    ...(kv && { cache: sharedStore(kv) }),
    // ADAPT: only on the user's decision. These are the defaults.
    maxStaleMs: 24 * 60 * 60 * 1000, // how long a stale answer serves an outage. 0 keeps everyone out.
    guardTimeout: 2000, // how long a guard waits for Mesub before it falls back.
});
