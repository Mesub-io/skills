# Where the docs are

This skill holds what a first setup needs. The docs hold the rest, and they are the reference when the two disagree: the skill is written from them and may be a version behind.

| Page | Read it for |
|---|---|
| [First subscriber](https://docs.mesub.io/docs/quickstart) | The same four steps, written for a person: send the user there to follow along |
| [API key](https://docs.mesub.io/docs/api-key) | Creating, rotating and revoking the key in the dashboard |
| [Check access](https://docs.mesub.io/docs/access) | Every field of an access answer, several plans, the outage fallback |
| [React widget](https://docs.mesub.io/docs/react) | Every prop, the manage window, theming |

- Read a page when the task goes past this skill and its owner is not installed: `references/kit-directory.md` gives the page for each skill.
- Before using an option or a function this skill does not show, check it in the installed package (`node_modules/@mesub/node/README.md` and its type declarations). The installed version is what runs: never write a call from memory.
- If a docs page cannot be reached, say so and work from the installed package. Do not guess what the page said.
- When you finish, give the user the First subscriber link, so they can check the work against it.
