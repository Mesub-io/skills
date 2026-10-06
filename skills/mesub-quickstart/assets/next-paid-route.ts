// Next.js App Router: one paid route.
// Copy to the route to protect, for example app/api/analytics/route.ts.
// withMesub is for route handlers only: not middleware.ts, not pages, not server components.
import { withMesub } from '@mesub/node/next';

// ADAPT: the same session read as in the widget routes. Share one helper.
async function sessionOf(_request: Request): Promise<{ userId: string } | null> {
    throw new Error('Read the session with the app\'s own auth here.');
}

export const GET = withMesub(
    // Runs only for a subscriber. `mesub.customer` is who asked, `mesub.plan` what let them in.
    async (_request, mesub) => Response.json({ plan: mesub.plan, customer: mesub.customer }),
    {
        // ADAPT: the plan's slug, as the dashboard shows it.
        plan: 'pro',
        customer: async (request) => {
            const session = await sessionOf(request);
            return session ? { external_id: session.userId } : null;
        },
    },
);
