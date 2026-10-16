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

// ADAPT: back this with the app's own table, one row per subscription (event.data.id).
// `apply` must be ONE conditional write: set `granted` and `sequence` only where the stored
// sequence is lower (UPDATE ... WHERE last_sequence < $sequence, or an insert when no row).
export interface AccessStore {
    /** Record the access an access event set, unless a higher sequence was already applied. */
    apply(subscriptionId: string, sequence: number, granted: boolean, changedAt: string): Promise<void>;
    /** An event without `sequence` cannot be placed: read the state now (mesub.subscriptions.retrieve) and record it. */
    refresh(subscriptionId: string): Promise<void>;
}

/** `detail` of subscription.renewal_upcoming, as the docs give it. */
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

// The event's own fields: at the top of the body since api_version 2026-10-02, under `data` in a
// body written before `available_since` and in an older package's types. Read by hand, it works with both.
function detailOf(event: WebhookEvent): Record<string, unknown> {
    const detail = (event as { detail?: unknown }).detail ?? (event.data as { detail?: unknown }).detail;
    return typeof detail === 'object' && detail !== null ? (detail as Record<string, unknown>) : {};
}

// An older copy of the SDK neither names this event nor checks its detail: read by hand, it works with both.
function renewalUpcomingOf(event: WebhookEvent): RenewalUpcomingDetail | null {
    if ((event.type as string) !== 'subscription.renewal_upcoming') return null;

    const detail = detailOf(event) as Partial<RenewalUpcomingDetail>;
    return typeof detail.can_pay === 'boolean' ? (detail as RenewalUpcomingDetail) : null;
}

// Its place among the subscription's events, or null on a body Mesub did not number.
// Read by hand: an older copy of the SDK does not type it.
function sequenceOf(event: WebhookEvent): number | null {
    const sequence = (event as { sequence?: unknown }).sequence;
    return typeof sequence === 'number' && Number.isInteger(sequence) && sequence >= 1 ? sequence : null;
}

// subscription.access_granted and subscription.access_revoked: the only events that say whether the
// customer has access. Not sent until Mesub turns them on; an older SDK does not name them, so compare strings.
async function applyAccess(event: WebhookEvent, access: AccessStore): Promise<boolean> {
    const type = event.type as string;
    if (type !== 'subscription.access_granted' && type !== 'subscription.access_revoked') return false;

    const sequence = sequenceOf(event);
    if (sequence === null) {
        await access.refresh(event.data.id);
        return true;
    }
    const changedAt = detailOf(event).changed_at;
    await access.apply(
        event.data.id,
        sequence,
        type === 'subscription.access_granted',
        typeof changedAt === 'string' ? changedAt : event.created_at,
    );
    return true;
}

/**
 * Call it with the event `verify` handed back, never with a body read any other way.
 * It throws when the handling failed: answer a 5xx then, and Mesub sends the event again.
 */
export async function receiveEvent(event: WebhookEvent, store: EventStore, access: AccessStore): Promise<void> {
    if (isTest(event)) return;
    // The same on every retry. The event's id with a package written for the 2026-10-02 body (also
    // what GET /v1/events serves); the webhook-id header with an older one. See references/delivery.md.
    if (!(await store.claim(event.id))) return;

    try {
        if (!(await applyAccess(event, access))) await react(event);
    } catch (error) {
        await store.release(event.id);
        throw error;
    }
}

// ADAPT: keep the branches the app needs. Each one must be quick, or hand the work to a
// queue: Mesub waits 10 seconds for the answer. Never grant or revoke access here: only the two
// access events above do, and until Mesub sends them, ask `hasAccess` (references/delivery.md, "Order").
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
            // detailOf(event): amount, mint, period_start, period_end, signature
            break;
        case 'subscription.payment_failed':
            // detailOf(event): reason, retries_left, next_retry_at, retry_mode
            break;
        case 'subscription.stopped':
            // Mesub stopped charging. Branch on event.data.stop_reason, not on detailOf(event).reason:
            // 'authority_closed' cannot come back and can be closed now (event.data.closable);
            // 'out_of_retries' and 'retry_deadline_passed' can subscribe again. Keep a default.
            break;
        case 'subscription.cancelled':
            // Access runs until event.data.access_until: do not cut it now.
            break;
        case 'subscription.resumed':
            break;
        case 'subscription.ended':
            // event.data.end_reason says why: 'cancelled', 'closed', 'closed_elsewhere', 'plan_ended', ...
            break;
        case 'subscription.expired':
            break;
        default:
            // A type this code does not know: acknowledge it, never throw on it.
            break;
    }
}
