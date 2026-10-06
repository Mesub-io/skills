# Fixture: express-mesub

The same Express API with Mesub already wired: the widget routes and one paid route. It is the project an eval run starts from, not an example to copy: its login has no password so a run can sign in with one request.

## Start it

```bash
npm install
npm start
```

It listens on http://localhost:3000. Two users exist, `ada` and `ben`.

## What is there

- `src/mesub.ts`: the one Mesub client, the `customer` function and the guard `requirePro`.
- `src/app.ts`: the widget routes at `/api/mesub`, `GET /api/exports` behind the guard, and `GET /api/reports`, not paid yet.
- `test/session.test.ts`: the only test, on the login. `npm test` runs it.

Sign in with `curl -c jar -H 'content-type: application/json' -d '{"user":"ada"}' http://localhost:3000/login`, then send the cookie with `-b jar`.

## Mesub

`@mesub/node` and `@mesub/react` are imported but not in `package.json`: neither is on the public registry yet. A run installs the local builds first, as [the evals README](../../README.md) says. `MESUB_API_KEY` is read from `.env`, which is ignored by git and which this fixture does not ship. Without a real key and a plan with the slug `pro`, the app starts but every call to Mesub fails: a run then checks what the agent wrote, not a live subscription.
