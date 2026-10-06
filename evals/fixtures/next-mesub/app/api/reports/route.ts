import { reportsFor } from '@/lib/reports';
import { getSession } from '@/lib/session';

// The route to protect: today anyone who is signed in reads the reports.
export async function GET(): Promise<Response> {
    const session = await getSession();
    if (!session) return Response.json({ error: 'Sign in first.' }, { status: 401 });

    return Response.json({ reports: reportsFor(session) });
}
