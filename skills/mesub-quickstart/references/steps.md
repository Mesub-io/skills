# The six steps, in full

The detail behind each step of `SKILL.md`. Read the step you are on before writing its code.

## Step 0: read the project and ask for what only the user has

Before writing code:

1. Find the framework and the login. Read `package.json` for `express`, `next` or `@nestjs/common`, then find how a request learns who the user is (a session middleware, an auth library's server helper, a guard). Everything below hangs on that one line.
2. If there is no login at all, stop and say so. Mesub ties a subscription to a customer the app names: without a verified identity there is nothing safe to tie it to. Do not invent one, and do not take an id from the browser.
3. Check what is installed: `package.json`, the lockfile, and `node_modules/@mesub/node/package.json` for the version. Neither package may be on the public registry yet, so do not assume an install will succeed (step 2).
4. Ask the user for two things an agent cannot produce:
   - **The plan's slug.** They create the plan in the dashboard, under Plans, and their wallet signs it. The plan's Implement tab shows the slug; `mesub.plans.list()` returns every plan's `slug` too, and so does the Mesub MCP server's `list_plans` when it is connected. Never derive a slug from the plan's name: the merchant may have given it another one. If they have no plan yet, they make one first: code written against a slug that does not exist answers 404.
   - **That the API key is in the server's environment.** They create it in the dashboard, under Developers. It starts with `SUB_` and is shown once.

**Never ask the user to paste the API key into the conversation, and never write its value anywhere.** Ask them to add `MESUB_API_KEY` to the server's environment themselves, then check that the name is set without reading the value (the script below does). Why: a key pasted in a chat or committed to a file must be treated as leaked and rotated.

## Step 1: the API key

- Build the one client of the process once, at module level: `assets/mesub-client.ts`. Every asset imports it and passes it as `client`, so the routes and the guards share one cache.
- The variable is `MESUB_API_KEY`. `new Mesub()` reads it by itself: do not pass it by hand unless the runtime has no `process.env` (an edge runtime), where it is passed as an option from the runtime's own bindings.
- It goes in the server's environment: the env file the framework already loads locally, and the host's settings in production. Confirm that file is ignored by git before the user fills it.
- Never give it a prefix that a bundler ships to the browser (`NEXT_PUBLIC_`, `VITE_`, `REACT_APP_` and the like), never import it in a client component, never log it, never commit it, not even in an example file.
- Say "API key": it is the only key Mesub has. The browser never holds one.
- A missing key makes `new Mesub()` throw "Missing Mesub API key". With the one client at module level (`assets/mesub-client.ts`) that is when the module is imported: the server does not start, and under Next.js `next build` fails, so the build needs the key too. A route or guard given no `client` builds a default one at its first request instead, and answers 500. That is the intended behaviour: do not catch it. `references/frameworks.md` has the detail.

## Step 2: install

Install with the project's own package manager, the one its lockfile shows:

```bash
npm install @mesub/node
npm install @mesub/react
```

`@mesub/node` goes in `dependencies`, not `devDependencies`: the server needs it in production. It has no runtime dependency. `@mesub/react` brings what it needs for wallets: install nothing for Solana by hand. `@mesub/react` 0.1.x works with the routes of `@mesub/node` 0.1.x: keep the two at the same minor, and upgrade them together.

If the install answers that the package does not exist, **stop and tell the user**: the packages are in early 0.x and may not be published yet. Until they are on the public registry (no date is set), they come from their public source repositories, `Mesub-io/node-sdk` and `Mesub-io/react-sdk`: built there and packed (`pnpm install && pnpm build && npm pack` in each clone), then installed from the tarball (`npm install /path/to/mesub-node-<version>.tgz`, which lands in `package.json` and the lockfile as a `file:` dependency), or linked as a package of the same workspace. Tell the user that, and let them choose; do not clone, build or pack them yourself without their yes, and never install a tarball or a folder of unknown origin. Do not install a package with a similar name, do not copy the SDK's source into the project, and do not rewrite the calls against the HTTP API to get around it. Why: a lookalike package on a registry is the classic way a key gets stolen.

## Step 3: mount the routes the widget calls

The widget needs a handful of routes on the app's server (read a plan, prepare a subscription, submit what the wallet signed, cancel, resume, close). One call mounts all of them:

| Framework | Call | Where | Ready to copy |
|---|---|---|---|
| Express | `mesubRoutes` from `@mesub/node/express` | `app.use('/api/mesub', yourLogin, ...)` | `assets/express-mesub.ts` |
| Next.js | `mesubRouteHandlers` from `@mesub/node/next` | `app/api/mesub/[...mesub]/route.ts` | `assets/next-mesub-route.ts` |
| NestJS | `mesubRoutes` from `@mesub/node/express` | `app.use(...)` in `main.ts` | `assets/express-mesub.ts` |

Copy the asset, then adapt the lines marked `ADAPT`. What each framework needs beyond that (the catch-all folder, the body parser, the order of guards) is in `references/frameworks.md`: read the section for the project's framework before editing.

The one option that matters is `customer`: a function that says who is asking.

```ts
customer: (req) => (req.user ? { external_id: req.user.id } : null)
```

- **It must come from a session the app verified, never from the request itself.** Not the query string, not the body, not a header the browser sets, not a wallet address the page sends. Why: every subscription is tied to what this function returns, and a paid route is opened on it. A function that reads `req.query.user` lets anyone type a subscriber's id and get their access.
- Return `null` when nobody is signed in. The routes then answer 401, and the widget tells the visitor to sign in first.
- Name the customer by `external_id`, the app's own stable id for the user. Use the same one everywhere: the routes and every paid route must name the same person the same way, or the subscription made under one name is not found under the other.

## Step 4: gate one paid route

Mounting the routes takes money; it gives nothing. Something must ask Mesub before serving what is paid. The question is `hasAccess(customer, slug)`, and each framework has a guard that asks it and answers the refusals itself:

| Framework | Guard | Ready to copy |
|---|---|---|
| Express | `requirePlan('pro', { client: mesub, customer })` | `assets/express-mesub.ts` |
| Next.js | `withMesub(handler, { plan: 'pro', client: mesub, customer })` | `assets/next-paid-route.ts` |
| NestJS | `@UseGuards(YourAuthGuard, RequirePlan('pro', { client: mesub, customer }))` | `assets/nest-paid.controller.ts` |

A guard answers **401** when nobody is signed in, **402** when the customer has no access, and **503** with `Retry-After` when Mesub could not answer about a customer it never saw. Keep those three apart: a client that treats them alike shows "please subscribe" during an outage.

Rules that hold whatever the framework:

- **Gate on the server.** Hiding a button in React is not a gate: the data must not leave the server without the check.
- **Do not cache the answer yourself.** The SDK already keeps answers and already handles an outage: it serves the last answer it knew for that customer for up to 24 hours, and refuses one it never saw. A second cache on top only makes a cancellation arrive late.
- **Do not turn an error into "not subscribed".** A wrong key or an unknown slug throws on purpose, so a broken integration is loud. Wrapping the check in a `try` that returns `false` hides it and locks out every paying subscriber.
- **Do not store "is subscribed" in the app's database** to read it later. Ask Mesub on each request: it is the one that knows about the renewal that just failed.

## Step 5: the provider and the button

Two pieces, both in `assets/`:

1. `assets/mesub-provider.tsx`: `MesubProvider`, once, around the app, with the stylesheet. Its `endpoint` is exactly the path of step 3, and its `chain` must be the plan's network.
2. `assets/subscribe-button.tsx`: `SubscribeButton` with the plan's slug.

- `chain` is the network the wallet signs for, `solana:` then the cluster. Left out, it is the test network: set `chain` to the network of the plans. The plan's `network` is in what `GET <endpoint>/plans/<slug>` answers: when it is not the provider's, pass `chain` with that cluster, as Solana's wallets name it, and ask the user when unsure. On the wrong one the wallet signs for a network the plan is not on.
- `endpoint` and the mount path must be the same string. A mismatch is the most common first-run failure: the window opens on an error instead of the plan.
- Requests go with the session cookie. If the app's login is a bearer token instead, the provider takes a `fetch` that adds the header: see `references/frameworks.md`.
- Do not add a wallet library, a wallet adapter or a connect button for this. The widget finds installed wallets itself, asks for an account when it needs a signature, and never disconnects one.
- Do not build the subscribe flow by hand. It is two signatures in a fixed order with terms that expire: the widget does it, and a hand-made version charges twice or not at all.

## Step 6: check, then hand the wallet part to the user

Run the check from the project root, with the script's path resolved under this skill's folder:

```bash
node "<skill-dir>/scripts/check-setup.mjs"
```

Replace `<skill-dir>` with the absolute path of the folder that holds this `SKILL.md`. Do not change into that folder first: the script reads the current directory. Add `--server-only` when the project has no React front. A project with no gated route fails the check: add `--no-gate-yet` only when the user chose to gate nothing yet, and say so. It only reads files, and shows where a key is, never its value.

Then go through `checks/verification.md`. It ends with the one step an agent cannot do: **the subscription itself needs a person with a wallet**, who approves twice in the window (the terms, then the first payment). Say so plainly instead of reporting the feature as tested. Report what you checked, what you could not, and what the user must click.
