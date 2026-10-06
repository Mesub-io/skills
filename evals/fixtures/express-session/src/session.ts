// FIXTURE ONLY: a login with no password, so an eval can sign in with curl.
// The session itself is real: a cookie the server signs and checks on every request.
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';

export interface User {
    id: string;
    name: string;
    email: string;
}

declare global {
    namespace Express {
        interface Request {
            user?: User;
        }
    }
}

const USERS: Record<string, User> = {
    ada: { id: 'user_ada', name: 'Ada', email: 'ada@example.com' },
    ben: { id: 'user_ben', name: 'Ben', email: 'ben@example.com' },
};

const COOKIE = 'session';
// A made-up value for local runs. A real app reads its own from the environment.
const SIGNING = process.env.SESSION_SIGNING ?? 'fixture-only-not-for-production';

const sign = (name: string) => createHmac('sha256', SIGNING).update(name).digest('hex');

function userOf(cookieHeader: string | undefined): User | undefined {
    const value = cookieHeader
        ?.split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${COOKIE}=`))
        ?.slice(COOKIE.length + 1);
    if (!value) return undefined;

    const [name = '', mac = ''] = value.split('.');
    const expected = sign(name);
    if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return undefined;
    return USERS[name];
}

/** Fills `req.user` from the signed cookie. It never rejects: a signed-out request goes on without a user. */
export const session: RequestHandler = (req, _res, next) => {
    req.user = userOf(req.headers.cookie);
    next();
};

/** Answers 401 unless somebody is signed in. */
export const requireUser: RequestHandler = (req, res, next) => {
    if (!req.user) {
        res.status(401).json({ error: 'Sign in first.' });
        return;
    }
    next();
};

/** POST /login with { "user": "ada" } or { "user": "ben" }. */
export function login(req: Request, res: Response): void {
    const name = typeof req.body?.user === 'string' ? req.body.user : '';
    const user = USERS[name];
    if (!user) {
        res.status(400).json({ error: 'Unknown user. This fixture knows ada and ben.' });
        return;
    }
    res.setHeader('Set-Cookie', `${COOKIE}=${name}.${sign(name)}; HttpOnly; SameSite=Lax; Path=/`);
    res.json({ user });
}

export function logout(_req: Request, res: Response): void {
    res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
    res.status(204).end();
}
