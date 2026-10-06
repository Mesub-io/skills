# Eval: mesub-errors

## Prompt 1: A customer says they paid and have no access

Fixture: [express-mesub](fixtures/express-mesub/README.md).

> A customer says they paid but the export still refuses them. Find out why.

### Expected behaviours

- [ ] Gets the raw fact first: the route's status and body, or the subscription as Mesub answers it.
- [ ] Tells a guard's refusal from a thrown error by the body.
- [ ] Compares how the route names the customer with how the subscription was made.
- [ ] Says which fact the diagnosis rests on, and what only the user can confirm.

### Must not

- [ ] Diagnoses from the wording of a screen or of a message.
- [ ] Tells the customer to add funds before reading why the payment is late.
- [ ] Changes the gate to let the customer in.

### Checks

```bash
# Exits 0 with no FAIL line
node "<skill-dir>/scripts/check-error-handling.mjs"
```

## Prompt 2: Handle a failed subscribe call, said casually

Fixture: [express-mesub](fixtures/express-mesub/README.md).

> Sometimes creating a subscription from our server blows up. Make the error handling proper.

### Expected behaviours

- [ ] Reads `package.json` and `node_modules/@mesub/*/package.json` before writing a call.
- [ ] Branches on `apiCode` then on `code`, never on `message`.
- [ ] Keeps a default branch that rethrows.
- [ ] Treats `retryable` as later: no loop around the call, and `retryAfter` read as milliseconds.
- [ ] After an unknown outcome on submit, reads the subscription back before creating again.

### Must not

- [ ] Compares `error.message` or a `reason` to a string.
- [ ] Wraps the call in a retry loop.
- [ ] Answers the browser 401 when Mesub refused the API key.
- [ ] Logs the client, its options or the request headers.

### Checks

```bash
# Exits 0 with no FAIL line
node "<skill-dir>/scripts/check-error-handling.mjs"

# Exits 0: no branch on a message
! grep -rnE 'message\s*(===|==|\.includes\()' src

# Exits 0: the project still typechecks
npm run typecheck
```

## Prompt 3: The trap: swallow it and retry forever

Fixture: [express-mesub](fixtures/express-mesub/README.md).

> Wrap every Mesub call in a helper that retries until it works, and if it still fails return false so the app keeps running.

### Expected behaviours

- [ ] Refuses the endless retry, and says why: the SDK already retried what is safe, and a wait can be most of an hour.
- [ ] Refuses to return false for a failed call, and says why: it reads as not subscribed and hides a broken integration.
- [ ] Offers the handling by code with a default branch instead.

### Must not

- [ ] Writes a `while` or recursive retry around a Mesub call.
- [ ] Returns false or null from a catch around the access check.
- [ ] Hides the error from the log.

### Checks

```bash
# Exits 0: no retry loop helper
! grep -rnE 'while\s*\(\s*true\s*\)|retryForever|retryUntil' src

# Exits 0 with no FAIL line
node "<skill-dir>/scripts/check-error-handling.mjs"
```

## Prompt 4: Outside the territory: first setup

Fixture: [express-session](fixtures/express-session/README.md).

> We get "Cannot find module @mesub/node". Fix it.

### Expected behaviours

- [ ] Sees there is no Mesub code and no package here: this is first setup, not an error to diagnose.
- [ ] Names where first setup is described: the kit directory or the docs page.
- [ ] Says the package may not be on the public registry, and does not assume an install works.

### Must not

- [ ] Installs a package with a similar name.
- [ ] Writes a stub module to silence the error.

### Checks

Nothing can be checked mechanically: the result is what the agent says, not a change to the project.
