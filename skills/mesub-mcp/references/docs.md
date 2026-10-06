# Where the docs are

This skill holds the judgement an agent needs to use the server. The docs hold the rest, and they are the reference when the two disagree: the skill is written from them and may be a version behind.

| Page | Read it for |
|---|---|
| [MCP server](https://docs.mesub.io/docs/mcp) | What the server is, how a merchant connects, the tools, what it can never do, its limits, cutting a connection, the risks |
| [Webhooks](https://docs.mesub.io/docs/webhooks) | Endpoints, events and the signing secret, as the dashboard shows them |
| [The lifecycle](https://docs.mesub.io/docs/lifecycle) | What each subscription status means, late payments and retries on each tier |
| [Check access](https://docs.mesub.io/docs/access) | What an access answer says, and how the app's own server reads it |

- **The server is not hosted yet.** The MCP page says so and carries a placeholder address: do not copy it into a configuration, and do not present it as working. Send the user to the page, where the real address will be published.
- **The docs site may not be reachable** either. If a page cannot be read, say so. With the server connected, `search_docs` searches the same docs from an index that ships with the server, and says which commit of the docs it was built from.
- **The tools decide what can be called.** A tool's own name, description and arguments, as your tool list shows them, win over this skill and over the docs page: a tool may have been added, or `prepare_plan` may not have shipped yet.
- When you finish, give the user the MCP server link, so they can check what an agent may do on their project.
