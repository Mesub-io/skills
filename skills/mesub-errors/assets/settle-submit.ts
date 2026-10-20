// Server only: a submit that always says what became of the subscription.
// Copy next to the route that receives what the wallet signed.
import { type Mesub, MesubSubmitError, type ServerSubscription, type SubmitParams } from '@mesub/node';

export type Settled =
    // It landed: `subscription.access` is true.
    | { state: 'landed'; subscription: ServerSubscription }
    // The transaction ran out before it landed: nothing was charged. Ask a fresh one under the same id.
    | { state: 'expired'; subscription: ServerSubscription }
    // Mesub answered and nothing landed. Branch on `reasonCode`; `reason` is a sentence to show.
    | { state: 'not-landed'; subscription: ServerSubscription; reasonCode: string | null; reason: string | null }
    // No answer said what became of it. The wallet may have paid: never create anew here.
    | { state: 'unknown'; subscription: ServerSubscription | null; retryAfterMs: number | null };

export async function settleSubmit(mesub: Mesub, id: string, signed: SubmitParams): Promise<Settled> {
    try {
        // ADAPT: on a host that cuts a request early, pass { timeout, budget } as a third argument.
        const result = await mesub.subscriptions.submit(id, signed);
        const { subscription, reason } = result;
        const reasonCode = result.reason_code ?? null;

        // Branch on the subscription and on reason_code, never on the words of `reason`.
        if (subscription.access) return { state: 'landed', subscription };
        if (reasonCode === 'transaction_expired') return { state: 'expired', subscription };
        // nothing_landed: still pending, it may land. Others: read references/reasons.md, keep a default.
        return { state: 'not-landed', subscription, reasonCode, reason: reason ?? null };
    } catch (error) {
        // A refusal (terms_expired, transaction_expired, ...) is a plain MesubError: left to the caller.
        if (!(error instanceof MesubSubmitError)) throw error;

        return { state: 'unknown', subscription: error.subscription, retryAfterMs: error.retryAfter };
    }
}

// Later, for a subscription left 'unknown': read it, do not submit or create again blind.
export async function readAgain(
    mesub: Mesub,
    id: string,
): Promise<'landed' | 'landed-no-access' | 'wait' | 'create-again'> {
    const subscription = await mesub.subscriptions.retrieve(id);

    if (subscription.access) return 'landed';
    // Mesub settles a pending one by itself within the hour.
    if (subscription.status === 'pending') return 'wait';
    // Only these two mean nothing landed: a new create is safe.
    if (subscription.status === 'expired' || subscription.status === 'failed') return 'create-again';
    // It landed and moved on since (unpaid, cancelled, ended...): never create anew, read its status.
    return 'landed-no-access';
}
