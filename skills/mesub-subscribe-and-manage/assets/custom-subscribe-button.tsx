'use client';

// React: a button of the app's own that opens the Mesub subscribe window.
// Place it anywhere under MesubProvider. For the ready-made one, use SubscribeButton.
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
    const { state, subscribe } = useSubscribe('pro', {
        // Fires once Mesub confirmed the first payment, even if the window was closed meanwhile.
        // ADAPT: fetch again what the plan unlocks. The server decides, never this callback.
        onSubscribed: () => onPaid?.(),
    });

    return (
        <button
            type="button"
            disabled={state !== 'idle'}
            // subscribe() resolves when the window closes: the subscription, or null when it did not go through.
            onClick={() => void subscribe()}
        >
            {LABELS[state]}
        </button>
    );
}
