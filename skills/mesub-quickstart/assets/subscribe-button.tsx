'use client';

// React: the button that opens the subscribe window. Place it under the provider.
import { useState } from 'react';
import { SubscribeButton } from '@mesub/react';

export function SubscribeToPro() {
    const [subscribed, setSubscribed] = useState(false);

    // ADAPT: after subscribing, show or reload whatever the plan unlocks.
    if (subscribed) return <p>You are subscribed.</p>;

    return (
        // ADAPT: the plan's slug, as the dashboard shows it.
        <SubscribeButton plan="pro" onSubscribed={() => setSubscribed(true)}>
            Subscribe to Pro
        </SubscribeButton>
    );
}
