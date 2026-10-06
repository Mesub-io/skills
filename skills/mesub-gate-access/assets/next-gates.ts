// Next.js App Router: paid route handlers.
// Copy to the route to protect, for example app/api/reports/route.ts.
// withMesub is for route handlers only: not middleware.ts, not pages, not server components.
import { type Denial, withMesub } from '@mesub/node/next';
// ADAPT: the path of the app's one Mesub client (assets/mesub-client.ts).
import { mesub } from './mesub-client';

// ADAPT: read the session with the app's own auth, on the server. Share one helper.
// Until it is replaced this throws, so nobody is let in by mistake.
async function sessionOf(_request: Request): Promise<{ userId: string } | null> {
    throw new Error('Read the session with the app\'s own auth here.');
}

async function customer(request: Request) {
    const session = await sessionOf(request);
    return session ? { external_id: session.userId } : null;
}

// Any one of several plans, three at most. `access.plan` is the one that let the request through.
export const GET = withMesub(
    async (_request, access) => Response.json({ plan: access.plan, stale: access.stale }),
    // ADAPT: the plans' slugs, as the dashboard shows them.
    { plan: ['pro', 'team'], client: mesub, customer },
);

// Answer the refusals yourself. `onDenied` must return a Response, and it replaces the
// whole default answer: the 503 keeps its Retry-After only if it is set here.
function denied(denial: Denial): Response {
    if (denial.reason === 'unavailable') {
        return Response.json(
            { error: 'We could not check your subscription. Try again in a moment.' },
            { status: denial.status, headers: { 'Retry-After': '30' } },
        );
    }
    if (denial.reason === 'unauthenticated') {
        return Response.json({ error: 'Sign in first.' }, { status: denial.status });
    }
    // Mesub said no. `denial.answer.status` says where they stand: none, stopped, ended...
    return Response.json(
        { error: 'This needs the Pro plan.', status: denial.answer?.status ?? null, upgrade: '/pricing' },
        { status: denial.status },
    );
}

export const POST = withMesub(async (_request, access) => Response.json({ plan: access.plan }), {
    plan: 'pro',
    client: mesub,
    customer,
    onDenied: denied,
});
