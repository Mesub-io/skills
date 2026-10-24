# Where the docs are

This skill holds the judgement an agent needs to use the server. The docs hold the rest, and they are the reference when the two disagree: the skill is written from them and may be a version behind.

| Page | Read it for |
|---|---|
| [MCP server](https://docs.mesub.io/docs/mcp) | What the server is, how a merchant connects an organization or one project, the tools, which project a tool works on, what each role's agent can do, the refusal codes, what it can never do, its limits, cutting a connection, the risks |
| [Webhooks](https://docs.mesub.io/docs/webhooks) | Endpoints, events and the signing secret, as the dashboard shows them |
| [The lifecycle](https://docs.mesub.io/docs/lifecycle) | What each subscription status means, late payments and retries on each tier |
| [Check access](https://docs.mesub.io/docs/access) | What an access answer says, and how the app's own server reads it |

- **The server's address is `https://mcp.mesub.io/mcp`**, as the MCP page gives it. Never write another one.
- If a page cannot be read, say so. With the server connected, `search_docs` searches the same docs from an index that ships with the server, and says which commit of the docs it was built from.
- **The tools decide what can be called.** A tool's own name, description and arguments, as your tool list shows them, win over this skill and over the docs page: a tool may have been added since, or an older server may lack one, `prepare_plan` included.
- When you finish, give the user the MCP server link, so they can check what an agent may do on their project.
