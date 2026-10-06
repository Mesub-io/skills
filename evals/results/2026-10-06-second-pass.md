# Second pass: the eleven prompts left out

| | |
|---|---|
| Date | 2026-10-06 |
| Agent and model | One vendor's coding agent, as sub-agents of a single session. No other agent was tried |
| Skill versions | 0.1.0, all experimental, after the plan end date update |
| Packages | Local builds of `@mesub/node` and `@mesub/react`, both after the plan end date changes. Absent on purpose for mesub-errors prompt 4 |
| Setup | As the first pass: a copy of the fixture, one skill installed alone, the agent shown the skill's name and description and the user's message |

## How it was graded

By the person who launched the runs: the files each agent changed, the forbidden patterns searched in them, the opening of its final message, and `pnpm eval:checks`. Every "Must not" line was checked. The "Expected behaviours" lines were not ticked one by one.

## Runs

| Skill | Prompt | Must not | Checks | What was seen |
|---|---|---|---|---|
| mesub-quickstart | 2, casual | none happened | 4 passed | Catch-all routes, session read on the server, gate in the route and the page, provider and button |
| mesub-quickstart | 4, outside | none happened | none to run | **Did the task**: a verified webhook on the raw body, with dedup. Named the skill that owns it and a docs page |
| mesub-gate-access | 2, casual | none happened | 4 passed | Cut the list on the server with an awaited `hasAccess`. Also gated the API route, unasked, and said so |
| mesub-gate-access | 4, outside | none happened | none to run | **Did the task** with the widget: no server cancel. Said its skill excludes it. Named no owner |
| mesub-subscribe-and-manage | 2, casual | none happened | 4 passed | Own button through `useSubscribe`, theme through the custom properties |
| mesub-subscribe-and-manage | 4, outside | none happened | none to run | **Did the task**: tests against the fake, nothing mocked. Added a `MESUB_BASE_URL` setting to shipped code to point the app at the fake. Named no owner |
| mesub-testing | 2, casual | none happened | 4 passed | A seam, the fake's outage, a 503 for a user never seen |
| mesub-testing | 4, outside | none happened | none to run | Declined, and said why a fake cannot prove a payment |
| mesub-errors | 2, casual | none happened | 3 passed | Found the refusals already handled, added an error handler that answers 500 for a `MesubError` and never 401 |
| mesub-errors | 4, outside | none happened | none to run | Changed nothing. Found the package absent and not on the registry, wrote no stub, said what the user must install |
| mesub-webhooks | 3 | none happened | none to run | Said the project holds no handler to fix, then added one that survives the global parser. The prompt did not match its fixture |

Every agent loaded its skill without being told to.

## What it shows

- **A prompt outside a skill's territory is mostly done anyway.** Three of five did the neighbour's task. None did it unsafely, and each said its skill does not cover it. That is what a user wants; the eval lines asking the agent to stop and point elsewhere were too strict.
- **Only mesub-quickstart can name the owner.** It carries the kit directory. The five other skills have an empty `delegates_to`, written while their neighbours were still planned, so their hand-off block names nobody: the agents could not point to a skill they had never heard of.
- A setting that points shipped code at a fake (`MESUB_BASE_URL`) is the kind of test door the testing skill forbids. An agent holding only another skill added one.

## What it changed

- The webhooks eval's prompt 3 now asks for what its fixture allows: a handler to add in an app with a global JSON parser.

## Left to decide

- Fill `delegates_to` now that every neighbour is shipped. Each hand-off costs bytes in a `SKILL.md` already near 7,400 of its 8,000: the rendered block has to get shorter first.
- Reword the "outside the territory" prompts: doing the task safely and naming the owner is a pass.

## What it does not show

Nothing about another vendor's agent, a live Mesub, or how often a behaviour holds: one run per prompt.
