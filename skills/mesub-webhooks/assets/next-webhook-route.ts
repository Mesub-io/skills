// Next.js App Router: the route Mesub posts events to.
// Copy to app/webhooks/mesub/route.ts, with handle-event.ts beside it.
// Leave this path out of the app's login in middleware.ts: a redirect counts as a failure.
import { MesubError, verifyWebhook } from '@mesub/node';
import { type EventStore, receiveEvent } from './handle-event';

// ADAPT: the app's own store, see handle-event.ts. Until it is replaced this throws,
// so no event is acknowledged without being recorded.
const store: EventStore = {
    claim: async () => {
        throw new Error('Record the event id in the app\'s database here.');
    },
    release: async () => {},
};

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
    await receiveEvent(event, store);
    return new Response(null, { status: 200 });
}
