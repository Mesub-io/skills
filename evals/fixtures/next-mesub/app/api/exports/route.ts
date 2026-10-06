import { withMesub } from '@mesub/node/next';
import { customer, mesub } from '@/lib/mesub';
import { reportsFor } from '@/lib/reports';
import { getSession } from '@/lib/session';

// Paid: subscribers of the Pro plan only. The guard answers 401, 402 and 503 itself.
export const GET = withMesub(
    async () => {
        const session = await getSession();
        if (!session) return Response.json({ error: 'Sign in first.' }, { status: 401 });

        const rows = reportsFor(session).map((report) => `${report.id},${report.title},${report.revenue}`);
        return new Response(['id,title,revenue', ...rows].join('\n'), { headers: { 'Content-Type': 'text/csv' } });
    },
    // 'pro' is the plan's slug, as the dashboard shows it.
    { plan: 'pro', client: mesub, customer },
);
