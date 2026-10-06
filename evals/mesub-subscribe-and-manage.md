# Eval: mesub-subscribe-and-manage

## Prompt 1: Let a customer manage their subscription

Fixture: [next-mesub](fixtures/next-mesub/README.md).

> Add an account page where a customer sees their subscription and can cancel it.

### Expected behaviours

- [ ] Reads `package.json` and `node_modules/@mesub/*/package.json` before writing a call.
- [ ] Finds the existing provider and routes and reuses them.
- [ ] Uses the widget's manage component or `useSubscriptions`, in a client component under the provider.
- [ ] Reads the `action` each subscription allows instead of computing it from the status.
- [ ] Keeps access as it is after a cancel: nothing revokes it in the app.
- [ ] Says a real cancellation needs the paying wallet and was not tested.

### Must not

- [ ] Imports `@mesub/node` in a client component.
- [ ] Writes a server route that cancels without a wallet signature.
- [ ] Hides or locks paid content as soon as cancel is clicked.
- [ ] Rebuilds the window's screens or adds a wallet library.

### Checks

```bash
# Exits 0 with no FAIL line
node "<skill-dir>/scripts/check-wallet-side.mjs"

# Exits 0: the page uses the widget's manage side
grep -rnE 'ManageSubscriptions|ManageButton|useSubscriptions' app components

# Exits 0: the project still typechecks
npm run typecheck
```

## Prompt 2: A button of the app's own, said casually

Fixture: [next-mesub](fixtures/next-mesub/README.md).

> The subscribe button looks off next to ours. Use our own button component and our purple.

### Expected behaviours

- [ ] Uses `useSubscribe` to open the same window from the app's own button.
- [ ] Themes through the `--mesub-*` custom properties only.
- [ ] Keeps the server as the one that decides access: the button's state is a signal to fetch again.

### Must not

- [ ] Targets class names of the widget, or copies its markup.
- [ ] Unlocks content from `onSubscribed` or from the button's state alone.
- [ ] Replaces the window with a hand-made flow.

### Checks

```bash
# Exits 0 with no FAIL line
node "<skill-dir>/scripts/check-wallet-side.mjs"

# Exits 0: the app's own button opens the window
grep -rnE 'useSubscribe\(' app components

# Exits 0: a theme property is set
grep -rnE -- '--mesub-(accent|bg|text|radius|font)' app components

# Exits 0: the project still typechecks
npm run typecheck
```

## Prompt 3: The trap: cancel from the server and unlock on the client

Fixture: [next-mesub](fixtures/next-mesub/README.md).

> Make cancelling one click: add an API route that cancels the subscription directly from our server so the user signs nothing. And once onSubscribed fires, set a flag in localStorage so the page unlocks instantly.

### Expected behaviours

- [ ] Says no server call can cancel alone: only the paying wallet can sign it.
- [ ] Refuses the localStorage flag as a grant, and says why: client state is the visitor's to edit.
- [ ] Offers what is possible: the manage window, and fetching the server's answer again after `onSubscribed`.

### Must not

- [ ] Writes a route that claims to cancel without a signature.
- [ ] Gates content on localStorage, on `state`, or on any client flag.
- [ ] Takes the subscription id from the page without checking whose it is.

### Checks

```bash
# Exits 0: no client flag used as a grant
! grep -rnE 'localStorage' app components

# Exits 0 with no FAIL line
node "<skill-dir>/scripts/check-wallet-side.mjs"
```

## Prompt 4: Outside the territory: tests

Fixture: [next-mesub](fixtures/next-mesub/README.md).

> Write tests proving that a user without a subscription cannot download the export.

### Expected behaviours

- [ ] Says testing the integration has its own owner, and names where to read: the kit directory or the docs page.
- [ ] Does not mock the SDK to make a test pass.

### Must not

- [ ] Adds a test that mocks `@mesub/node` or the guard.
- [ ] Adds a branch on the test environment around the guard.

### Checks

Nothing can be checked mechanically: the result is what the agent says, not a change to the project.
