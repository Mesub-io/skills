// Next.js App Router: a paid page, as a server component. There is no guard for pages:
// ask hasAccess and decide what to render. Never do this in a client component.
// ADAPT: the path of the app's one Mesub client (assets/mesub-client.ts).
import { mesub } from './mesub-client';

// ADAPT: read the session with the app's own auth, on the server.
// Until it is replaced this throws, so nobody is let in by mistake.
async function sessionOf(): Promise<{ userId: string } | null> {
    throw new Error('Read the session with the app\'s own auth here.');
}

export default async function ReportsPage() {
    const session = await sessionOf();
    // ADAPT: or redirect to the app's login page.
    if (!session) return <p>Sign in to see your reports.</p>;

    // ADAPT: the plan's slug. A wrong slug or a refused key throws here, on purpose: do not catch it.
    const paid = await mesub.hasAccess({ external_id: session.userId }, 'pro');

    // false is "Mesub said no" or "Mesub is down and never saw them": word it for both.
    // ADAPT: the app's own upsell, with the subscribe button.
    if (!paid) return <p>Reports need the Pro plan. Already subscribed? Reload in a moment.</p>;

    // Load what is paid only below this line, so it never leaves the server unchecked.
    return <p>Your reports.</p>;
}
