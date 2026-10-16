# Where the docs are

This skill holds what a webhook handler needs. The docs hold the rest, and they are the reference when the two disagree: the skill is written from them and may be a version behind.

| Page | Read it for |
|---|---|
| [Webhooks](https://docs.mesub.io/docs/webhooks) | The guide, written for a person: setting the endpoint up in the dashboard, the handler, testing |
| [Webhook events](https://docs.mesub.io/reference/webhooks/overview) | The request, its three headers, how it is signed, and one page per event with a full payload |
| [subscription.renewal_upcoming](https://docs.mesub.io/reference/webhooks/subscription-renewal-upcoming) | A full payload of that event |
| [test](https://docs.mesub.io/reference/webhooks/test) | A full payload of a test delivery |
| [Test your integration](https://docs.mesub.io/docs/testing) | Everything else the fake of `@mesub/node/testing` does |

- **The installed package decides what compiles.** Before using an event name, a field or an option, search the `.d.ts` files of `node_modules/@mesub/node/dist` and `node_modules/@mesub/node/README.md`. Never write a call from memory.
- The docs can be ahead of the package. Known: a copy of `@mesub/node` installed before the `test` flag or `subscription.renewal_upcoming` was typed does not name them. Both arrive at runtime all the same: `references/events.md` says how to read them.
- `subscription.access_granted` and `subscription.access_revoked` have their pages in the docs and in the API contract, but Mesub does not send them yet: `references/events.md`, "Order and access", holds what the contract says. A package that types neither them nor `sequence` still hands them back: read them by hand as `assets/handle-event.ts` does.
- If a docs page cannot be reached, say so and work from the installed package. Do not guess what the page said.
- When you finish, give the user the Webhooks link, so they can check the work against it.

## Where the package comes from

`@mesub/node` is on the public npm registry, under that exact name: `npm install @mesub/node` with the project's own package manager, in `dependencies`. When it is missing, tell the user that and install it only on their yes. If the registry answers that it does not exist, check the name and stop: never install a package with a similar name, a tarball or a folder of unknown origin, and never copy the SDK's source into the project.
