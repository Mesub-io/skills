// Reads one attempt of `mesub.subscriptions.attempts(id)`: whose doing it is, and what follows.
// Imports types only, so it may run on the server or in a page.
import type { SubscriptionAttempt } from '@mesub/node';

export type AttemptReading = {
    // Who can change the outcome. 'nobody' is a paid attempt or one that is no failure.
    whose: 'customer' | 'merchant' | 'mesub' | 'nobody' | 'unknown';
    // Only a rejected attempt turns a subscription unpaid or spends a retry.
    spendsRetry: boolean;
    // Mesub comes back to a blocked attempt by itself; nothing to do but watch.
    mesubTriesAgain: boolean;
};

// The program's error numbers that are not the customer's doing.
const PLAN_CHANGED = new Set(['130', '501', '506', '516', '519']);

// Snake case, the spelling Mesub serves. Each word Mesub is renaming is listed under both names.
const CUSTOMER = new Set([
    'insufficient_balance',
    'token_account_reassigned',
    'subscription_cancelled',
    'cancelled',
    'delegation_gone',
    'closed_elsewhere',
]);
const MERCHANT = new Set([
    'plan_gone',
    'plan_removed',
    'plan_replaced',
    'plan_ended',
    'receiver_not_allowed',
    'receiver_account_missing',
    'puller_not_allowed',
]);

// An older Mesub hyphenates (`insufficient-balance`, `program:4`): read it the same.
const snake = (reason: string) => reason.replace(/[-:]/g, '_');

export function readAttempt(attempt: SubscriptionAttempt): AttemptReading {
    const { outcome } = attempt;
    const outcomes: string = outcome;
    const reason = attempt.reason === null ? null : snake(attempt.reason);
    const reading = (whose: AttemptReading['whose']): AttemptReading => ({
        whose,
        spendsRetry: outcomes === 'rejected',
        mesubTriesAgain: outcomes === 'blocked' && reason !== 'terms_missing',
    });

    if (outcome === 'paid' || reason === 'period_already_paid') return reading('nobody');
    if (reason === null) return reading('unknown');
    if (CUSTOMER.has(reason)) return reading('customer');
    if (MERCHANT.has(reason)) return reading('merchant');

    if (reason.startsWith('program_')) {
        const code = reason.slice('program_'.length);
        if (PLAN_CHANGED.has(code)) return reading('merchant');
        // 400: the program's clock is behind. Every other number is the customer's wallet.
        return reading(code === '400' ? 'mesub' : 'customer');
    }

    // The list grows: an outcome or a reason newer than this file is not guessed at.
    if (outcomes === 'rejected') return reading('customer');
    if (outcomes === 'blocked' || outcomes === 'skipped') return reading('mesub');
    return reading('unknown');
}
