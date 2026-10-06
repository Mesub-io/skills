// The routes the widget calls, tested against the fake: who may read what, and
// a whole subscription with no wallet and no chain. Copy, then adapt the marked lines.
// ADAPT: the test framework's own imports.
import { beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import { FakeMesub } from '@mesub/node/testing';
// ADAPT: the app's own factory.
import { createApp } from './create-app';

// The routes read the plan list: without `plans` it is empty and every plan read is a 404.
const fake = new FakeMesub({ plans: ['pro'] });
// Any string: the fake does not check that a wallet is an address.
const WALLET = 'wallet-of-user-42';

let signedIn: string | null;
let app: Express;

beforeEach(() => {
    fake.reset();
    signedIn = 'user_42';
    // A new client per test: the plan list is kept a minute per client.
    app = createApp({
        mesub: fake.client(),
        customer: () => (signedIn ? { external_id: signedIn } : null),
        onEvent: () => undefined,
    });
});

describe('the widget routes', () => {
    it('show a plan to anybody, signed in or not', async () => {
        signedIn = null;

        const response = await request(app).get('/api/mesub/plans/pro').expect(200);

        expect(response.body.slug).toBe('pro');
    });

    it('answer 404 plan_not_found for a slug that is not a plan', async () => {
        const response = await request(app).get('/api/mesub/plans/prp').expect(404);

        expect(response.body.error.code).toBe('plan_not_found');
    });

    it('answer 401 to a signed-out read of subscriptions', async () => {
        signedIn = null;

        const response = await request(app).get('/api/mesub/subscriptions').expect(401);

        expect(response.body.error.code).toBe('unauthenticated');
    });

    it('list only the subscriptions of who is signed in, without their id or email', async () => {
        fake.addSubscription({ wallet: WALLET, plan: 'pro', external_id: 'user_42' });
        fake.addSubscription({ wallet: 'another-wallet', plan: 'pro', external_id: 'user_7' });

        const response = await request(app).get('/api/mesub/subscriptions').expect(200);

        expect(response.body.subscriptions).toHaveLength(1);
        expect(response.body.subscriptions[0]).not.toHaveProperty('external_id');
        expect(response.body.subscriptions[0]).not.toHaveProperty('email');
    });

    it("answer 404 for another customer's subscription, as for one that does not exist", async () => {
        const theirs = fake.addSubscription({
            wallet: 'another-wallet',
            plan: 'pro',
            external_id: 'user_7',
        });

        const response = await request(app)
            .get(`/api/mesub/subscriptions/${theirs.id}`)
            .expect(404);

        expect(response.body.error.code).toBe('subscription_not_found');
    });

    it('refuse a POST whose content type is not JSON, as a form from another site sends', async () => {
        const response = await request(app)
            .post('/api/mesub/subscriptions')
            .set('Content-Type', 'text/plain')
            .send(JSON.stringify({ plan: 'pro', wallet: WALLET }))
            .expect(415);

        expect(response.body.error.code).toBe('unsupported_media_type');
        expect(fake.requests).toHaveLength(0);
    });

    it('subscribe a user, who then passes the paid route', async () => {
        await request(app).get('/api/analytics').expect(402);

        const created = await request(app)
            .post('/api/mesub/subscriptions')
            .send({ plan: 'pro', wallet: WALLET })
            .expect(201);

        // The fake checks no signature: on Mesub the wallet signs both.
        await request(app)
            .post(`/api/mesub/subscriptions/${created.body.subscription.id}/submit`)
            .send({ transaction: created.body.transaction, terms_signature: 'signed-by-the-test' })
            .expect(201);

        await request(app).get('/api/analytics').expect(200);
        // The subscription was tied to the signed-in user, not to what the page sent.
        expect(fake.requests.find((call) => call.method === 'POST')?.body).toMatchObject({
            plan: 'pro',
            wallet: WALLET,
            external_id: 'user_42',
        });
    });

    it('hand an outage on as a 503 the widget can read', async () => {
        fake.fail('outage');

        const response = await request(app).get('/api/mesub/subscriptions').expect(503);

        expect(response.body.error.code).toBe('unavailable');
    });
});
