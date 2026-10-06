// FIXTURE ONLY: a login with no password, so an eval can sign in with curl or one click.
// The session itself is real: a cookie the server signs and checks on every request.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

export interface Session {
    userId: string;
    name: string;
    email: string;
}

const USERS: Record<string, Session> = {
    ada: { userId: 'user_ada', name: 'Ada', email: 'ada@example.com' },
    ben: { userId: 'user_ben', name: 'Ben', email: 'ben@example.com' },
};

export const SESSION_COOKIE = 'session';
// A made-up value for local runs. A real app reads its own from the environment.
const SIGNING = process.env.SESSION_SIGNING ?? 'fixture-only-not-for-production';

const sign = (name: string) => createHmac('sha256', SIGNING).update(name).digest('hex');

/** The cookie value for a user this fixture knows (ada or ben), or null. */
export function sessionValueFor(name: string): string | null {
    return USERS[name] ? `${name}.${sign(name)}` : null;
}

/** Who is signed in, read from the signed cookie on the server. Null when nobody is. */
export async function getSession(): Promise<Session | null> {
    const value = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!value) return null;

    const [name = '', mac = ''] = value.split('.');
    const expected = sign(name);
    if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
    return USERS[name] ?? null;
}
