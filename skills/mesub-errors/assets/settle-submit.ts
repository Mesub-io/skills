// Server only: a submit that always says what became of the subscription.
// Copy next to the route that receives what the wallet signed.
import { type Mesub, MesubSubmitError, type ServerSubscription, type SubmitParams } from '@mesub/node';

export type Settled =
    // It landed: `subscription.access` is true.
    | { state: 'landed'; subscription: ServerSubscription }
    // Mesub answered and nothing landed. `reason` is a sentence for a person, not a code.
    | { state: 'not-landed'; subscription: ServerSubscription; reason: string | null }
    // No answer said what became of it. The wallet may have paid: never create anew here.
    | { state: 'unknown'; subscription: ServerSubscription | null; retryAfterMs: number | null };

export async function settleSubmit(mesub: Mesub, id: string, signed: SubmitParams): Promise<Settled> {
    try {
        // ADAPT: on a host that cuts a request early, pass { timeout, budget } as a third argument.
        const { subscription, reason } = await mesub.subscriptions.submit(id, signed);

        // Branch on the subscription, never on the words of `reason`.
        if (subscription.access) return { state: 'landed', subscription };
        return { state: 'not-landed', subscription, reason: reason ?? null };
    } catch (error) {
        // A refusal (terms_expired, transaction_expired, ...) is a plain MesubError: left to the caller.
        if (!(error instanceof MesubSubmitError)) throw error;

        return { state: 'unknown', subscription: error.subscription, retryAfterMs: error.retryAfter };
    }
}

// Later, for a subscription left 'unknown': read it, do not submit or create again blind.
export async function readAgain(mesub: Mesub, id: string): Promise<'landed' | 'wait' | 'create-again'> {
    const subscription = await mesub.subscriptions.retrieve(id);

    if (subscription.access) return 'landed';
    // Mesub settles a pending one by itself within the hour.
    if (subscription.status === 'pending') return 'wait';
    // expired or failed: nothing landed, a new create is safe.
    return 'create-again';
}
