// Next.js App Router: the route Mesub posts events to.
// Copy to app/webhooks/mesub/route.ts, with handle-event.ts beside it.
// Leave this path out of the app's login in middleware.ts: a redirect counts as a failure.
import { MesubError, verifyWebhook } from '@mesub/node';
import { type AccessStore, type EventDeps, type EventStore, receiveEvent } from './handle-event';

// ADAPT: the app's own store, see handle-event.ts. Until it is replaced this throws,
// so no event is acknowledged without being recorded.
const store: EventStore = {
    claim: async () => {
        throw new Error('Record the event id in the app\'s database here.');
    },
    release: async () => {},
};

// ADAPT: the app's access table, see handle-event.ts. Mesub does not send the access events yet;
// until this is replaced, one that arrives throws and is retried rather than dropped.
const access: AccessStore = {
    apply: async () => {
        throw new Error('Record the access in the app\'s database here.');
    },
    refresh: async () => {
        throw new Error('Read the subscription now and record its access here.');
    },
};

// ADAPT: add what the reactions in handle-event.ts use.
const deps: EventDeps = { store, access };

export async function POST(request: Request): Promise<Response> {
    let event;
    try {
        // request.text(), never request.json(): the signature is over the bytes as sent.
        // Reads MESUB_WEBHOOK_SECRET from the server's environment.
        event = await verifyWebhook(await request.text(), request.headers);
    } catch (error) {
        if (error instanceof MesubError && error.code === 'invalid_webhook') {
            return new Response(null, { status: 400 });
        }
        throw error;
    }

    // A throw here answers 500, and Mesub sends the event again.
    await receiveEvent(event, deps);
    return new Response(null, { status: 200 });
}
