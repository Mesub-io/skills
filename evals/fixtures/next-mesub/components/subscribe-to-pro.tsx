'use client';

import { useRouter } from 'next/navigation';
import { SubscribeButton } from '@mesub/react';

export function SubscribeToPro() {
    const router = useRouter();

    // Once subscribed, ask the server again: it is the one that decides what is shown.
    return (
        <SubscribeButton plan="pro" onSubscribed={() => router.refresh()}>
            Subscribe to Pro
        </SubscribeButton>
    );
}
