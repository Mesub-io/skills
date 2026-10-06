# mesub-mcp, second pass: seven runs after the first fixes

| | |
|---|---|
| Date | 2026-10-06 |
| Agent and model | As the first pass: one vendor's coding agent, headless, one fresh session per run, on its mid-size model. No other agent was tried |
| Skill version | 0.1.0, experimental, after the changes of [the first pass](2026-10-06-mesub-mcp-first-pass.md) |
| Fixture | A copy of express-mesub and mcp-project, as the first pass left them |
| Server | The same local Mesub API and local build of the MCP server |
| Setup | The same harness: the skill installed alone, the agent given the user's message and nothing else |
| Skill loaded without being named | **7 runs of 7** (6 of 12 in the first pass) |
| Model cost | About $0.48 for the seven runs |

## How it was graded

By the person who launched the runs, from the tool calls and the answers. This record is written from their findings: the transcripts were not read again for it. Prompts 2 and 6, which passed in the first pass, were not run.

## Per prompt, before and after

| Prompt | First pass | Second pass | What was seen |
|---|---|---|---|
| 1, locked out | partial | partial | Now gives the reason as its label, "Wallet approval revoked or replaced", says "adding funds won't fix that", that the customer cancels and subscribes again, and the price as "10 USDC". Still no `get_subscription` |
| 3, webhook and secret | partial | pass | `git check-ignore` first, one append, `.env` never read. Searched for a route, said deliveries will fail and named `mesub-webhooks`. No test sent |
| 4, retry refused | partial | partial, in both variants | No guess among the two late rows, nothing charged. Never tried `check_access` with `ben` as `external_id`: said subscriptions only carry wallet addresses and asked who ben is, and one run searched `list_subscriptions` with `q` "ben". So `retry_charge` was not reached |
| 5, plan with what cannot be prepared | pass | pass on substance, on Free | Read the cap, prepared nothing, stated the limits on the end date and the receiver. The eval line expected a refused call, which a careful agent never makes |
| 7, not connected | pass, one line missing | pass | Offers the dashboard and reading the code |
| 8, what the server never does | fail | pass | Only the subscriber's wallet cancels, no refund through Mesub, the tier and the API key in the dashboard, an API key never pasted |

## What it shows

- **The description was the load problem.** Leading with when to load, in a merchant's words, took the rate from 6 of 12 to 7 of 7.
- What was moved into `SKILL.md` is used: the label, the late-reason table and "Where it stops" all appear in the answers.
- **A customer's name is not tried as an id.** The agent has the name the merchant typed and a tool that takes `external_id`, and does not join the two.
- **`get_subscription` is skipped for a reason**: a `list_subscriptions` row already carries the display price, `late_reason` and `retry_available_at`. Asking for a call that adds nothing to the answer was the eval's mistake.

## What it changed

In the skill:

- The row for "they topped up, charge again" starts with `check_access`, the name as `external_id` or the email, then `list_subscriptions` by the wallet it returns, then `retry_charge`, once.
- The late payment section says a name the merchant uses for a customer is the app's own id, to pass as `external_id` before asking who they are.
- `get_subscription` is for what only it has: every attempt with its `reason_label`, and what was paid in all.
- The append of the secret is the recipe's form, which ends the line and leaves no blank one.

In the eval:

- Prompts 1 and 4 accept the `list_subscriptions` row as the source of the price and of the retry time.
- Prompt 5 accepts "nothing was prepared, and why", from the refusal or from `get_project`.

## What it does not show

- Whether these last changes work: none was run again. Prompt 4 has not yet reached `retry_charge` with the skill loaded, so the seven-minute refusal is untested in that state.
- Nothing about another vendor's agent or another model, and one or two runs per prompt.
