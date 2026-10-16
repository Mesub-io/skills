// Express: the app as a function of the two things a test must replace.
// Production passes the real client and the real session read. A test passes
// the fake's client and says who is signed in. Nothing else differs.
import express, { type Express, type Request } from 'express';
import { type Mesub, MesubError, type WebhookEvent } from '@mesub/node';
import { type CustomerOption, mesubRoutes, requirePlan } from '@mesub/node/express';

export interface AppDeps {
    // Production: `new Mesub()`. A test: `fake.client()`.
    mesub: Mesub;
    // Production: who the app's verified session names. Never a header a test could set.
    customer: CustomerOption<Request>;
    // ADAPT: what the app does with an event. It runs once per event, again only if it threw.
    onEvent: (event: WebhookEvent) => void | Promise<void>;
}

export function createApp({ mesub, customer, onEvent }: AppDeps): Express {
    const app = express();
    // ADAPT: the app's own store of handled ids. A Set does not survive a restart.
    const handled = new Set<string>();

    // Before any express.json(): the signature is over the bytes received.
    app.post('/webhooks/mesub', express.raw({ type: 'application/json' }), async (req, res, next) => {
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
        if (!handled.has(id)) {
            handled.add(id);
            try {
                await onEvent(event);
            } catch (error) {
                // Forget it, so the retry Mesub sends is handled.
                handled.delete(id);
                return next(error);
            }
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
