# Mesub on Express, Next.js and NestJS

Read the section for the project's framework. The last three sections apply to all of them.

## Express

Works on Express 4 and 5. Copy `assets/express-mesub.ts`.

```ts
import { mesubRoutes, requirePlan } from '@mesub/node/express';

const customer = (req) => (req.user ? { external_id: req.user.id } : null);

app.use('/api/mesub', yourLogin, mesubRoutes({ customer }));
app.get('/api/analytics', yourLogin, requirePlan('pro', { customer }), handler);
```

- **Order.** Mount after the middleware that fills the session (`yourLogin` above), so `customer` can read it. Mounted before, `customer` always returns `null` and every call answers 401.
- **Body parser.** None is needed. The routes use `express.json()` when it already ran and read the body themselves otherwise.
- **Signed-out visitors.** Reading a plan is public: `GET /api/mesub/plans/:slug` needs nobody signed in, so a pricing page can show the price. That only holds if `yourLogin` fills the session without rejecting. If it rejects signed-out requests, the widget still works for signed-in users.
- **Inside the handler.** After `requirePlan`, `res.locals.mesub` holds who asked and which plan let the request through.
- **Without the guard.** `hasAccess` is the same question, for a route that serves something different to subscribers rather than refusing:

```ts
import { Mesub } from '@mesub/node';

const mesub = new Mesub(); // reads MESUB_API_KEY, build it once per process

app.get('/api/feed', yourLogin, async (req, res) => {
    const paid = await mesub.hasAccess({ external_id: req.user.id }, 'pro');
    res.json(paid ? fullFeed(req.user) : preview());
});
```

Build one `Mesub` per process, at module level, never one per request: the outage fallback lives in its memory.

## Next.js

App Router, Next.js 14 or later. Copy `assets/next-mesub-route.ts` and `assets/next-paid-route.ts`.

- **The catch-all folder is required.** The widget routes are one file at `app/api/mesub/[...mesub]/route.ts`. The folder name in brackets is free, the three dots are not: without them the file answers one path and the widget gets 404 on the rest. With a `src/` folder it is `src/app/api/mesub/[...mesub]/route.ts`.
- **Export both `GET` and `POST`** from that file, as the asset does.
- **`withMesub` wraps route handlers only.** It is not for `middleware.ts`, pages or server components. For a server component or a server action, ask directly and decide what to render:

```tsx
import { Mesub } from '@mesub/node';

const mesub = new Mesub();

export default async function Reports() {
    const session = await yourSession();
    if (!session) redirect('/login');

    const paid = await mesub.hasAccess({ external_id: session.userId }, 'pro');
    return paid ? <FullReports /> : <Upsell />;
}
```

- **The session.** `customer` receives the Web `Request`. Read the session with the auth library's own server helper. Do not parse a cookie by hand and do not trust a user id sent in a header.
- **The key.** Next.js loads `.env.local` on the server. A variable without the `NEXT_PUBLIC_` prefix never reaches the browser: keep it that way.
- **Client and server files.** `@mesub/node` is imported in server files only. `@mesub/react` already starts with `'use client'`, so the provider can be rendered straight from the root layout. A component that passes a function to the widget (`onSubscribed`, a custom `fetch`) must itself be a client component, as `assets/subscribe-button.tsx` is.
- **Edge runtime.** Where there is no `process.env`, the key is passed from the runtime's bindings, and the client is handed to the routes:

```ts
const mesub = new Mesub({ apiKey: env.MESUB_API_KEY });

export const { GET, POST } = mesubRouteHandlers({ client: mesub, customer });
```

## NestJS

NestJS 10 or later, on the Express platform. Copy `assets/express-mesub.ts` for `main.ts` and `assets/nest-paid.controller.ts`.

- **The widget routes go in `main.ts`**, with the Express call. There is no Nest module for them:

```ts
import { mesubRoutes } from '@mesub/node/express';

app.use('/api/mesub', yourLogin, mesubRoutes({ customer }));
```

  `yourLogin` here is an Express middleware. A Nest guard does not run for `app.use` routes: if the app's login exists only as a guard, the session read must also be available as a middleware or a plain function `customer` can call.
- **A global prefix does not apply** to `app.use`. With `app.setGlobalPrefix('api')`, the path above is still exactly `/api/mesub` as written, and the controllers are under `/api/...` by the prefix.
- **Paid controllers** use `RequirePlan` after the app's own auth guard, in that order: `@UseGuards(YourAuthGuard, RequirePlan('pro', { customer }))`. `@MesubAccess()` injects who asked and which plan let them in.

## Naming the customer

A customer is named by exactly one of `external_id` (the app's own id for the user), `wallet` or `email`.

- Prefer `external_id`. It does not change when the user changes wallet or email.
- Use the same name in the widget routes and in every paid route. A subscription made as `{ external_id: 'u_1' }` is not found by asking about `{ email: 'a@b.c' }`.
- When the customer is not named by email, `mesubRoutes` and `mesubRouteHandlers` take `email: (req) => req.user?.email`, so Mesub knows where that subscriber's notices go.
- `plans: ['pro', 'team']` keeps the widget to those plans. By default it may subscribe to any plan of the project.

## When the login is a bearer token, or the API is on another origin

The widget sends its requests with the session cookie (`credentials: 'include'`). Two cases need more:

- **Bearer token.** Give the provider a `fetch` that adds it. The token is the app's own, never a Mesub key:

```tsx
<MesubProvider
    endpoint="/api/mesub"
    fetch={(url, init) =>
        fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } })
    }
>
```

- **Another origin.** `endpoint` may be a full URL. The server must then allow that origin with credentials in its own CORS settings, and the session cookie must be allowed across sites. A wildcard origin does not work with credentials.

## What the routes answer

Useful when checking by hand. Paths are under the mount point.

| Call | Signed out | Signed in |
|---|---|---|
| `GET /plans/:slug` | 200 with the plan, or 404 `plan_not_found` | the same |
| `GET /subscriptions` | 401 `unauthenticated` | 200 with that customer's subscriptions |
| `POST /subscriptions` | 401 `unauthenticated` | 201 with the terms and a transaction to sign |
| any path, key refused by Mesub | 500, thrown to the framework | 500 |

Under Express the default error handler answers a thrown error's own status, so without an error handler of the app's own a refused key shows as 401 and an unknown slug as 404. Give the app an error handler that answers 500 for a `MesubError`.

A refusal is `{ "error": { "code": "...", "message": "..." } }`. A 401 from these routes always means nobody is signed in on the app. Mesub refusing the API key is never passed on as a 401: it would read to the widget as "sign in first".
