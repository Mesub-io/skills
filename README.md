# Mesub skills

A kit of skills that teach an AI coding agent to add Solana subscriptions to an app with `@mesub/node` and `@mesub/react`. Each skill is one folder in the open [Agent Skills](https://agentskills.io/specification) format: the same folder for every agent, installed one at a time or all together.

## Skills

<!-- skills:start -->
<!-- Rendered from catalog.yaml by `pnpm render`. Do not edit. -->
1 of 7 skills are installable today. A skill marked coming cannot be installed yet.

| Group | Skill | Territory | Status | Fallback |
|---|---|---|---|---|
| Get started | [`mesub-quickstart`](skills/mesub-quickstart) | From an empty project to a first paying subscriber, on Express, Next.js or NestJS, and the directory of the kit. | experimental 0.1.0 | [docs](https://docs.mesub.io/docs/quickstart) |
| Build the integration | `mesub-gate-access` | Gate a route or a page on a plan with the guards and hasAccess, and answer 402 and 503 correctly. | coming ([#3](https://github.com/Mesub-io/skills/issues/3)) | [docs](https://docs.mesub.io/docs/access) |
| Build the integration | `mesub-subscribe-and-manage` | The wallet side with @mesub/react, the server routes it calls, and subscribing from the server. | coming ([#4](https://github.com/Mesub-io/skills/issues/4)) | [docs](https://docs.mesub.io/docs/subscribe) |
| Build the integration | `mesub-webhooks` | Receive Mesub's events, verify the signature, deduplicate and handle retries. | coming ([#5](https://github.com/Mesub-io/skills/issues/5)) | [docs](https://docs.mesub.io/docs/webhooks) |
| Test and debug | `mesub-testing` | Test an integration without touching the chain with @mesub/node/testing. | coming ([#6](https://github.com/Mesub-io/skills/issues/6)) | [docs](https://docs.mesub.io/docs/testing) |
| Test and debug | `mesub-errors` | Diagnose a failure from an error code, a reason or an attempt's outcome, and fix it. | coming ([#7](https://github.com/Mesub-io/skills/issues/7)) | [docs](https://docs.mesub.io/reference/errors) |
| Tooling | `mesub-mcp` | Connect and use the Mesub MCP server from an agent. | coming ([#9](https://github.com/Mesub-io/skills/issues/9)) | [docs](https://docs.mesub.io/docs/mcp) |
<!-- skills:end -->

Every skill works alone. Where one hands off to another, it says how to check the other is installed, how to install just that one, and which docs page to read otherwise. `mesub-quickstart` carries the directory of the whole kit.

## Install

<!-- install:start -->
<!-- Rendered from catalog.yaml by `pnpm render`. Do not edit. -->
### With the skills CLI

The [skills CLI](https://skills.sh) installs the skills you pick, and only those, for whichever agents you use. You do not have to take the whole kit: each skill works alone.

```bash
# See what the kit holds, without installing
npx skills add Mesub-io/skills --list

# Pick skills and agents interactively
npx skills add Mesub-io/skills

# One skill, no prompt (add -g for your user folder instead of the project)
npx skills add Mesub-io/skills --skill mesub-quickstart --yes

# Every skill of the kit
npx skills add Mesub-io/skills --skill '*' --yes

# Stay on one release: replace vX.Y.Z with a tag of this repository
npx skills add Mesub-io/skills#vX.Y.Z --skill mesub-quickstart --yes
```

### Clone or copy

Without the CLI, a skill is a folder: copy the whole folder into the place your agent reads skills from. Nothing in it points outside itself.

```bash
git clone --depth 1 --branch vX.Y.Z https://github.com/Mesub-io/skills.git mesub-skills
cp -R mesub-skills/skills/<skill-id> <your agent's skills folder>/
```

### Licence

Apache-2.0. See [LICENSE](LICENSE).
<!-- install:end -->

## What an install copies

Installing one skill copies that skill's folder and nothing else: no other skill, none of this repository's tooling. That is why a skill never points at a file outside its own folder, and why the validation refuses one that does.

## Versions

`main` moves as skills land. A tag `vX.Y.Z` is a fixed state of the whole kit: install from a tag to stay on it. Each skill also has its own version, in the table above.

## Repository layout

```text
catalog.yaml          the single source of truth: kit, groups, skills, distribution
skills/<skill-id>/    one folder per shipped skill
  SKILL.md            what the agent reads: frontmatter, then nine fixed sections
  skill.yaml          the skill's territory: what it owns, when to use it, who it hands off to
  references/         detail loaded on demand
  assets/             files to copy into a project
  scripts/            checks to run in a project
  checks/             verification.md, the runbook before saying "done"
evals/                one eval file per skill: prompts and expected behaviours
skills.sh.json        grouping for the skills CLI's site (rendered, absent until a skill ships)
scripts/              render, validate, new-skill and their library
test/                 tests of the scripts, one failing kit per validation rule
AGENTS.md             the rules for adding or changing a skill
```

## Contributing

Read [AGENTS.md](AGENTS.md), then [CONTRIBUTING.md](CONTRIBUTING.md).
