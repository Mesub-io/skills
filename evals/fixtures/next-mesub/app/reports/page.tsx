import { redirect } from 'next/navigation';
import { reportsFor } from '@/lib/reports';
import { getSession } from '@/lib/session';

// The page to protect: today anyone who is signed in sees the reports.
export default async function ReportsPage() {
    const session = await getSession();
    if (!session) redirect('/login');

    return (
        <main>
            <h1>Reports</h1>
            <p>Signed in as {session.name}.</p>
            <ul>
                {reportsFor(session).map((report) => (
                    <li key={report.id}>
                        {report.title}: {report.revenue}
                    </li>
                ))}
            </ul>
        </main>
    );
}
