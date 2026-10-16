// The app's last word on a Mesub call that failed: log what support needs, answer the browser plainly.
// Copy beside mesub-failure.ts. Express: mount `mesubErrors` after every route. Next.js:
// `catch (error) { return mesubErrorResponse(error); }` in a route handler.
// A refused key or an unknown slug is a 500 here, as from a guard: never a 401, never "not subscribed".
import type { ErrorRequestHandler } from 'express';
import { MesubError } from '@mesub/node';
import { browserAnswer, mesubFailure, mesubRequestId } from './mesub-failure';

type Answer = { status: number; headers: Record<string, string>; body: { error: { code: string; message: string } } };

const BROKEN: Answer = {
    status: 500,
    headers: {},
    body: { error: { code: 'internal_error', message: 'Something went wrong on our side.' } },
};

/** The answer for a MesubError: Mesub's wait or refusal as the widget routes shape it, else a 500. */
function answerFor(error: MesubError): Answer {
    // A guard's 500 copy carries Mesub's own answer (401 key refused, 404 slug unknown) on `cause`.
    const mesub = error.cause instanceof MesubError ? error.cause : error;
    // Never the key, the client or its headers. The request id is what Mesub support asks for.
    console.error('Mesub call failed', mesub.status, mesub.code, mesub.apiCode, mesubRequestId(mesub));

    // ADAPT: a code the app answers otherwise (already_subscribed, a 409 to read back) is handled
    // where the call is made, by apiCode. What reaches here is answered by its kind.
    const kind = mesubFailure(mesub).kind;
    return kind === 'wait' || kind === 'refused' ? browserAnswer(mesub) : BROKEN;
}

/** Express: `app.use(mesubErrors)`, last. Anything not from Mesub goes on to the app's own handler. */
export const mesubErrors: ErrorRequestHandler = (error, _req, res, next) => {
    if (!(error instanceof MesubError)) return next(error);
    const answer = answerFor(error);
    res.status(answer.status).set(answer.headers).json(answer.body);
};

/** Next.js route handlers: answers a MesubError, rethrows anything else to the framework. */
export function mesubErrorResponse(error: unknown): Response {
    if (!(error instanceof MesubError)) throw error;
    const answer = answerFor(error);
    return Response.json(answer.body, { status: answer.status, headers: answer.headers });
}
