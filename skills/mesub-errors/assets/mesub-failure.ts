// Server only: sorts whatever a call to Mesub threw into what to do about it.
// Copy next to the code that calls Mesub, then adapt the marked line.
import { MesubError } from '@mesub/node';

export type MesubFailure =
    // Mesub may answer later. `retryAfterMs` is what it asked for, or null. Never "at once".
    | { kind: 'wait'; apiCode: string | null; retryAfterMs: number | null; error: MesubError }
    // Mesub's word on this request: sending it again unchanged changes nothing.
    | { kind: 'refused'; apiCode: string; error: MesubError }
    // The code or the configuration is wrong: a key, a slug, a parameter, the base URL.
    | { kind: 'integration'; error: MesubError }
    // Not a call to Mesub that failed: an abort, a TypeError from an option, a bug.
    | { kind: 'other'; error: unknown };

export function mesubFailure(error: unknown): MesubFailure {
    if (!(error instanceof MesubError)) return { kind: 'other', error };

    // Mesub's own flag when it sent one, the status's otherwise.
    if (error.retryable) {
        return { kind: 'wait', apiCode: error.apiCode, retryAfterMs: error.retryAfter, error };
    }
    // A refused key, a body that is not Mesub's, a malformed call: nothing the customer did.
    // The widget routes of the SDK draw the same line, and throw these.
    if (
        error.code === 'unauthorized' ||
        error.code === 'unexpected' ||
        error.code === 'invalid_webhook' ||
        error.apiCode === null ||
        error.apiCode === 'forbidden' ||
        error.apiCode === 'invalid_request' ||
        error.apiCode === 'plan_not_found'
    ) {
        return { kind: 'integration', error };
    }
    return { kind: 'refused', apiCode: error.apiCode, error };
}

// What a route of yours may answer the browser, in the shape the widget routes use.
// An integration error is thrown instead: a refused key answered as a 401 reads as "signed out".
export function browserAnswer(error: unknown): {
    status: number;
    headers: Record<string, string>;
    body: { error: { code: string; message: string } };
} {
    const failure = mesubFailure(error);
    if (failure.kind === 'other' || failure.kind === 'integration') throw error;

    const { error: mesub } = failure;
    const seconds = mesub.retryAfter === null ? null : Math.ceil(mesub.retryAfter / 1000);

    return {
        // No answer from Mesub is a 502 of yours, not a status Mesub never sent.
        status: mesub.status ?? 502,
        headers: seconds === null ? {} : { 'Retry-After': String(seconds) },
        body: {
            error: {
                code: mesub.apiCode ?? mesub.code,
                // ADAPT: Mesub's own sentence when it sent one. Never the transport's, which may name your base URL.
                message: mesub.apiCode === null ? 'Mesub could not answer this request.' : mesub.message,
            },
        },
    };
}
