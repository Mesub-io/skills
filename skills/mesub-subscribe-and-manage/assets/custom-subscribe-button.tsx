'use client';

// React: a button of the app's own that opens the Mesub subscribe window.
// Place it anywhere under MesubProvider. For the ready-made one, use SubscribeButton.
// Unlike SubscribeButton, it shows no receipt link: the explorer link is not exported. It keeps the
// "Next charge" line; `signature` is there for an app that links a receipt of its own.
import { useSubscribe, type SubscribeState } from '@mesub/react';

// What the button says in each state. `open`: the window is up and nothing is being signed.
const LABELS: Record<SubscribeState, string> = {
    idle: 'Subscribe to Pro', // ADAPT
    open: 'Subscribe to Pro', // ADAPT
    signing: 'Approve in your wallet',
    confirming: 'Confirming',
    subscribed: 'Subscribed',
};

export function BuyPro({ onPaid }: { onPaid?: () => void }) {
    // ADAPT: the plan's slug, as the dashboard shows it.
    const { state, subscription, subscribe } = useSubscribe('pro', {
        // Fires once Mesub confirmed the first payment, even if the window was closed meanwhile.
        // ADAPT: fetch again what the plan unlocks. The server decides, never this callback.
        onSubscribed: () => onPaid?.(),
    });
    // Busy is aria-disabled, not disabled, as in SubscribeButton: the keyboard focus stays on it.
    const busy = state === 'signing' || state === 'confirming';
    const nextCharge = subscription?.next_charge_at ? new Date(subscription.next_charge_at) : null;

    return (
        <>
            {/* ADAPT: the app's own button component, with these props passed through. */}
            <button
                type="button"
                disabled={state === 'subscribed'}
                aria-busy={busy || undefined}
                aria-disabled={busy || undefined}
                // subscribe() resolves when the window closes: the subscription, or null when it did not go through.
                onClick={() => {
                    if (!busy) void subscribe();
                }}
            >
                {LABELS[state]}
            </button>
            {state === 'subscribed' && nextCharge ? <span>Next charge {nextCharge.toLocaleDateString()}</span> : null}
        </>
    );
}
