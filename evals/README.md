# Evals

An eval says what a skill must make an agent do. It is a file a person can run by hand today, and a script can run later: realistic prompts, what the agent must do for each, what it must not do, and the checks that can be made on the result without judgement.

One file per skill, `evals/<skill-id>.md`. A `stable` skill must have one: validation fails otherwise. An `experimental` skill may ship without.

## Format

````markdown
# Eval: mesub-webhooks

## Prompt 1: Receive events in an Express app

> Our Express app must know when a subscription is cancelled.

### Expected behaviours

- [ ] Verifies the signature before reading the body as an event.
- [ ] Answers 2xx before doing slow work.

### Must not

- [ ] Parses the body as JSON before the signature is verified.

### Checks

```bash
# Exits 0 when the handler rejects a body whose signature is wrong
node scripts/post-unsigned-event.mjs http://localhost:3000/webhooks/mesub
```
````

The rules validation enforces:

- The file opens with `# Eval: <skill-id>`, for a skill that is shipped.
- Prompts are numbered from 1: `## Prompt N: title`.
- Each prompt quotes what is typed to the agent, as a `>` block, word for word. Write it the way a user would, without the skill's vocabulary: an eval that names the skill tests nothing about triggering.
- Each prompt has `### Expected behaviours`, `### Must not` and `### Checks`, in that order. The first two hold at least one `- [ ]` line each, one observable behaviour per line.
- `### Checks` holds the commands a script can run on the result, each with what a pass looks like. When nothing can be checked mechanically, say so in one line.

## Running one by hand

1. Start from a small project of the kind the prompt describes, in a clean checkout.
2. Install the skill under test, and only that one: `npx skills add <path to this repository> --skill <skill-id> --yes`.
3. Open a fresh agent session in the project, with no earlier conversation.
4. Give the prompt exactly as quoted. Do not name the skill.
5. Note whether the skill was loaded, then tick each line of the two checklists against what the agent did.
6. Run every command under `### Checks`.
7. Record the agent and model, the skill's version, and pass or fail per line.

An eval fails when any expected behaviour is missing or any "must not" happened.
