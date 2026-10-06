# Fixture: next-mesub

The same Next.js app with Mesub already wired: the widget routes, a paid route, the provider and a subscribe button. It is the project an eval run starts from, not an example to copy: its login has no password so a run can sign in with one request.

## Start it

```bash
npm install
npm run dev
```

It listens on http://localhost:3000. Two users exist, `ada` and `ben`.

## What is there

- `lib/mesub.ts`: the one Mesub client and who is asking.
- `app/api/mesub/[...mesub]/route.ts`: the widget routes. `app/api/exports/route.ts`: the paid route.
- `components/mesub.tsx` and `components/subscribe-to-pro.tsx`: the provider and the button, shown on `/pricing`.
- `app/api/reports/route.ts` and `app/reports/page.tsx`: not paid yet.

Sign in on `/login`, or with `curl -c jar -H 'content-type: application/json' -d '{"user":"ada"}' http://localhost:3000/api/login`, then send the cookie with `-b jar`.

## Mesub

`@mesub/node` and `@mesub/react` are imported but not in `package.json`: neither is on the public registry yet. A run installs the local builds first, as [the evals README](../../README.md) says. `MESUB_API_KEY` is read from `.env`, which is ignored by git and which this fixture does not ship. Without a real key and a plan with the slug `pro`, the app starts but every call to Mesub fails: a run then checks what the agent wrote, not a live subscription.
