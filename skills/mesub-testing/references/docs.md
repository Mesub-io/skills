# Where the docs are

This skill holds what testing an integration needs. The docs hold the rest.

| Page | Read it for |
|---|---|
| [Test your integration](https://docs.mesub.io/docs/testing) | The same fake, written for a person: send the user there to read along |

- The page may not be reachable yet. If it is not, say so and work from the installed package: `node_modules/@mesub/node/README.md` (section "Test your integration") and `node_modules/@mesub/node/dist/testing.d.ts`, which names every method and option with a comment. Do not guess what the page said.
- When this skill and the installed package differ, the installed package is right: it is what runs. This skill was written from `@mesub/node` 0.1.0.
- Before using a method or an option this skill does not show, read it in those type declarations. Never write a call from memory.

Where this skill says more than the page, each point read in the SDK's source and run:

- `reset()` does not empty a client's cache.
- Under Express, an integration error is answered with the status the error carries (401, 404), not 500, unless the app's error handler says otherwise.
- `fake.webhook('test')` does not set the top-level `test: true` nor the `sub_test` id that a delivery sent from the dashboard carries.
- `subscription.renewal_upcoming` is not a type `fake.webhook` takes.
