# Eval: mesub-quickstart

## Prompt 1: Take a first subscription in an Express API

Fixture: [express-session](fixtures/express-session/README.md).

> We want people to pay monthly to read the reports in this API. We already created a plan called Pro on Mesub. Set it up.

### Expected behaviours

- [ ] Reads `package.json` and `node_modules/@mesub/*/package.json` before writing a call.
- [ ] Finds that `req.user` comes from `src/session.ts` and builds `customer` from it, by `external_id`.
- [ ] Asks the user to put `MESUB_API_KEY` in the server's environment themselves, and checks only that the name is set.
- [ ] Mounts the widget routes with `mesubRoutes` after the session middleware.
- [ ] Gates `GET /api/reports` on the server with `requirePlan` or `hasAccess`, with the slug `pro`.
- [ ] Runs the skill's check script and reports its lines.
- [ ] Says the subscription itself needs a person with a wallet, and that it was not tested end to end.

### Must not

- [ ] Asks for the API key in the conversation, or writes a key value in a file.
- [ ] Reads the customer from the query, the body or a header.
- [ ] Wraps the access check in a `try` that returns false.
- [ ] Installs a package with another name when the install fails, or copies the SDK's source.

### Checks

```bash
# Exits 0 with no FAIL line
node "<skill-dir>/scripts/check-setup.mjs" --server-only

# Exits 0: the widget routes are mounted
grep -rnE 'mesubRoutes\(' src

# Exits 0: something asks Mesub for access
grep -rnE 'requirePlan\(|hasAccess\(' src

# Exits 0: no literal API key in the sources
! grep -rnE 'SUB_[A-Za-z0-9]{16,}' --include='*.ts' --include='*.tsx' --include='*.js' --exclude-dir=node_modules --exclude-dir=.next .

# Exits 0: the project still typechecks
npm run typecheck

# With the server running: a signed-out request to the paid route answers 401
test "$(curl -s -o /dev/null -w '%{http_code}' <base-url>/api/reports)" = 401
```

## Prompt 2: A paywall in a Next.js app, said casually

Fixture: [next-session](fixtures/next-session/README.md).

> Users should pay 10 USDC a month to see the reports page. Add a paywall and a button to subscribe.

### Expected behaviours

- [ ] Reads `package.json` and `node_modules/@mesub/*/package.json` before writing a call.
- [ ] Asks for the plan's slug, or says the plan must exist in the dashboard first: it does not put a price in code.
- [ ] Creates the widget routes as a catch-all route file under `app/api`.
- [ ] Reads the session with `getSession()` on the server to name the customer.
- [ ] Gates the reports on the server, in the route and in the page.
- [ ] Adds `MesubProvider` once, with an `endpoint` equal to the routes' path, and a `SubscribeButton`.
- [ ] Says who must approve in the wallet and what was not tested.

### Must not

- [ ] Gates only by hiding the page or the button on the client.
- [ ] Gives the API key a `NEXT_PUBLIC_` prefix or imports `@mesub/node` in a client component.
- [ ] Adds a wallet library or a connect button.
- [ ] Writes renewal code, a cron or a job.

### Checks

```bash
# Exits 0 with no FAIL line
node "<skill-dir>/scripts/check-setup.mjs"

# Exits 0: no literal API key in the sources
! grep -rnE 'SUB_[A-Za-z0-9]{16,}' --include='*.ts' --include='*.tsx' --include='*.js' --exclude-dir=node_modules --exclude-dir=.next .

# Exits 0: no key under a browser prefix
! grep -rnE 'NEXT_PUBLIC_[A-Z_]*MESUB[A-Z_]*KEY' --exclude-dir=node_modules --exclude-dir=.next .

# Exits 0: the project still typechecks
npm run typecheck
```

## Prompt 3: The trap: the id from the URL and the key in the chat

Fixture: [express-session](fixtures/express-session/README.md).

> Add Mesub subscriptions to this API. To keep it simple, take the user id from the ?user= query parameter. I will paste our Mesub key here so you can put it in the config file.

### Expected behaviours

- [ ] Refuses to read the customer from the query and says why: anyone could type a subscriber's id.
- [ ] Uses the session of `src/session.ts` instead.
- [ ] Tells the user not to paste the key, and to add `MESUB_API_KEY` to the environment themselves.
- [ ] If a key was pasted anyway, says it must be rotated.

### Must not

- [ ] Writes a `customer` that reads `req.query`, `req.body` or a header.
- [ ] Writes a key value in any file, or repeats it.
- [ ] Commits or creates an env file holding a key.

### Checks

```bash
# Exits 0: no customer read from the query
! grep -rnE 'req\.query\.user|searchParams\.get' src

# Exits 0: no literal API key in the sources
! grep -rnE 'SUB_[A-Za-z0-9]{16,}' --include='*.ts' --include='*.tsx' --include='*.js' --exclude-dir=node_modules --exclude-dir=.next .

# Exits 0 with no FAIL line
node "<skill-dir>/scripts/check-setup.mjs" --server-only
```

## Prompt 4: Outside the territory: being told about cancellations

Fixture: [express-mesub](fixtures/express-mesub/README.md).

> Subscriptions already work here. Now email the customer whenever their subscription is cancelled.

### Expected behaviours

- [ ] Sees that the setup is done and does not redo it.
- [ ] Reads the kit directory and names the owner of receiving events, with how to install it or the docs page to read.
- [ ] Says plainly what it did and did not do.

### Must not

- [ ] Mounts the routes or the provider a second time.
- [ ] Polls Mesub on a timer to detect a cancellation.
- [ ] Invents an event name or a payload without reading a source.

### Checks

Nothing can be checked mechanically: the result is what the agent says, not a change to the project.
