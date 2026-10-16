'use client';

// React: a list of the customer's subscriptions drawn by the app itself.
// useSubscriptions gives the data and opens the Mesub window for the action; the
// wallet part stays the widget's. Place it under MesubProvider.
import { useEffect, useState } from 'react';
import { useSubscriptions, type MesubHeldSubscription, type PayNowResult } from '@mesub/react';

// ADAPT: the app's own wording. Keep the default: a newer status may appear.
function statusLabel(held: MesubHeldSubscription): string {
    switch (held.status) {
        case 'active':
            return 'Active';
        case 'unpaid':
            return 'Payment late';
        case 'cancelled':
            return 'Cancelled, access still running';
        case 'stopped':
            return 'Stopped after missed payments';
        case 'ended':
            return 'Ended';
        default:
            return held.status;
    }
}

const ACTION_LABELS = { cancel: 'Cancel', resume: 'Resume', close: 'Close and get the deposit back' };

// Pay a late payment now: nothing to sign. payNow never throws, a refusal is its `message`.
function PayNowButton({ pay }: { pay: () => Promise<PayNowResult> }) {
    const [busy, setBusy] = useState(false);
    const [said, setSaid] = useState<PayNowResult | null>(null);
    // Mesub was busy: the seconds before pressing again can work.
    const [wait, setWait] = useState(0);

    useEffect(() => {
        if (wait <= 0) return;
        const timer = setTimeout(() => setWait(wait - 1), 1000);
        return () => clearTimeout(timer);
    }, [wait]);

    async function click() {
        setBusy(true);
        try {
            const result = await pay();
            setSaid(result);
            setWait(result.retryAfter ?? 0);
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            <button type="button" disabled={busy || wait > 0} onClick={() => void click()}>
                {wait > 0 ? `Pay again in ${wait} s` : 'Pay now'}
            </button>
            {/* ok means sent, not paid: the list reads again, the outcome comes with the charge. */}
            {said ? <span role={said.ok ? 'status' : 'alert'}>{said.message}</span> : null}
        </>
    );
}

export function MySubscriptions() {
    const { state, subscriptions, error, reload, payNow, manage } = useSubscriptions();

    if (state === 'loading') return <p>Loading your subscriptions</p>;
    // The app's routes answered 401: nobody is signed in on the site.
    if (state === 'signed-out') return <a href="/login">Sign in</a>; // ADAPT: the app's login page
    if (state === 'error') {
        return (
            <p role="alert">
                {error} <button onClick={() => void reload()}>Try again</button>
            </p>
        );
    }
    if (subscriptions.length === 0) return <p>You have no subscription yet.</p>;

    return (
        <ul>
            {subscriptions.map((held) => (
                <li key={held.id}>
                    {/* `plan` is the slug. Dates are ISO strings, null when they do not apply. */}
                    <strong>{held.plan ?? 'Subscription'}</strong>: {statusLabel(held)}
                    {/* No charge ahead: cancelled, or in the last period of a plan that ends. */}
                    {held.access_until && (held.status === 'cancelled' || (held.status === 'active' && !held.next_charge_at))
                        ? `, access until ${new Date(held.access_until).toLocaleDateString()}`
                        : null}
                    {/* `action` is the one thing it allows now, or null. The list reads again by itself after. */}
                    {held.action ? (
                        <button type="button" onClick={() => void manage(held.id)}>
                            {ACTION_LABELS[held.action]}
                        </button>
                    ) : null}
                    {/* A late payment paying now can settle; Mesub refuses the rest anyway. */}
                    {held.payable ? <PayNowButton pay={() => payNow(held.id)} /> : null}
                </li>
            ))}
        </ul>
    );
}
