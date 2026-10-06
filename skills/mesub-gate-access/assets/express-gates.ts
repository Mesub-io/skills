// Express: guards for paid routes, and the same question asked by hand.
// Copy next to the app's routes, then adapt the marked lines.
import type { Request, RequestHandler } from 'express';
import { type Denial, type MesubLocals, requirePlan } from '@mesub/node/express';
// ADAPT: the path of the app's one Mesub client (assets/mesub-client.ts).
import { mesub } from './mesub-client';

// ADAPT: read the user from the session the app's own login verified.
// Never from the query, the body or a header: anyone can type someone else's id.
function customer(req: Request) {
    const user = (req as Request & { user?: { id: string } }).user;
    return user ? { external_id: user.id } : null;
}

// One plan. Answers 401, 402 and 503 with Retry-After itself, as JSON.
// ADAPT: 'pro' is the plan's slug, as the dashboard shows it.
export const requirePro: RequestHandler = requirePlan('pro', { client: mesub, customer });

// Any one of several plans, three at most, written here and never read from the request.
export const requireProOrTeam: RequestHandler = requirePlan(['pro', 'team'], {
    client: mesub,
    customer,
});

// For a route that serves a page: answer each refusal with somewhere to go.
// `onDenied` replaces the whole default answer, the Retry-After header included.
export const requireProPage: RequestHandler = requirePlan('pro', {
    client: mesub,
    customer,
    onDenied: (denial: Denial, _req, res) => {
        if (denial.reason === 'unauthenticated') return res.redirect('/login'); // ADAPT
        if (denial.reason === 'no_access') return res.redirect('/pricing'); // ADAPT
        // Mesub could not answer about someone it never saw: not a "no". Never send them to pricing.
        res.setHeader('Retry-After', '30');
        res.status(denial.status).send('We could not check your subscription. Try again in a moment.');
    },
});

// After a guard, the handler reads who asked and which plan let them through:
//   app.get('/api/reports', yourLogin, requireProOrTeam, (req, res) => res.json(reportsFor(letIn(res).plan)))
export function letIn(res: { locals: Record<string, unknown> }): MesubLocals {
    return res.locals['mesub'] as MesubLocals;
}

// Without a guard, for a route that serves something different to subscribers.
// Awaited, always: a promise left unawaited is truthy and lets everyone in.
// It answers false both for "no" and for "Mesub is down and never saw them".
export async function isPro(req: Request): Promise<boolean> {
    const who = customer(req);
    return who !== null && (await mesub.hasAccess(who, 'pro'));
}
