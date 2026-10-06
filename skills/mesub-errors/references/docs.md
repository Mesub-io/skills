# Where the docs are

This skill holds the tables a diagnosis needs. The docs are the reference when the two disagree: the skill is written from them and may be a version behind. The installed package wins over both for what the SDK does.

| Page | Read it for |
|---|---|
| [Errors](https://docs.mesub.io/reference/errors) | The error body and every code with its status |
| [Manage from your server](https://docs.mesub.io/docs/manage) | The refusals of cancel, resume and close, and reading an attempt |
| [Lifecycle](https://docs.mesub.io/docs/lifecycle) | Every status, late payments and retries per tier, why a subscription ends |
| [Subscribe from your server](https://docs.mesub.io/docs/subscribe) | How long submit takes, the unknown outcome, the refusals of create and submit |
| [Check access](https://docs.mesub.io/docs/access) | What a guard answers, the errors of an access call, the outage fallback |
| [React widget](https://docs.mesub.io/docs/react) | What the widget shows when something goes wrong |

`public/openapi.json` of the docs repository lists, route by route, the codes that route answers.

- The docs site may not be reachable. If a page cannot be read, say so and work from the installed package: `node_modules/@mesub/node/README.md`, its type declarations, and the doc comments on `MesubError` and `MesubSubmitError`. Do not guess what the page said.
- A code, a reason or a status that is in neither this skill nor the installed package is newer than both: handle it by the default branch and tell the user, do not invent its meaning.
