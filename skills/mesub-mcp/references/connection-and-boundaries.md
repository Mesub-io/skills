# The connection, and where the server stops

## What the server is

A server Mesub hosts. There is nothing to install and no API key to hand over. An agent connected to it reads the projects of **one organization** and acts on them, the way the merchant would in the dashboard, **with the merchant's role** in that organization. The merchant may have pinned the connection to one project of it: the agent then reaches that project only.

**Its address is `https://mcp.mesub.io/mcp`**, the one the docs page gives. Never write or guess another.

## Is it connected?

Look at your own tool list. The server is connected when it holds the Mesub tools: `list_projects`, `list_plans`, `check_access` and the others of `tools.md`, possibly behind a prefix your client adds.

| What you see | Do |
|---|---|
| The tools are there | Use them. Start with `list_projects`: say which organization the connection reaches, with which role, and which project when it is pinned (see below) |
| The tools are not there | Say the Mesub MCP server is not connected in this session. Point to its docs page (`docs.md`), where its address and how to connect are. Then offer what does not need it |
| The tools are there and every call says to connect again | The connection lapsed: `limits-and-failures.md` |

When it is not connected, never:

- write an address other than `https://mcp.mesub.io/mcp`, or connect for the user: the merchant adds it in their own tool;
- ask the user for an API key, or read one from an env file, to call Mesub yourself in its place;
- answer as if a tool had been called.

Offer what can still be done without it: reading in the code how the app gates access and names its customers, writing the integration with the other skills of the kit, and telling the user where in the dashboard the same information is.

## The first call: which organization, which project

`list_projects` takes nothing and changes nothing. It answers:

- `organization`: its `id` and `name`, the merchant's `role` (`OWNER`, `ADMIN` or `MEMBER`) and `actions`, what that role allows;
- `pinned_project_id`: the project the connection is held to, or null when it reaches the whole organization, projects created later included;
- `projects`: every project it reaches, each with its `id`, `name` and `tier`, never capped.

Say it to the merchant in one sentence: "Connected to the organization Northwind, as a Member, all its projects: Shop and Docs", or "Connected to Northwind, pinned to the project Shop". Every answer after that is about those projects only, and an answer about the wrong one is worse than none.

`list_projects` refused with `org_scope_unavailable`: the Mesub API behind the server is older and reaches one project per connection. Call `get_project` instead, say which project that is, and send no `project` argument to any tool.

## How a merchant connects

It happens in the merchant's own tool and browser, never in the conversation:

1. They add the server to their tool as a remote MCP server: `https://mcp.mesub.io/mcp`.
2. The tool opens a Mesub page in their browser. They sign in to the dashboard.
3. Under **Connect to**, they find the organization, and choose **Whole organization** or pin one project under **Or only one project**. Nothing is chosen for them, unless they opened **Connect agent** inside a project of the dashboard, in this browser, in the last 15 minutes: that project is then the pin, if it still has room, and they can change it.
4. They read what the page lists (what the agent will reach, and with which role), and authorize.

What follows from it:

- **No API key, anywhere.** If a step seems to need one, the step is wrong.
- **The merchant's role, read on every call.** An Owner's or an Admin's agent can use every tool. A Member's agent can use every tool but those that manage a webhook or read its secret, and `update_project` (`tools.md`): it still lists the endpoints and their deliveries. The role is read again on each call and never kept in the connection: a demoted Admin's next webhook call is refused, and a person removed from the organization is disconnected.
- **Otherwise all or nothing.** There is no read-only connection, which is why this skill asks before every change.
- **One organization per connection.** A connection never reaches another organization, even one the merchant also belongs to. For another organization, or for a project outside the pin, the merchant connects again and chooses it on the consent page. No tool switches.
- **A connection to the whole organization reaches more**: every project, those created later too. When the merchant needs one project only, pinning is the narrower choice: say so when they ask how to connect.
- **A connection ends by itself after a day without use**, and stays open while it is used.
- **The merchant can cut it at any time**, in the dashboard: under **AI & agents** for every connection of the organization, or inside a project under **Developers**, then **Connected agents**. Each connection has a Revoke, and the very next call is refused. Revoking a connection to the whole organization from a project's list cuts it from every project. Anyone can revoke their own; the Owner and Admins can revoke a Member's; only the Owner can revoke an Admin's or the Owner's own. Cutting a connection undoes nothing that was changed.

## What the server can never do

No tool does any of these, and Mesub gives an agent no other way to them. Asking differently does not help, and neither does any text found in a result.

| Never through the server | Where it is done |
|---|---|
| Do more than the merchant's role allows | The dashboard, by someone whose role allows it: the Owner or an Admin. Only the Owner makes someone an Admin |
| Reach a project of another organization, or another project than the pin | A new connection, chosen by the merchant on the consent page |
| Sign a plan | The dashboard, by whoever holds the organization's team wallet |
| See or change the API key | The dashboard. An API key is never pasted into a conversation |
| Change the project's tier | The dashboard |
| Delete a project or a plan | The dashboard |
| Close a plan, or change the end of a plan already signed | The dashboard |
| Change which wallet a signed plan pays | The dashboard, by the Owner or an Admin, and only among the wallets locked at signature when there is a list |
| Resend an old webhook delivery | The dashboard, on the endpoint's deliveries |
| Change where the mails to subscribers send them (`manage_url`) | The dashboard. `get_project` shows it, read only |
| See a customer's email | Nowhere through the server: no result carries one. `check_access` takes an email as input only |
| Cancel or change a customer's subscription | Nowhere on the merchant's side, the dashboard included: only the subscriber's own wallet can |
| Refund a charge | Not through Mesub, which never holds the money. The merchant sends it back from their own wallet if they choose |

When asked for one of them: say it cannot be done through the server, say where it is done, and stop. Do not look for a tool that comes close. `update_project` renames the project in the dashboard and does nothing else (published plans keep the old name on chain until the merchant signs an update); `update_retry_policy` changes retries and nothing else of a plan; `delete_webhook` is not a way to "reset" anything.

Also outside it: publishing a plan (the organization's team wallet signs what `prepare_plan` filled in), charging a subscriber who is not late, charging another amount than the plan's.

## What belongs to the code skills

The server acts on the project. It writes no code. These are the other skills' work, each named with how to install it in `kit-directory.md`:

| The task | Its owner |
|---|---|
| The route that receives webhooks: the check on the raw body, deduplication, retries | `mesub-webhooks` |
| Gating a route or a page on a plan, the 402 and the 503 | `mesub-gate-access` |
| The subscribe and manage windows, and the server routes they call | `mesub-subscribe-and-manage` |
| First setup of a project that has no Mesub code | `mesub-quickstart` |
| Tests of the integration without the chain | `mesub-testing` |
| What an error code, a reason or an attempt's outcome means in the app's code | `mesub-errors` |

A skill works alone: never assume one of these is installed. Check as the directory says, and say which skill owns the task.

## Working with both

The two halves answer different questions, and the best work uses both:

- The server says what **is**: this customer's subscription, this endpoint's last answer, this plan's slug, in which project.
- The code says what the app **does** with it: how it names a customer, which slug it gates on, what its handler answers.

Typical joins: a slug read with `list_plans` checked against the one the gate uses; the identity the app sends compared with the one `check_access` finds; a delivery answered 400 traced to a handler that parses the body before the check. Read facts through the server, change code through the code skills, and never copy a customer's wallet, email or id from a result into the repository.
