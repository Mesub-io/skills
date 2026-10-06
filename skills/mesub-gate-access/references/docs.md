# Where the docs are

This skill holds what gating needs. The docs hold the rest, and the installed package is what actually runs.

| Page | Read it for |
|---|---|
| [Check access](https://docs.mesub.io/docs/access) | The same ground, written for a person: the three guards, the answer, the errors of the API, the outage behaviour |
| [Lifecycle](https://docs.mesub.io/docs/lifecycle) | Every status, how a missed payment is retried, cancelling and resuming, a plan's end date, coming back |

- The docs site may not be reachable yet. If a page cannot be read, say so and work from the installed package: `node_modules/@mesub/node/README.md` and its type declarations. Do not guess what a page said.
- When the docs and the installed package disagree, the package wins: it is the code that answers the request.
- Before using an option or a function this skill does not show, check it in the installed package. Never write a call from memory.
- For a task outside gating (the first setup, the subscribe window, events, tests), this skill has nothing: tell the user it is another part of the Mesub docs rather than improvising.
