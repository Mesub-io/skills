// What to do with an event once its signature is verified: drop a repeat, then react.
// Copy next to the webhook route. It imports nothing but the SDK's types.
import type { WebhookEvent } from '@mesub/node';

// ADAPT: back this with the app's own database. `claim` must be ONE atomic write
// (an insert under a unique key on the id), never a read followed by a write:
// two deliveries of the same event can arrive at the same moment.
export interface EventStore {
    /** True when the id is new and now recorded, false when it was already there. */
    claim(id: string): Promise<boolean>;
    /** Forget an id whose handling failed, so the retry Mesub sends is not dropped. */
    release(id: string): Promise<void>;
}

/** `data.detail` of subscription.renewal_upcoming, as the docs give it. */
export interface RenewalUpcomingDetail {
    can_pay: boolean;
    renewal_issue: 'balance' | 'authority' | null;
    amount: string;
    mint: string;
    due_at: string;
}

// A delivery sent by hand from the dashboard carries `test: true` and the subscription `sub_test`.
function isTest(event: WebhookEvent): boolean {
    return (event as { test?: unknown }).test === true || event.data.id === 'sub_test';
}

// An older copy of the SDK neither names this event nor checks its detail: read by hand, it works with both.
function renewalUpcomingOf(event: WebhookEvent): RenewalUpcomingDetail | null {
    if ((event.type as string) !== 'subscription.renewal_upcoming') return null;

    const detail = event.data.detail as Partial<RenewalUpcomingDetail>;
    return typeof detail.can_pay === 'boolean' ? (detail as RenewalUpcomingDetail) : null;
}

/**
 * Call it with the event `verify` handed back, never with a body read any other way.
 * It throws when the handling failed: answer a 5xx then, and Mesub sends the event again.
 */
export async function receiveEvent(event: WebhookEvent, store: EventStore): Promise<void> {
    if (isTest(event)) return;
    // event.id is the webhook-id header, the same on every retry of this delivery.
    if (!(await store.claim(event.id))) return;

    try {
        await react(event);
    } catch (error) {
        await store.release(event.id);
        throw error;
    }
}

// ADAPT: keep the branches the app needs. Each one must be quick, or hand the work to a
// queue: Mesub waits 10 seconds for the answer. Never grant or revoke access from an
// event alone: ask `hasAccess` (see SKILL.md, "Order").
async function react(event: WebhookEvent): Promise<void> {
    const upcoming = renewalUpcomingOf(event);
    if (upcoming) {
        // A reading of the wallet, not a promise: the charge itself answers later.
        // upcoming.can_pay, upcoming.renewal_issue, upcoming.amount, upcoming.due_at
        return;
    }

    switch (event.type) {
        case 'subscription.created':
            // The first payment landed. event.data is the subscription.
            break;
        case 'subscription.renewed':
            // event.data.detail: amount, mint, period_start, period_end, signature
            break;
        case 'subscription.payment_failed':
            // event.data.detail: reason, retries_left, next_retry_at, retry_mode
            break;
        case 'subscription.stopped':
            // Mesub stopped charging. event.data.detail.reason says why.
            break;
        case 'subscription.cancelled':
            // Access runs until event.data.access_until: do not cut it now.
            break;
        case 'subscription.resumed':
            break;
        case 'subscription.ended':
            // event.data.end_reason says why.
            break;
        case 'subscription.expired':
            break;
        default:
            // A type this code does not know: acknowledge it, never throw on it.
            break;
    }
}
