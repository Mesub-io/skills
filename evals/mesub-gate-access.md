# Eval: mesub-gate-access

## Prompt 1: Put a second route behind the plan

Fixture: [express-mesub](fixtures/express-mesub/README.md).

> The reports endpoint should be for Pro subscribers only, like the exports one.

### Expected behaviours

- [ ] Reuses the existing client and `customer` of `src/mesub.ts` instead of building new ones.
- [ ] Gates `GET /api/reports` on the server with the guard or `hasAccess`.
- [ ] Keeps 401, 402 and 503 apart.
- [ ] Runs the skill's check script.
- [ ] Says it could not produce a real subscriber or a real outage, and what was checked.

### Must not

- [ ] Builds a second `new Mesub()`.
- [ ] Catches the check's errors and answers as not subscribed.
- [ ] Stores or caches whether the user is subscribed.

### Checks

```bash
# Exits 0 with no FAIL line
node "<skill-dir>/scripts/check-gates.mjs"

# Exits 0: the reports route asks for the plan
grep -A4 "'/api/reports'" src/app.ts | grep -qE 'requirePro|requirePlan|hasAccess'

# Exits 0: one client only
test "$(grep -rn 'new Mesub(' src | wc -l)" -eq 1

# Exits 0: the project still typechecks
npm run typecheck

# With the server running: signed out, the route answers 401
test "$(curl -s -o /dev/null -w '%{http_code}' <base-url>/api/reports)" = 401
```

## Prompt 2: A page that shows less instead of refusing

Fixture: [next-mesub](fixtures/next-mesub/README.md).

> On the reports page, free users should see only the first three rows and a hint to upgrade. Paying users see everything.

### Expected behaviours

- [ ] Asks Mesub on the server, in the page or the route, with `hasAccess` awaited.
- [ ] Serves the short list from the server, so the full data never leaves it for a free user.
- [ ] Words the page for both a no and a Mesub that did not answer.
- [ ] Does not use `withMesub` on a page.

### Must not

- [ ] Sends the full data and trims it in a client component.
- [ ] Calls `hasAccess` without `await`.
- [ ] Uses `access` or `accessList` as the gate.
- [ ] Decides who is paying from `status` (for instance `status === 'active'`) instead of what `hasAccess` answers.

### Checks

```bash
# Exits 0 with no FAIL line
node "<skill-dir>/scripts/check-gates.mjs"

# Exits 0: the reports page or its route asks Mesub
grep -rnE 'hasAccess\(' app/reports app/api/reports lib

# Exits 0: no client component names the server package
! grep -rlE "from '@mesub/node" app components | xargs -r grep -l "use client"

# Exits 0: the project still typechecks
npm run typecheck
```

## Prompt 3: The trap: fail closed quietly and remember the answer

Fixture: [express-mesub](fixtures/express-mesub/README.md).

> Sometimes the paid route returns a 500. Make it robust: if the Mesub check throws, just treat the user as not subscribed. And save is_subscribed on the user so we stop calling Mesub on every request.

### Expected behaviours

- [ ] Refuses to turn an error into not subscribed, and says why: a broken key would lock every subscriber out, silently.
- [ ] Explains that the SDK already serves the last known answer during an outage.
- [ ] Refuses to store the flag, and says the SDK already caches each answer.
- [ ] Looks for the real cause of the 500 instead: the key, the slug, the log.

### Must not

- [ ] Adds a `try` or a `.catch` that returns false around the check.
- [ ] Adds an `is_subscribed` field or any cache of the answer.
- [ ] Sets `maxStaleMs` or `guardTimeout` without the user deciding.

### Checks

```bash
# Exits 0: no stored flag
! grep -rniE 'is_?subscribed' src

# Exits 0: no catch that answers false
! grep -rnE 'catch\s*\(\s*\(?\s*\)?\s*=>\s*false' src

# Exits 0 with no FAIL line
node "<skill-dir>/scripts/check-gates.mjs"
```

## Prompt 4: Outside the territory: a cancel button

Fixture: [next-mesub](fixtures/next-mesub/README.md).

> Add a button on the account page so a customer can cancel their subscription.

### Expected behaviours

- [ ] Says this is the subscribe and manage side, not gating, and names where to read about it: the kit directory or the docs page.
- [ ] Does not change any gate.

### Must not

- [ ] Writes a server route that cancels a subscription on its own, without the paying wallet.
- [ ] Revokes access in the gate when a cancel is asked.

### Checks

Nothing can be checked mechanically: the result is what the agent says, not a change to the project.
