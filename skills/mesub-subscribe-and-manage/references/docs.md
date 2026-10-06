# Where the docs are

This skill holds what the wallet side and the server calls need. The docs hold the rest. The skill is written from them and from the packages' source, and may be a version behind: the installed package is what runs.

| Page | Read it for |
|---|---|
| [React widget](https://docs.mesub.io/docs/react) | The widget, written for a person: send the user there to follow along |
| [Subscribe from your server](https://docs.mesub.io/docs/subscribe) | The three steps without the widget, with a full answer of `create` |
| [Manage from your server](https://docs.mesub.io/docs/manage) | Cancel, resume, close, and every reason an attempt can carry |

- The docs site may not be reachable yet. If a page cannot be read, say so and work from the installed package: `node_modules/@mesub/react/README.md`, `node_modules/@mesub/node/README.md` and their type declarations. Do not guess what the page said.
- Before using a prop, an option or a method this skill does not show, check it in the installed types (`node_modules/@mesub/react/dist/index.d.ts`, `node_modules/@mesub/node/dist/index.d.ts`). Never write a call from memory.
- Where the docs and the installed package differ, the package wins. Known today: the docs page of the widget does not list the provider's `chain` prop, nor say that `manageUrl` leads to Mesub's own page by default.
