// A webhook handler, tested with deliveries signed as Mesub signs them: the
// real verification runs, nothing is stubbed. Copy, then adapt the marked lines.
// ADAPT: the test framework's own imports.
import { beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import type { WebhookEvent } from '@mesub/node';
import { FakeMesub, type SignedWebhook, signWebhook } from '@mesub/node/testing';
// ADAPT: the app's own factory.
import { createApp, type HandledEvents } from './create-app';

const fake = new FakeMesub({ plans: ['pro'] });

let app: Express;
let received: WebhookEvent[];

// In memory for the test only: the app's own store keeps the ids in its database.
function inMemory(): HandledEvents {
    const ids = new Set<string>();
    return {
        claim: async (id) => (ids.has(id) ? false : (ids.add(id), true)),
        release: async (id) => void ids.delete(id),
    };
}

beforeEach(() => {
    fake.reset();
    received = [];
    // fake.client() verifies with fake.webhookSecret, the one fake.webhook() signs with.
    app = createApp({
        mesub: fake.client(),
        customer: () => ({ external_id: 'user_42' }),
        webhooks: {
            // ADAPT: assert on what the app really does with an event (a row, a mail queued).
            onEvent: (event) => void received.push(event),
            // ADAPT: or the app's own store, on a test database.
            handled: inMemory(),
        },
    });
});

// The body goes out as the exact string that was signed: never an object.
const deliver = ({ body, headers }: SignedWebhook) =>
    request(app).post('/webhooks/mesub').set(headers).type('json').send(body);

describe('POST /webhooks/mesub', () => {
    it('handles a delivery Mesub signed', async () => {
        const delivery = await fake.webhook('subscription.renewed', {
            subscription: { external_id: 'user_42' },
        });

        await deliver(delivery).expect(200);

        expect(received).toHaveLength(1);
        expect(received[0]).toMatchObject({
            type: 'subscription.renewed',
            data: { external_id: 'user_42', plan: 'pro' },
        });
        const event = received[0];
        expect(event?.type === 'subscription.renewed' ? event.detail.amount : null).toBe('9990000');
    });

    it('answers 400 to a body changed after it was signed', async () => {
        const { body, headers } = await fake.webhook('subscription.renewed');

        await deliver({ body: body.replace('9990000', '1'), headers }).expect(400);

        expect(received).toHaveLength(0);
    });

    it("answers 400 to a delivery signed with another endpoint's secret", async () => {
        const { body } = await fake.webhook('subscription.renewed');
        // Made up here: whsec_ then base64. Never a real endpoint's secret in a test.
        const other = `whsec_${Buffer.from('another-endpoint-of-the-test').toString('base64')}`;

        await deliver(await signWebhook(body, { secret: other })).expect(400);

        expect(received).toHaveLength(0);
    });

    it('answers 400 to a delivery replayed ten minutes later', async () => {
        const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600;

        await deliver(await fake.webhook('subscription.renewed', { timestamp: tenMinutesAgo })).expect(400);

        expect(received).toHaveLength(0);
    });

    it('handles a delivery once when Mesub sends it again', async () => {
        const delivery = await fake.webhook('subscription.stopped', { id: 'evt_retried' });

        await deliver(delivery).expect(200);
        await deliver(delivery).expect(200);

        expect(received).toHaveLength(1);
        expect(received[0]?.id).toBe('evt_retried');
    });

    it('puts a stopped subscriber out as soon as the event lands', async () => {
        // Cached a minute, as a real answer is: without the event the yes would stay.
        fake.grant({ external_id: 'user_42' }, 'pro', { revalidate_after: 60 });
        await request(app).get('/api/analytics').expect(200);

        // A webhook adds nothing to the fake: say what Mesub now answers, then send the event.
        fake.deny({ external_id: 'user_42' }, 'pro', { status: 'stopped' });
        await request(app).get('/api/analytics').expect(200);
        await deliver(
            await fake.webhook('subscription.stopped', {
                subscription: { external_id: 'user_42', status: 'stopped', access: false },
            }),
        ).expect(200);

        await request(app).get('/api/analytics').expect(402);
    });
});
