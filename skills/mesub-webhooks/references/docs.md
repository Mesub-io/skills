# Where the docs are

This skill holds what a webhook handler needs. The docs hold the rest, and they are the reference when the two disagree: the skill is written from them and may be a version behind.

| Page | Read it for |
|---|---|
| [Webhooks](https://docs.mesub.io/docs/webhooks) | The guide, written for a person: setting the endpoint up in the dashboard, the handler, testing |
| [Webhook events](https://docs.mesub.io/reference/webhooks/overview) | The request, its three headers, how it is signed, and one page per event with a full payload |
| [subscription.renewal_upcoming](https://docs.mesub.io/reference/webhooks/subscription-renewal-upcoming) | A full payload of that event |
| [test](https://docs.mesub.io/reference/webhooks/test) | A full payload of a test delivery |
| [Test your integration](https://docs.mesub.io/docs/testing) | Everything else the fake of `@mesub/node/testing` does |

- **The installed package decides what compiles.** Before using an event name, a field or an option, look in `node_modules/@mesub/node/dist/index.d.ts` and `node_modules/@mesub/node/README.md`. Never write a call from memory.
- The docs can be ahead of the package. Known at `@mesub/node` 0.1.0: the docs list `subscription.renewal_upcoming` and the `test` flag, and the package's types name neither. Both arrive at runtime all the same: `references/events.md` says how to read them.
- If a docs page cannot be reached, say so and work from the installed package. Do not guess what the page said.
- When you finish, give the user the Webhooks link, so they can check the work against it.
