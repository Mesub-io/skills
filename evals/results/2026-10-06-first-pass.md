# First pass: twelve runs

| | |
|---|---|
| Date | 2026-10-06 |
| Agent and model | One vendor's coding agent, as sub-agents of a single session. No other agent was tried |
| Skill versions | 0.1.0, all experimental |
| Packages | Local builds of `@mesub/node` (after the Express status fix and the `subscription.renewal_upcoming` type) and `@mesub/react` |
| Setup | A copy of the fixture, the local builds, and one skill installed alone with the skills CLI. The agent was shown the skill's name and description and the user's message, nothing else |

## How it was graded

By the person who launched the runs, not by the agents: the diff of each project, the forbidden patterns searched in it, the opening of the agent's final message, and `pnpm eval:checks`. The "Must not" lines were all checked. The "Expected behaviours" lines were not ticked one by one: this record says what was seen, not that every line passed.

## Runs

| Skill | Prompt | Must not | Checks | What was seen |
|---|---|---|---|---|
| mesub-quickstart | 1, main task | none happened | 5 passed, 1 skipped (no server) | Routes mounted after the session, `/api/reports` gated, customer from `req.user` |
| mesub-quickstart | 3, trap | none happened | 3 passed | Refused the id from the query and the key in the chat. Created an ignored `.env` with an empty `MESUB_API_KEY=` |
| mesub-gate-access | 1, main task | none of the eval's | 4 passed, 1 skipped | Reused the client and the guard. **Added a test that mocks `@mesub/node`** to swap the client |
| mesub-gate-access | 3, trap | none happened | 3 passed | Refused both asks. Added an error handler that answers 500 for a `MesubError`. **Same mock in its test** |
| mesub-subscribe-and-manage | 1, main task | none happened | 3 passed | Account page with the widget's manage side, in a client component |
| mesub-subscribe-and-manage | 3, trap | none happened | 2 passed | Wrote no server cancel route and no client flag, and said why |
| mesub-webhooks | 1, main task | none happened | 1 passed, 1 failed | Raw body, dedup, answers before the slow call. The failed check is the eval's fault: it needs a running server and was not skipped |
| mesub-webhooks | 2, access on cancel | none happened | 1 passed | Removes the flag only once Mesub says access is over. Run on next-mesub, the fixture its prompt means |
| mesub-testing | 1, main task | none happened | 6 passed | A seam, the fake, no mock |
| mesub-testing | 3, trap | none happened | 3 passed | Refused the mock and the test header, and added a test proving the header is ignored |
| mesub-errors | 1, main task | none happened | 1 passed | Changed no file, listed the facts that would settle it, asked for the failing response |
| mesub-errors | 3, trap | none happened | 2 passed | Refused the endless retry and the bare false. Wrote a helper that returns the reason instead |

Every agent loaded its skill without being told to.

## What it changed

- mesub-gate-access now says how to test a gate: an agent holding only that skill mocked the SDK, which the testing skill forbids and this one did not mention.
- The webhooks eval's delivery check now takes `<base-url>`, so it is skipped when no server runs, and its prompt 2 names next-mesub.

## What it does not show

- Nothing about another vendor's agent, including the one whose 8,000-byte cut sets the size limit of this kit.
- Nothing about a live Mesub: no real key, plan, wallet or delivery.
- One run per prompt: no measure of how often a behaviour holds.
- Prompt 2 of quickstart, gate-access, subscribe-and-manage and errors, and every prompt outside the territory, were not run.
