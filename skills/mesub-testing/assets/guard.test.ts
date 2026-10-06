// A paid route, tested end to end against the fake: the real guard, the real
// client, no network. Copy next to the app's tests, then adapt the marked lines.
// ADAPT: the test framework's own imports (these names are the same in most).
import { beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import { FakeMesub } from '@mesub/node/testing';
// ADAPT: the app's own factory. It must take the client and who is signed in.
import { createApp } from './create-app';

// Naming the plans makes any other slug answer plan_not_found, as a typo would.
const fake = new FakeMesub({ plans: ['pro'] });

let signedIn: string | null;
let app: Express;

beforeEach(() => {
    fake.reset();
    signedIn = 'user_42';
    // A new client per test: a client keeps its own cache, which reset() does not empty.
    app = createApp({
        mesub: fake.client(),
        customer: () => (signedIn ? { external_id: signedIn } : null),
        onEvent: () => undefined,
    });
});

describe('GET /api/analytics', () => {
    it('lets a subscriber through', async () => {
        fake.grant({ external_id: 'user_42' }, 'pro');

        await request(app).get('/api/analytics').expect(200, { ok: true });
    });

    it('asks Mesub about the signed-in user, under the name the app gives them', async () => {
        await request(app).get('/api/analytics');

        expect(fake.requests.at(-1)).toMatchObject({
            path: '/v1/access',
            query: { external_id: 'user_42', plan: 'pro' },
        });
    });

    it('answers 402 to a signed-in user who has not paid', async () => {
        const response = await request(app).get('/api/analytics').expect(402);

        expect(response.body).toEqual({ access: false, reason: 'no_access', status: 'none' });
    });

    it('answers 402 to a subscriber Mesub stopped charging', async () => {
        fake.deny({ external_id: 'user_42' }, 'pro', { status: 'stopped' });

        const response = await request(app).get('/api/analytics').expect(402);

        expect(response.body.status).toBe('stopped');
    });

    it('answers 401 when nobody is signed in, without asking Mesub', async () => {
        signedIn = null;

        const response = await request(app).get('/api/analytics').expect(401);

        expect(response.body.reason).toBe('unauthenticated');
        expect(fake.requests).toHaveLength(0);
    });

    it('answers 503, not 402, when Mesub is down and the user was never seen', async () => {
        fake.fail('outage');

        const response = await request(app).get('/api/analytics').expect(503);

        expect(response.headers['retry-after']).toBe('30');
        expect(response.body.reason).toBe('unavailable');
    });

    it('keeps a subscriber in when Mesub goes down after answering once', async () => {
        fake.grant({ external_id: 'user_42' }, 'pro');
        await request(app).get('/api/analytics').expect(200);

        fake.fail('outage');

        await request(app).get('/api/analytics').expect(200);
    });

    it('never answers 402 or 200 when Mesub refuses the API key', async () => {
        fake.fail({ status: 401, code: 'invalid_api_key' });

        const response = await request(app).get('/api/analytics');

        // The guard hands the error to Express, which answers with the status the
        // error carries (401 here) unless the app's own error handler says 500.
        expect([401, 500]).toContain(response.status);
        expect(response.body.reason).toBeUndefined();
    });
});
