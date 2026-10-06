// The login of the fixture, tested on its own: no Mesub here.
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { login, requireUser, session } from '../src/session.js';

function sessionApp() {
    const app = express();
    app.use(express.json());
    app.use(session);
    app.post('/login', login);
    app.get('/me', requireUser, (req, res) => {
        res.json({ user: req.user });
    });
    return app;
}

/** The session cookie of a signed-in user, for the requests of a test. */
async function cookieOf(user: 'ada' | 'ben'): Promise<string> {
    const response = await request(sessionApp()).post('/login').send({ user }).expect(200);
    return String(response.headers['set-cookie']).split(';')[0]!;
}

describe('the session', () => {
    it('answers 401 to a request with no cookie', async () => {
        await request(sessionApp()).get('/me').expect(401);
    });

    it('names the user whose cookie it signed', async () => {
        const response = await request(sessionApp()).get('/me').set('Cookie', await cookieOf('ada')).expect(200);

        expect(response.body.user.id).toBe('user_ada');
    });

    it('answers 401 to a cookie it did not sign', async () => {
        await request(sessionApp()).get('/me').set('Cookie', 'session=ada.0000').expect(401);
    });
});
