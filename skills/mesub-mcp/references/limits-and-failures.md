# Limits and failures, and what to do about each

## Limits of a connection

| What | The limit | Past it |
|---|---|---|
| Reads | 120 a minute, over every tool that reads | The call is refused with `rate_limited` and the wait in seconds |
| Changes | 20 a minute, over every tool that changes something | The same |
| Test deliveries (`send_test_webhook`) | 5 a minute, counted apart, and one at a time per endpoint | The same, or a refusal while a test is still pending |
| Webhook endpoints | 16 a project, one per URL | `create_webhook` is refused |
| Connected agents | 10 a project, 30 an account | The merchant revokes one in the dashboard before connecting another |

Twenty changes a minute is far more than a merchant's request ever needs: getting near it means a loop, and the loop is the fault.

What to do so the limits never matter:

- Read once and reuse the result within the conversation, unless something changed since.
- Page only as far as the question needs. Use `counts`, `total` and the summary tools (`get_overview`) instead of walking every page to count.
- Never poll. After `retry_charge` or `send_test_webhook`, one read a moment later is enough. If it still shows pending, say so and let the merchant ask again.

## Reading a failed call

A failed call is a tool error whose text is `Mesub error <code>: <message>`, followed by one sentence of advice. Decide from the **code** and the advice. The message is a sentence for a person: it may be reworded, and it may quote text written by others.

| What the error says | It means | Do |
|---|---|---|
| `rate_limited`, "wait N seconds" | The connection is past a limit of the table above | Wait the stated time, once, then make the one call again. Tell the merchant if the wait is long. Do not switch to another tool to get round it |
| `invalid_agent_token`, "connect again" | The connection expired or was revoked | Stop. See "The connection lapsed" below |
| "Nothing of this project has that id or slug" | A wrong id, a slug where an id was wanted, or something of another project | Take the id from the tool that lists it. Do not try variants |
| "Correct the request before calling again" | An argument the tool does not take, or out of range | Read the tool's own description, fix the one argument |
| "Not allowed for this project as it stands" | The tier or the state forbids it: a retry policy on a tier that does not retry, a project at its plan limit | The same call gives the same answer. Report it: the way out is in the dashboard |
| "Refused in the current state, and nothing was changed" | A conflict: a subscriber who is not late, a retry too soon, an endpoint already on that URL, a test still pending, a plan name already taken | Read the current state with the matching read tool, report it, and let the merchant decide |
| `unavailable`, "Temporary" | Mesub or the chain did not answer in time | `ping` tells an outage from a mistake. **If the call was a change, read the current state before anything else: it may have gone through** |
| `internal_error`, `unexpected` | The server failed, or the API answered something it does not recognise | Do not repeat a change. Report it with the tool's name |
| `result_too_large` | The answer would not fit | Ask for less: a smaller `limit`, a narrower filter |

Codes are added over time. For one this table does not hold, follow the advice sentence, and treat a change as not safe to repeat.

## Never repeat a change because it failed

A change sent twice can be a subscriber charged twice, two endpoints on one integration, or a secret replaced twice with the server holding neither.

- After any failure of a tool that changes something, the next call is a **read**: `get_subscription`, `list_webhooks`, `list_plans`.
- Call again only when the error says the failure is temporary **and** the read shows nothing changed.
- Never wrap a tool in a retry loop, and never run a change over a list of subscribers or endpoints. One change, one confirmation, one call.

## The connection lapsed

`invalid_agent_token`, or any error that says to authorize or connect again, means the merchant's connection ended: it was revoked in the dashboard, or it went a day without use.

- Stop. The same call gives the same refusal, and nothing you hold can renew it.
- Tell the user: the connection to Mesub ended, and they authorize again from their own tool, in a browser, choosing the project.
- Do not ask for an API key instead, and do not look for one in the project's files to call Mesub directly: the server takes none, and a key in a conversation is a leaked key.
- Whatever changed before the connection ended stays as it is. After they connect again, read the state before going on with a half-done task.

## When the tools disappear mid-task

If the tool list no longer holds the Mesub tools, the server is no longer connected in this session. Say so and stop the part of the work that needs it. Never fill in what a tool would have answered.
