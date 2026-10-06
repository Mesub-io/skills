# Fixture: next-session

A Next.js App Router app with a session helper and no Mesub code. It is the project an eval run starts from, not an example to copy: its login has no password so a run can sign in with one request.

## Start it

```bash
npm install
npm run dev
```

It listens on http://localhost:3000. Two users exist, `ada` and `ben`.

## What is there

- `lib/session.ts`: `getSession()`, read on the server from a signed cookie.
- `app/api/reports/route.ts` and `app/reports/page.tsx`: the reports to protect: today anyone signed in reads them.

Sign in on `/login`, or with `curl -c jar -H 'content-type: application/json' -d '{"user":"ada"}' http://localhost:3000/api/login`, then send the cookie with `-b jar`.
