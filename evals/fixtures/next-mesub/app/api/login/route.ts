// POST /api/login with { "user": "ada" } as JSON, or the same field from the form of /login.
import { NextResponse } from 'next/server';
import { SESSION_COOKIE, sessionValueFor } from '@/lib/session';

export async function POST(request: Request): Promise<Response> {
    const isJson = request.headers.get('content-type')?.includes('application/json') ?? false;
    const user = isJson
        ? (((await request.json()) as { user?: unknown }).user ?? '')
        : ((await request.formData()).get('user') ?? '');

    const value = sessionValueFor(String(user));
    if (!value) return NextResponse.json({ error: 'Unknown user. This fixture knows ada and ben.' }, { status: 400 });

    const response = isJson
        ? NextResponse.json({ user })
        : NextResponse.redirect(new URL('/reports', request.url), 303);
    response.cookies.set(SESSION_COOKIE, value, { httpOnly: true, sameSite: 'lax', path: '/' });
    return response;
}
