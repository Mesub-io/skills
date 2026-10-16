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
- Under Express, an integration error is answered 500: the SDK hands a 4xx `MesubError` to `next()` as a 500. An older copy passes its own status (401, 404).
- `fake.webhook('test')` builds Mesub's test delivery (`test: true`, `evt_test`, `sub_test`) only in a copy of the package from 2026-10-16 on: an older one sets neither, so check its body first.
- `fake.webhook` takes `subscription.renewal_upcoming` only in a copy of the package that types the event.

## Where the package comes from

`@mesub/node` is on the public npm registry, under that exact name: `npm install @mesub/node` with the project's own package manager, in `dependencies`. When it is missing, tell the user that and install it only on their yes. If the registry answers that it does not exist, check the name and stop: never install a package with a similar name, a tarball or a folder of unknown origin, and never copy the SDK's source into the project.
