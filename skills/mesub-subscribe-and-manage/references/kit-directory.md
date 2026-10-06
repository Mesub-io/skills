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

## `mesub-webhooks`

- Territory: Receive Mesub's events, verify the signature, deduplicate and handle retries.
- Installed if `mesub-webhooks` is among your available skills, or if `npx -y skills list` names it.
- To install it alone: `npx -y skills add Mesub-io/skills --skill mesub-webhooks`.
- If it cannot be installed, read https://docs.mesub.io/docs/webhooks instead.

## `mesub-testing`

- Territory: Test an integration without touching the chain with @mesub/node/testing.
- Installed if `mesub-testing` is among your available skills, or if `npx -y skills list` names it.
- To install it alone: `npx -y skills add Mesub-io/skills --skill mesub-testing`.
- If it cannot be installed, read https://docs.mesub.io/docs/testing instead.

## `mesub-errors`

- Territory: Diagnose a failure from an error code, a reason or an attempt's outcome, and fix it.
- Installed if `mesub-errors` is among your available skills, or if `npx -y skills list` names it.
- To install it alone: `npx -y skills add Mesub-io/skills --skill mesub-errors`.
- If it cannot be installed, read https://docs.mesub.io/reference/errors instead.

## `mesub-mcp`

- Territory: Act on a merchant's live project through the Mesub MCP server: read it, diagnose, manage webhooks, retry a charge, prepare a plan.
- Installed if `mesub-mcp` is among your available skills, or if `npx -y skills list` names it.
- To install it alone: `npx -y skills add Mesub-io/skills --skill mesub-mcp`.
- If it cannot be installed, read https://docs.mesub.io/docs/mcp instead.
