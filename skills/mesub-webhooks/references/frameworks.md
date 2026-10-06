# The handler on Express, Next.js and NestJS

Read the section for the project's framework, then "What the check throws". Each asset imports `assets/handle-event.ts`, copied beside it.

## Two ways to call the check

| Call | Secret | Use it when |
|---|---|---|
| `mesub.webhooks.verify(body, headers)` | the client's `webhookSecret`, else `MESUB_WEBHOOK_SECRET` | the app already builds a `Mesub` client. It also drops that customer's cached access answers |
| `verifyWebhook(body, headers)` | `MESUB_WEBHOOK_SECRET` | a route with no client at hand |

Both take a third argument, `{ secret, tolerance }`. `secret` names another secret than the default (a second endpoint, or a runtime with no `process.env`, where it comes from the runtime's own bindings). `tolerance` is how far `webhook-timestamp` may be from now, in milliseconds, 5 minutes by default: leave it alone. A delivery refused as too old usually means the server's clock is wrong, and widening the window is what lets a captured delivery be replayed.

`body` is the body as received: a string, a `Buffer` or any `Uint8Array`, or an `ArrayBuffer`. `headers` is a Fetch `Headers` or Node's plain object, whatever the case of the names.

`new Mesub()` reads `MESUB_WEBHOOK_SECRET` when it is built and throws a `TypeError` if it is set to something that is not `whsec_...`: a wrong value stops the server on start, which is intended. A missing one is fine until a delivery is verified.

## Express

Works on Express 4 and 5. Copy `assets/express-webhook.ts`.

- **`express.raw({ type: 'application/json' })` on this route only.** It leaves `req.body` as a `Buffer`, which is what the check needs.
- **Register the route before `app.use(express.json())`.** A JSON parser that ran first leaves an object in `req.body`, `express.raw` then does nothing, and the check throws a `TypeError`. If the order cannot change, keep the JSON parser off this path.
- **Never rebuild the body** with `JSON.stringify(req.body)`: the bytes differ from what was signed (spacing, key order, escapes) and every delivery fails with `invalid_webhook`.
- **Before the app's login and CSRF middleware**, for the same reason as the parser: Mesub has no session.
- **`next(error)`, not `throw`**, for an error the route does not answer itself. Express 4 does not catch a rejected async handler: the request hangs and the process may exit.

## Next.js

App Router. Copy `assets/next-webhook-route.ts` to `app/webhooks/mesub/route.ts`.

- **`await request.text()`**, once, handed straight to the check. Never `request.json()`: it parses, and a body can be read only once.
- **Leave the path out of `middleware.ts`** when the middleware sends signed-out visitors to a sign-in page. A redirect counts as a failed delivery.
- **The secret has no browser prefix.** A variable starting with `NEXT_PUBLIC_` is shipped to the browser.
- **Where there is no `process.env`** (an edge runtime), pass `{ secret }` from the runtime's bindings as the third argument.
- The route runs per request and may run in several instances: the deduplication store must be the database, never a module-level set.

## NestJS

On the Express platform. Copy `assets/nest-webhook.controller.ts` and register the controller in a module.

- **Turn the raw body on in `main.ts`**: `NestFactory.create(AppModule, { rawBody: true })`. Without it `req.rawBody` is undefined.
- **Verify `req.rawBody`, never `req.body`**, which Nest has already parsed.
- **`@HttpCode(200)`**: a Nest `@Post()` answers 201 by default. That is a 2xx and would be received too. 200 is what the docs show.
- **A global auth guard also guards this controller.** Exempt it the way the app exempts its public routes.
- A global prefix applies: with `app.setGlobalPrefix('api')` the URL to register is `/api/webhooks/mesub`.
- Take the request with `@Req()`, not a DTO with `@Body()`: the parsed body is not what was signed.

## What the check throws

| Thrown | When | Answer |
|---|---|---|
| `MesubError`, `code` `invalid_webhook` | A header is missing, no signature matches the secret, or the timestamp is outside the tolerance | 400 |
| `MesubError`, `code` `unexpected` | Mesub signed it, but the body is not one this version of the SDK can read | Let it fail (5xx) and report it: the package is too old. Mesub retries meanwhile |
| `TypeError` | The body was already parsed, no secret is set, or the secret is not `whsec_...` | Let it fail and fix the server. Never answer it as a 400 |

Catch only `invalid_webhook`. A `catch` that swallows everything and answers 200 turns the check off: unsigned calls are then handled as events. A `catch` that answers 400 to everything hides a missing secret behind what looks like a bad signature.

On `invalid_webhook` in a route that used to work, in the order to check:

1. The body is not the raw one (a parser ran, or the body was rebuilt).
2. The secret is another endpoint's. Each endpoint has its own.
3. The server's clock is off by more than 5 minutes.
4. A proxy in front of the app rewrites the body.

Read the error's `message` on the server: it says which of the three checks failed. Do not send it back in the response, and do not log the body or the `webhook-signature` header with it.
