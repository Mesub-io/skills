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

## Fixtures

A run starts from a small project in `fixtures/`, never from an empty folder, so two runs of one prompt start from the same place. Each prompt names its fixture on a `Fixture:` line. Each fixture has a README with how to start it and how to sign in.

| Fixture | What it is |
|---|---|
| [express-session](fixtures/express-session/README.md) | An Express API with a login and no Mesub code |
| [express-mesub](fixtures/express-mesub/README.md) | The same, with Mesub wired and one paid route |
| [next-session](fixtures/next-session/README.md) | A Next.js app with a session helper and no Mesub code |
| [next-mesub](fixtures/next-mesub/README.md) | The same, with Mesub wired, a paid route and a subscribe button |

Copy a fixture out of the repository before a run: an agent must not see the eval file or the other skills.

## Getting the packages

`@mesub/node` and `@mesub/react` are not on the public registry yet, so a run installs the local builds. In the copy of the fixture, with the two SDK repositories cloned and built (`pnpm install && pnpm build` in each):

```bash
npm install
npm install <path to node-sdk> <path to react-sdk>
```

The Express fixtures need only the first of the two. For an eval of the first setup, where finding the package absent is part of the test, skip the second line and note it in the record: the expected behaviour is then to stop and say so.

## The mechanical checks

`pnpm eval:checks <skill-id> <project-dir>` runs every command under `### Checks` of that skill's eval, in the project, and prints `PASS`, `FAIL` or `SKIP` per command. A command passes when it exits 0.

```bash
pnpm eval:checks mesub-quickstart <project-dir> --prompt 1 --base-url http://localhost:3000
```

- `<skill-dir>` in a command is replaced by the skill's folder in this kit, or by `--skill-dir`.
- `<base-url>` is replaced by `--base-url`, where the project's app is running. Without it those commands are skipped, not failed.
- It starts no agent and no server, and judges no checklist line: the two checklists are read by a person.

The checks prove little alone. Those of a prompt that asks for a change fail on the untouched fixture and pass once the change is made. Those of a trap prompt only prove the forbidden thing is absent: they pass on the untouched fixture too, and the checklists carry the verdict.

## Running one by hand

1. Copy the prompt's fixture out of the repository, make it a git repository of its own, and install as above.
2. Install the skill under test, and only that one: `npx skills add <path to this repository> --skill <skill-id> --yes`.
3. Open a fresh agent session in the project, with no earlier conversation.
4. Give the prompt exactly as quoted. Do not name the skill.
5. Note whether the skill was loaded, then tick each line of the two checklists against what the agent did.
6. Run the checks: `pnpm eval:checks <skill-id> <project-dir>`, with `--prompt` and, when the app is running, `--base-url`.
7. Record the run in `results/`, from the template below.

An eval fails when any expected behaviour is missing or any "must not" happened.

## Recording a run

One file per run in [results/](results/README.md), named `<date>-<skill-id>-<agent>.md`:

```markdown
# Run: mesub-quickstart, prompt 1

| | |
|---|---|
| Date | 2026-01-31 |
| Agent and model | |
| Skill version | 0.1.0 |
| Fixture | express-session |
| Packages | local builds, or absent |
| Skill loaded without being named | yes or no |

## Expected behaviours

| Line | Result | Note |
|---|---|---|
| Reads `package.json` ... | pass | |

## Must not

| Line | Result | Note |
|---|---|---|

## Checks

The output of `pnpm eval:checks`, pasted as it came.

## Verdict

Pass or fail, and what to change in the skill.
```

A skill moves from `experimental` to `stable` on recorded runs that pass, not on its eval file existing.
