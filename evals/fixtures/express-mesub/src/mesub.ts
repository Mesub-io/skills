// The one Mesub client of the server, who is asking, and the guard of the paid routes.
import type { Request, RequestHandler } from 'express';
import { Mesub } from '@mesub/node';
import { mesubRoutes, requirePlan } from '@mesub/node/express';

// Reads MESUB_API_KEY from the server's environment. Built once, at module level.
export const mesub = new Mesub();

// Who is asking: the user of the session cookie the app signed (src/session.ts).
export function customer(req: Request) {
    return req.user ? { external_id: req.user.id } : null;
}

// The routes the widget calls. Mounted at /api/mesub, after the session middleware.
export const widgetRoutes = mesubRoutes({ client: mesub, customer });

// 'pro' is the plan's slug, as the dashboard shows it.
export const requirePro: RequestHandler = requirePlan('pro', { client: mesub, customer });
