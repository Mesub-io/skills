// Next.js App Router: a paid route and the widget routes, tested by calling the
// handlers with a Request. No server, no network. Copy, then adapt the marked lines.
// ADAPT: the test framework's own imports.
import { beforeEach, describe, expect, it } from 'vitest';
import type { Mesub } from '@mesub/node';
import { type CustomerOption, mesubRouteHandlers, withMesub } from '@mesub/node/next';
import { FakeMesub } from '@mesub/node/testing';

interface RouteDeps {
    mesub: Mesub;
    customer: CustomerOption<Request>;
}

// ADAPT: these two builders belong in a module of the app (not in a route.ts,
// which may only export handlers). Each route.ts calls one with the real
// client and the real session read; this test calls it with the fake's.
const paidRoute = ({ mesub, customer }: RouteDeps) =>
    withMesub(async (_request, access) => Response.json({ plan: access.plan }), {
        plan: 'pro',
        client: mesub,
        customer,
    });
const widgetRoutes = ({ mesub, customer }: RouteDeps) =>
    mesubRouteHandlers({ client: mesub, customer });

const fake = new FakeMesub({ plans: ['pro'] });

let signedIn: string | null;
let deps: RouteDeps;

beforeEach(() => {
    fake.reset();
    signedIn = 'user_42';
    // A new client per test: a client keeps its own cache, which reset() does not empty.
    deps = {
        mesub: fake.client(),
        customer: () => (signedIn ? { external_id: signedIn } : null),
    };
});

const get = (path: string) => new Request(`https://app.test${path}`);

describe('GET /api/analytics', () => {
    it('lets a subscriber through', async () => {
        fake.grant({ external_id: 'user_42' }, 'pro');

        const response = await paidRoute(deps)(get('/api/analytics'), {});

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ plan: 'pro' });
    });

    it('answers 402 to a signed-in user who has not paid', async () => {
        const response = await paidRoute(deps)(get('/api/analytics'), {});

        expect(response.status).toBe(402);
        expect(await response.json()).toMatchObject({ access: false, reason: 'no_access' });
    });

    it('answers 401 when nobody is signed in', async () => {
        signedIn = null;

        const response = await paidRoute(deps)(get('/api/analytics'), {});

        expect(response.status).toBe(401);
    });

    it('answers 503 with Retry-After when Mesub is down and the user was never seen', async () => {
        fake.fail('outage');

        const response = await paidRoute(deps)(get('/api/analytics'), {});

        expect(response.status).toBe(503);
        expect(response.headers.get('retry-after')).toBe('30');
    });

    it('throws, for Next to answer 500, when Mesub refuses the API key', async () => {
        fake.fail({ status: 401, code: 'invalid_api_key' });

        await expect(paidRoute(deps)(get('/api/analytics'), {})).rejects.toMatchObject({
            code: 'unauthorized',
        });
    });
});

describe('the widget routes', () => {
    // The catch-all segment, as Next hands it: a promise since Next 15.
    const at = (...segments: string[]) => ({ params: Promise.resolve({ mesub: segments }) });

    it('show a plan to anybody', async () => {
        signedIn = null;

        const response = await widgetRoutes(deps).GET(get('/api/mesub/plans/pro'), at('plans', 'pro'));

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ slug: 'pro' });
    });

    it('answer 401 to a signed-out read of subscriptions', async () => {
        signedIn = null;

        const response = await widgetRoutes(deps).GET(
            get('/api/mesub/subscriptions'),
            at('subscriptions'),
        );

        expect(response.status).toBe(401);
        expect(await response.json()).toMatchObject({ error: { code: 'unauthenticated' } });
    });
});
