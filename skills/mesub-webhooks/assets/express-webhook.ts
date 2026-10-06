// Express: the route Mesub posts events to.
// Copy next to the app's routes, with handle-event.ts beside it.
import express, { type Express } from 'express';
import { Mesub, MesubError } from '@mesub/node';
import { type EventStore, receiveEvent } from './handle-event';

// ADAPT: reuse the app's one Mesub client if it already builds one.
// It reads MESUB_API_KEY and MESUB_WEBHOOK_SECRET from the server's environment.
const mesub = new Mesub();

// Call it BEFORE any app.use(express.json()) and before the app's login or CSRF
// middleware: the route needs the bytes as sent, and Mesub has no session.
// ADAPT: the path is the one registered in the dashboard.
export function mountMesubWebhook(app: Express, store: EventStore): void {
    app.post('/webhooks/mesub', express.raw({ type: 'application/json' }), async (req, res, next) => {
        let event;
        try {
            // req.body is a Buffer here. An object means a JSON parser ran first.
            event = await mesub.webhooks.verify(req.body, req.headers);
        } catch (error) {
            // Not Mesub's, or replayed: refuse it. Anything else is a fault of this server.
            if (error instanceof MesubError && error.code === 'invalid_webhook') {
                res.status(400).end();
                return;
            }
            // next(error), not throw: Express 4 does not catch a rejected handler.
            next(error);
            return;
        }

        try {
            await receiveEvent(event, store);
        } catch {
            // ADAPT: report the error to the app's own logger, without the body or the headers.
            res.status(500).end();
            return;
        }
        res.status(200).end();
    });
}
