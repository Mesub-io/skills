<!-- Rendered from catalog.yaml by `pnpm render`. Do not edit. -->

# Kit directory

Every skill of the mesub-skills kit. Each one installs alone and works alone: for a task outside the skill you are reading, find its owner here, check it is installed, install it if not, or read its docs.

## `mesub-quickstart`

- Territory: From an empty project to a first paying subscriber, on Express, Next.js or NestJS, and the directory of the kit.
- Installed if `mesub-quickstart` is among your available skills, or if `npx -y skills list` names it.
- To install it alone: `npx -y skills add Mesub-io/skills --skill mesub-quickstart`.
- If it cannot be installed, read https://docs.mesub.io/docs/quickstart instead.

## `mesub-gate-access`

- Territory: Gate a route or a page on a plan with the guards and hasAccess, and answer 402 and 503 correctly.
- Installed if `mesub-gate-access` is among your available skills, or if `npx -y skills list` names it.
- To install it alone: `npx -y skills add Mesub-io/skills --skill mesub-gate-access`.
- If it cannot be installed, read https://docs.mesub.io/docs/access instead.

## `mesub-subscribe-and-manage`

- Territory: The wallet side with @mesub/react, the server routes it calls, and subscribing from the server.
- Installed if `mesub-subscribe-and-manage` is among your available skills, or if `npx -y skills list` names it.
- To install it alone: `npx -y skills add Mesub-io/skills --skill mesub-subscribe-and-manage`.
- If it cannot be installed, read https://docs.mesub.io/docs/subscribe instead.

## `mesub-webhooks` (not available yet)

- Territory: Receive Mesub's events, verify the signature, deduplicate and handle retries.
- It cannot be installed yet. Read https://docs.mesub.io/docs/webhooks instead.

## `mesub-testing` (not available yet)

- Territory: Test an integration without touching the chain with @mesub/node/testing.
- It cannot be installed yet. Read https://docs.mesub.io/docs/testing instead.

## `mesub-errors` (not available yet)

- Territory: Diagnose a failure from an error code, a reason or an attempt's outcome, and fix it.
- It cannot be installed yet. Read https://docs.mesub.io/reference/errors instead.

## `mesub-mcp` (not available yet)

- Territory: Connect and use the Mesub MCP server from an agent.
- It cannot be installed yet. Read https://docs.mesub.io/docs/mcp instead.
