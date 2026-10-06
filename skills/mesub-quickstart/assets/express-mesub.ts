// Express: the routes the widget calls, and a guard for paid routes.
// Copy next to the app's routes, then adapt the two marked lines.
import type { Express, Request, RequestHandler } from 'express';
import { mesubRoutes, requirePlan } from '@mesub/node/express';

// ADAPT: read the user from the session the app's own login verified.
// Never from the query, the body or a header: anyone can type someone else's id.
function customer(req: Request) {
    const user = (req as Request & { user?: { id: string } }).user;
    return user ? { external_id: user.id } : null;
}

// Call once, after the app's session middleware. No body parser is needed: the routes read their own.
// `yourLogin` is the middleware that fills the session; signed-out requests answer 401 here.
export function mountMesub(app: Express, yourLogin: RequestHandler): void {
    app.use('/api/mesub', yourLogin, mesubRoutes({ customer }));
}

// ADAPT: 'pro' is the plan's slug, as the dashboard shows it.
// Use as: app.get('/api/analytics', yourLogin, requirePro, handler)
// It answers 401, 402 and 503 itself; the handler runs only for a subscriber.
export const requirePro: RequestHandler = requirePlan('pro', { customer });
