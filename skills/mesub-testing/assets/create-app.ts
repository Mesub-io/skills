// Express: the app as a function of the two things a test must replace.
// Production passes the real client and the real session read. A test passes
// the fake's client and says who is signed in. Nothing else differs.
import express, { type Express, type Request } from 'express';
import { type Mesub, MesubError, type WebhookEvent } from '@mesub/node';
import { type CustomerOption, mesubRoutes, requirePlan } from '@mesub/node/express';

// The ids of the events already handled. Production: a table of the app's database, with the id
// under a unique key. Never memory: ids kept in memory are lost on a restart and not shared between
// instances, so a retry after either is handled twice. Only a test hands in memory.
export interface HandledEvents {
    /** One atomic insert: true when the id is new and now recorded, false on a repeat. */
    claim(id: string): Promise<boolean>;
    /** Forget an id whose handling failed, so the retry Mesub sends is handled. */
    release(id: string): Promise<void>;
}

export interface AppDeps {
    // Production: `new Mesub()`. A test: `fake.client()`.
    mesub: Mesub;
    // Production: who the app's verified session names. Never a header a test could set.
    customer: CustomerOption<Request>;
    // Optional: only for an app that receives Mesub's events. Left out, so is the webhook route.
    webhooks?: {
        // ADAPT: what the app does with an event. It runs once per event, again only if it threw.
        onEvent: (event: WebhookEvent) => void | Promise<void>;
        // ADAPT: the app's own durable store (above).
        handled: HandledEvents;
    };
}

export function createApp({ mesub, customer, webhooks }: AppDeps): Express {
    const app = express();

    // Optional, with webhooks: an app with no webhook handler deletes this route.
    // Before any express.json(): the signature is over the bytes received.
    if (webhooks) app.post('/webhooks/mesub', express.raw({ type: 'application/json' }), async (req, res, next) => {
        let event: WebhookEvent;
        try {
            // The client's own verify: it also drops what this client cached for that customer.
            event = await mesub.webhooks.verify(req.body, req.headers);
        } catch (error) {
            // Not Mesub's delivery. Any other error is the app's fault: a 5xx, and Mesub retries.
            if (error instanceof MesubError && error.code === 'invalid_webhook') {
                return void res.status(400).end();
            }
            return next(error);
        }

        // The event's id; null on a body older than the event shape, then the delivery's.
        const id = event.id ?? event.delivery_id;
        try {
            if (await webhooks.handled.claim(id)) {
                try {
                    await webhooks.onEvent(event);
                } catch (error) {
                    // Forget it, so the retry Mesub sends is handled.
                    await webhooks.handled.release(id);
                    throw error;
                }
            }
        } catch (error) {
            return next(error);
        }
        res.status(200).end();
    });

    // ADAPT: the app's login middleware goes before these two lines.
    app.use('/api/mesub', mesubRoutes({ client: mesub, customer }));

    // ADAPT: 'pro' is the plan's slug.
    app.get('/api/analytics', requirePlan('pro', { client: mesub, customer }), (_req, res) => {
        res.json({ ok: true });
    });

    return app;
}
