'use client';

// React: a list of the customer's subscriptions drawn by the app itself.
// useSubscriptions gives the data and opens the Mesub window for the action; the
// wallet part stays the widget's. Place it under MesubProvider.
import { useSubscriptions, type MesubHeldSubscription } from '@mesub/react';

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

export function MySubscriptions() {
    const { state, subscriptions, error, reload, manage } = useSubscriptions();

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
                </li>
            ))}
        </ul>
    );
}
