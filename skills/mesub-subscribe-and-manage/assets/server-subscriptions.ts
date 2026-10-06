// Server only: subscribe, cancel, resume and close without the widget.
// Plain functions to call from the app's own routes, whatever the framework.
// `userId` is always the id of the session the app verified, never a value the page sent.
import {
    Mesub,
    MesubError,
    MesubSubmitError,
    type ServerSubscription,
    type SubmitParams,
} from '@mesub/node';

// ADAPT: if the app already builds a Mesub, import that one. One per process, never one per request.
const mesub = new Mesub();

export type ManageAction = 'cancel' | 'resume' | 'close';

/** Thrown when the id is not a subscription of that user. ADAPT: answer it as a 404. */
export class NotTheirs extends Error {}

// The page never needs the app's own id and email back.
function shown(subscription: ServerSubscription) {
    const { email: _email, external_id: _externalId, ...rest } = subscription;
    return rest;
}

// The API key reaches every subscription of the project: check whose it is before any call by id.
async function theirs(userId: string, id: string): Promise<ServerSubscription> {
    let subscription: ServerSubscription;
    try {
        subscription = await mesub.subscriptions.retrieve(id);
    } catch (error) {
        if (error instanceof MesubError && error.apiCode === 'subscription_not_found') throw new NotTheirs();
        throw error;
    }
    if (subscription.external_id !== userId) throw new NotTheirs();
    return subscription;
}

/** Subscribe, step 1. `wallet` is the address the page's wallet connected: it signs and pays. */
export async function startSubscription(userId: string, wallet: string, email?: string) {
    const { subscription, transaction, terms, costs } = await mesub.subscriptions.create({
        plan: 'pro', // ADAPT: the plan's slug, chosen on the server from a list the app wrote
        wallet,
        external_id: userId, // how hasAccess finds this customer later, whichever wallet pays
        ...(email && { email }),
    });
    // The page shows `terms.message` and `costs`, then has the wallet sign the terms as a
    // message and the transaction WITHOUT sending it, before `terms.expires_at`.
    return { id: subscription.id, transaction, terms, costs };
}

export type Finished =
    | { outcome: 'subscribed'; subscription: ReturnType<typeof shown> }
    // Nothing landed, and Mesub says why: start again from step 1.
    | { outcome: 'not_landed'; reason: string | undefined }
    // No answer on what became of it. The wallet may have paid: poll subscriptionOf, do not start again.
    | { outcome: 'unknown' };

/** Subscribe, step 3. `signed` is the transaction in base64 and the terms signature in base58. */
export async function finishSubscription(userId: string, id: string, signed: SubmitParams): Promise<Finished> {
    await theirs(userId, id);
    try {
        // Waits for the chain: up to 130 s in all by default.
        // ADAPT: on a host that cuts requests sooner, pass { timeout, budget } in ms as a third argument.
        const { subscription, reason } = await mesub.subscriptions.submit(id, signed);
        return subscription.access
            ? { outcome: 'subscribed', subscription: shown(subscription) }
            : { outcome: 'not_landed', reason };
    } catch (error) {
        if (error instanceof MesubSubmitError) return { outcome: 'unknown' };
        throw error; // a refusal such as terms_expired: see refusalOf
    }
}

/** One subscription of that user. After 'unknown': `active` landed, `pending` may still land, `expired` did not. */
export async function subscriptionOf(userId: string, id: string) {
    return shown(await theirs(userId, id));
}

/** That user's subscriptions, newest first: the first page, 20. ADAPT: listAll walks every page. */
export async function subscriptionsOf(userId: string) {
    const { data, has_more } = await mesub.subscriptions.list({ external_id: userId });
    return { subscriptions: data.map(shown), has_more };
}

/** Manage, step 1: a transaction in base64 that the paying wallet signs AND sends itself. Nothing changed yet. */
export async function buildAction(userId: string, id: string, action: ManageAction) {
    await theirs(userId, id);
    return mesub.subscriptions[action](id);
}

const CONFIRM = { cancel: 'confirmCancel', resume: 'confirmResume', close: 'confirmClose' } as const;

/** Manage, step 2: `signature` is what the wallet answered when it sent the transaction, in base58. */
export async function confirmAction(userId: string, id: string, action: ManageAction, signature: string) {
    await theirs(userId, id);
    // Waits for the chain, up to 90 s. Cut short, it changed nothing: call it again with the same signature.
    const { subscription, reason } = await mesub.subscriptions[CONFIRM[action]](id, { signature });
    // No `reason`: it moved. With one, nothing changed: build a new transaction to try again.
    return { changed: reason === undefined, reason, subscription: shown(subscription) };
}

/**
 * What to answer the page for a call Mesub refused, or null when the error is the app's to log.
 * A 401 is Mesub refusing the API key: never hand it on, the page would read it as "sign in".
 */
export function refusalOf(error: unknown): { status: number; code: string; message: string } | null {
    if (error instanceof NotTheirs) return { status: 404, code: 'subscription_not_found', message: 'No such subscription.' };
    if (!(error instanceof MesubError) || error.status === 401) return null;
    // `apiCode` is Mesub's own code (already_subscribed, close_too_early, ...): only then are the words Mesub's.
    const worded = error.apiCode !== null;
    return {
        status: error.status === null || error.status < 400 ? 502 : error.status,
        code: error.apiCode ?? error.code,
        message: worded ? error.message : 'Mesub could not answer this request.',
    };
}
