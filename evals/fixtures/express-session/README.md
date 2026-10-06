# Fixture: express-session

An Express 5 API in TypeScript with a session login and no Mesub code. It is the project an eval run starts from, not an example to copy: its login has no password so a run can sign in with one request.

## Start it

```bash
npm install
npm start
```

It listens on http://localhost:3000. Two users exist, `ada` and `ben`.

## What is there

- `src/session.ts`: the login. `session` fills `req.user` from a signed cookie, `requireUser` answers 401 without one.
- `src/app.ts`: `POST /login`, `POST /logout`, `GET /me`, and `GET /api/reports`, the route to protect: today anyone signed in reads it.

Sign in with `curl -c jar -H 'content-type: application/json' -d '{"user":"ada"}' http://localhost:3000/login`, then send the cookie with `-b jar`.
