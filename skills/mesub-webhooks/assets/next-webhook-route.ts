// Next.js App Router: the route Mesub posts events to.
// Copy to app/webhooks/mesub/route.ts, with handle-event.ts beside it.
// Leave this path out of the app's login in middleware.ts: a redirect counts as a failure.
import { MesubError, verifyWebhook } from '@mesub/node';
import { type EventDeps, type EventStore, receiveEvent } from './handle-event';

// ADAPT: the app's own store, see handle-event.ts. Until it is replaced this throws,
// so no event is acknowledged without being recorded.
const store: EventStore = {
    claim: async () => {
        throw new Error('Record the event id and its work in one transaction of the app\'s database here.');
    },
    release: async () => {},
};

// ADAPT, optional: to keep access in the app's own table from subscription.access_granted and
// subscription.access_revoked, write an AccessStore (handle-event.ts) and pass { store, access }.
// Without one, those events are acknowledged and dropped, and the app asks hasAccess on each request.
// Never pass a stub that throws: every access event would fail, Mesub would retry it for three days,
// then disable the endpoint, and every other event would stop with it.
// The work workFor() returns sits in the outbox: the app drains it after the answer (references/delivery.md).
const deps: EventDeps = { store };

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
