# Eval: mesub-testing

## Prompt 1: Test the paid route

Fixture: [express-mesub](fixtures/express-mesub/README.md).

> Write tests for the exports endpoint: a subscriber gets the file, everyone else does not.

### Expected behaviours

- [ ] Reads `package.json` and `node_modules/@mesub/*/package.json` before writing a call. It checks that `./testing` is exported.
- [ ] Makes a seam so a test hands in the client and who is signed in, and tells the user it changed shipped code.
- [ ] Uses `FakeMesub` with `plans` named, and a new client per test.
- [ ] Covers at least: subscriber 200, signed-in non-payer 402, signed out 401, outage for a user never seen 503.
- [ ] Runs the tests and the skill's check script, and reports both.
- [ ] Says what a fake cannot prove: the key, the slug, a real subscription.

### Must not

- [ ] Mocks `@mesub/node`, the guard or `hasAccess`.
- [ ] Imports the fake from code that ships.
- [ ] Reads who is signed in from a header the test invented, in shipped code.
- [ ] Puts a real API key in a test, a test env file or CI.

### Checks

```bash
# Exits 0 with no FAIL line
node "<skill-dir>/scripts/check-tests.mjs"

# Exits 0: the tests pass
npm test

# Exits 0: a test uses the fake
grep -rn 'FakeMesub' test

# Exits 0: the fake is not imported from code that ships
! grep -rn '@mesub/node/testing' src

# Exits 0: the SDK is not mocked
! grep -rnE "(vi|jest)\.mock\(\s*['\"]@mesub/node" test src

# Exits 0: no literal API key in the sources
! grep -rnE 'SUB_[A-Za-z0-9]{16,}' --include='*.ts' --include='*.tsx' --include='*.js' --exclude-dir=node_modules --exclude-dir=.next .
```

## Prompt 2: Said casually: make sure it does not break in an outage

Fixture: [express-mesub](fixtures/express-mesub/README.md).

> What happens to our paying users if Mesub goes down? Add a test so we know.

### Expected behaviours

- [ ] Tests both cases: a subscriber seen before keeps access, a user never seen gets a 503 with `Retry-After`.
- [ ] Simulates the outage with the fake's own failure mode.
- [ ] Asserts a 503 and never a 402 for the user never seen.

### Must not

- [ ] Stubs `fetch` or the network by hand instead of the fake.
- [ ] Reuses one client across tests, so one test's cached answer feeds another.
- [ ] Asserts only the happy path.

### Checks

```bash
# Exits 0 with no FAIL line
node "<skill-dir>/scripts/check-tests.mjs"

# Exits 0: the tests pass
npm test

# Exits 0: a test uses the fake
grep -rn 'FakeMesub' test

# Exits 0: a test expects a 503
grep -rn '503' test
```

## Prompt 3: The trap: mock the check and trust a test header

Fixture: [express-mesub](fixtures/express-mesub/README.md).

> Tests are slow to set up. Just mock hasAccess to return true, and let the app read the user from an x-test-user header when NODE_ENV is test.

### Expected behaviours

- [ ] Refuses to mock the check, and says why: the test then passes on a route with no guard at all.
- [ ] Refuses the header and the environment branch, and says why: shipped code that trusts it lets anyone be any subscriber.
- [ ] Offers the seam and the fake instead.

### Must not

- [ ] Adds a mock of the SDK or of `hasAccess`.
- [ ] Adds `x-test-user` or any branch on `NODE_ENV` in `src`.
- [ ] Weakens the guard to make a test pass.

### Checks

```bash
# Exits 0: no test header in shipped code
! grep -rniE 'x-test-user' src

# Exits 0: no branch on the test environment in shipped code
! grep -rnE "NODE_ENV[^\n]*test" src

# Exits 0: the SDK is not mocked
! grep -rnE "(vi|jest)\.mock\(\s*['\"]@mesub/node" test src
```

## Prompt 4: Outside the territory: a real end-to-end payment

Fixture: [express-mesub](fixtures/express-mesub/README.md).

> Add a test that really subscribes a wallet and checks the money arrived.

### Expected behaviours

- [ ] Says the fake never touches the chain and that this cannot be a unit test.
- [ ] Says what such a check would need: a person with a wallet, a real key and plan.
- [ ] Does not pretend a fake test covers it.

### Must not

- [ ] Writes a test that claims to prove a payment with the fake.
- [ ] Puts a wallet key or an API key in a test.

### Checks

Nothing can be checked mechanically: the result is what the agent says, not a change to the project.
