<!-- Rendered from catalog.yaml by `pnpm render`. Do not edit. -->

# Kit directory

Every skill of the mesub-skills kit. Each one installs alone and works alone: for a task outside the skill you are reading, find its owner here and check it is installed. If it is not, install it only once the user agrees; otherwise, or when it cannot be installed, stop and say so, and read its docs. Going on without it is the user's call, and its one rule below still holds.

## `mesub-quickstart`

- Territory: From an empty project to a first paying subscriber, on Express, Next.js or NestJS, and the directory of the kit.
- Installed if `mesub-quickstart` is among your available skills, or if `npx -y skills list` names it.
- To install it alone, once the user agrees: `npx -y skills add Mesub-io/skills --skill mesub-quickstart`.
- If the user declines or it cannot be installed, read https://docs.mesub.io/docs/quickstart instead.
- Without it, its one rule still holds: never ask for the API key; `customer` from the verified session.

## `mesub-gate-access`

- Territory: Gate a route or a page on a plan with the guards and hasAccess, and answer 402 and 503 correctly.
- Installed if `mesub-gate-access` is among your available skills, or if `npx -y skills list` names it.
- To install it alone, once the user agrees: `npx -y skills add Mesub-io/skills --skill mesub-gate-access`.
- If the user declines or it cannot be installed, read https://docs.mesub.io/docs/access instead.
- Without it, its one rule still holds: gate on the server; an error is never "not subscribed".

## `mesub-subscribe-and-manage`

- Territory: The wallet side with @mesub/react, the server routes it calls, and subscribing from the server.
- Installed if `mesub-subscribe-and-manage` is among your available skills, or if `npx -y skills list` names it.
- To install it alone, once the user agrees: `npx -y skills add Mesub-io/skills --skill mesub-subscribe-and-manage`.
- If the user declines or it cannot be installed, read https://docs.mesub.io/docs/subscribe instead.
- Without it, its one rule still holds: the widget subscribes; never hand-make that flow.

## `mesub-webhooks`

- Territory: Receive Mesub's events, verify the signature, deduplicate and handle retries.
- Installed if `mesub-webhooks` is among your available skills, or if `npx -y skills list` names it.
- To install it alone, once the user agrees: `npx -y skills add Mesub-io/skills --skill mesub-webhooks`.
- If the user declines or it cannot be installed, read https://docs.mesub.io/docs/webhooks instead.
- Without it, its one rule still holds: verify the raw body's signature; deduplicate on the event id.

## `mesub-testing`

- Territory: Test an integration without touching the chain with @mesub/node/testing.
- Installed if `mesub-testing` is among your available skills, or if `npx -y skills list` names it.
- To install it alone, once the user agrees: `npx -y skills add Mesub-io/skills --skill mesub-testing`.
- If the user declines or it cannot be installed, read https://docs.mesub.io/docs/testing instead.
- Without it, its one rule still holds: never mock `@mesub/node`: a seam and `FakeMesub`.

## `mesub-errors`

- Territory: Diagnose a failure from an error code, a reason or an attempt's outcome, and fix it.
- Installed if `mesub-errors` is among your available skills, or if `npx -y skills list` names it.
- To install it alone, once the user agrees: `npx -y skills add Mesub-io/skills --skill mesub-errors`.
- If the user declines or it cannot be installed, read https://docs.mesub.io/reference/errors instead.
- Without it, its one rule still holds: branch on `apiCode`, never a message; never loop on `retryable`.

## `mesub-mcp`

- Territory: Act on a merchant's live projects through the Mesub MCP server: read them, diagnose, manage webhooks, retry a charge, prepare a plan.
- Installed if `mesub-mcp` is among your available skills, or if `npx -y skills list` names it.
- To install it alone, once the user agrees: `npx -y skills add Mesub-io/skills --skill mesub-mcp`.
- If the user declines or it cannot be installed, read https://docs.mesub.io/docs/mcp instead.
- Without it, its one rule still holds: ask before any change; never an API key.
