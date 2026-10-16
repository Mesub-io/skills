# Where the docs are

This skill holds what the wallet side and the server calls need. The docs hold the rest. The skill is written from them and from the packages' source, and may be a version behind: the installed package is what runs.

| Page | Read it for |
|---|---|
| [React widget](https://docs.mesub.io/docs/react) | The widget, written for a person: send the user there to follow along |
| [Subscribe from your server](https://docs.mesub.io/docs/subscribe) | The steps without the widget, with a full answer of `create` |
| [Fresh transaction](https://docs.mesub.io/reference/subscriptions/transaction) | `POST /v1/subscriptions/:id/transaction`: every answer and refusal |
| [Manage from your server](https://docs.mesub.io/docs/manage) | Cancel, resume, close, and every reason an attempt can carry |

- The docs site may not be reachable yet. If a page cannot be read, say so and work from the installed package: `node_modules/@mesub/react/README.md`, `node_modules/@mesub/node/README.md` and their type declarations. Do not guess what the page said.
- Before using a prop, an option or a method this skill does not show, check it in the installed types (`node_modules/@mesub/react/dist/index.d.ts`, `node_modules/@mesub/node/dist/index.d.ts`). Never write a call from memory.
- Where the docs and the installed package differ, the package wins. Known today: the docs page of the widget does not say that `manageUrl` leads to Mesub's own page by default.

## Where the packages come from

`@mesub/node` is on the public npm registry, under that exact name: `npm install @mesub/node`, in `dependencies`. `@mesub/react` is not on the registry yet (`npm view @mesub/react version` answers 404 until it is; once it answers a version, install it the same way). Until then it comes from its public source repository, `Mesub-io/react-sdk`: built and packed in a clone (`pnpm install && pnpm build && npm pack`), then installed from the tarball (`npm install /path/to/mesub-react-<version>.tgz`, a `file:` dependency), or linked from the same workspace. When a package is missing, tell the user that and let them choose; install, clone or build only on their yes. Never install a package with a similar name, a tarball or a folder of unknown origin, and never copy the SDK's source into the project. `@mesub/react` 0.1.x works with the routes of `@mesub/node` 0.1.x: install the two at the same minor.
