# Working on the Mesub skills kit

The rules for anyone, human or agent, who adds or changes a skill. [README.md](README.md) is for someone who installs the kit: keep how the kit is built here.

## Sources of truth

- **`catalog.yaml`** says what the kit is: its name, version and description, the groups, every skill (id, group, status, version, one-line territory, docs fallback), which skill carries the kit directory, and how the kit is published. Nothing else may restate any of it by hand.
- **`skills/<skill-id>/`** holds a skill's content, written by its author.
- **`scripts/lib/mould.mjs`** is the shape of a skill folder. The validator and `new-skill` both read it.
- **The Mesub docs** (repository `Mesub-io/docs`, pages under `src/docs` and `src/reference`, `public/openapi.json`) are the source of every fact a skill states about Mesub. A skill lists the pages it is written from in `skill.yaml` (`sources`).

Rendered, never edited by hand: the two marked blocks of `README.md`, `skills.sh.json`, the `related` block and the `license` line of every `SKILL.md`, and `references/kit-directory.md` in the skill that carries the directory.

## Commands

Node 22 or later and pnpm. Run from the repository root.

```bash
pnpm install
pnpm render      # write every rendered file from catalog.yaml
pnpm validate    # check the whole kit, exit 1 on any problem
pnpm test        # tests of the scripts
pnpm new-skill mesub-webhooks --title "Mesub Webhooks"   # start a skill from the mould
```

`pnpm validate --base <ref>` picks the commit skill versions are compared with (default `origin/main`). `pnpm validate --docs-site <path>` also checks that every `sources` path exists in a clone of the docs repository: CI does both.

## One kit, every agent

A skill here is the open [Agent Skills](https://agentskills.io/specification) format and nothing else: `SKILL.md` with its standard frontmatter, plus our `skill.yaml`, `references/`, `assets/`, `scripts/` and `checks/`. There is one skill per topic, not one per agent vendor.

- No per-vendor file inside a skill folder, and no vendor manifest or vendor folder at the root (no plugin manifest, no `.claude/`, `.cursor/`, `.gemini/`). They are deliberately not shipped: one skill, one source, no variant to keep in step.
- A skill addresses "the agent". It never names a vendor's agent or relies on one vendor's tool names or folders. The frontmatter field `allowed-tools` is refused for the same reason.
- One distribution: the [skills CLI](https://skills.sh), which installs the same folder into whichever agent the user has. Clone or copy is the fallback.

The door stays open: a distribution is one entry under `distributions` in `catalog.yaml` and one module in `scripts/lib/distributions/` exporting `files`, `install` and `installOne` (see `skills-cli.mjs`), registered in `index.mjs`. The validator then requires its files to match the catalog. Add one only on a decision of the owner.

What the skills CLI reads, checked in its source (v1.7.0): it finds `skills/<id>/SKILL.md` by itself and needs no manifest. `skills.sh.json` is not read by the CLI: it groups the skills on the kit's page on skills.sh. Its schema refuses an empty grouping, so the file does not exist until a skill ships. When a repository has no skill under `skills/`, the CLI searches every folder for a `SKILL.md`: that is why none may exist anywhere else here, test fixtures included.

## A skill works alone

A user picks the skills they want. `npx skills add Mesub-io/skills --skill <id>` copies that skill's folder and nothing else (checked: `SKILL.md`, `skill.yaml`, `references/`, `assets/`, `scripts/` with their modes, `checks/`, into `.agents/skills/<id>/` of the project). So:

1. A skill never assumes a neighbour is installed, and never points at a file outside its own folder. A link or a path that leaves the folder fails validation.
2. A hand-off carries its fallback. List the neighbours in `delegates_to` of `skill.yaml`: `pnpm render` writes, inside the `related` markers of `SKILL.md`, for each one its territory, how to tell whether it is installed, the command that installs it alone, and the docs page to read when it cannot be installed. All of it comes from the catalog. Do not write hand-offs by hand, and do not name a neighbour's id elsewhere in the skill without that block.
3. Only a shipped skill can be delegated to. A planned skill cannot be named at all: when it ships, its neighbours add it to `delegates_to` in the same pull request or a later one, and raise their version.
4. The kit has a directory. The skill named by `directory` in the catalog (`mesub-quickstart`) carries `references/kit-directory.md`, rendered: every skill of the kit with the same answers, and a planned skill listed as not available yet with its docs fallback only. The README table is the same data for a human.

## The mould

```text
skills/<skill-id>/
  SKILL.md                 required
  skill.yaml               required
  checks/verification.md   required: the runbook before saying "done"
  references/*.md          optional: detail loaded on demand
  assets/*                 optional: files to copy into the user's project
  scripts/*                optional: checks to run in the user's project
```

Nothing else may sit in the folder. Every file under `references/`, `assets/`, `scripts/` and `checks/` must be named in `SKILL.md`, or no agent will ever load it. Start a skill with `pnpm new-skill`: the skeleton comes from the mould the validator reads, so it cannot drift from it, and a test proves a fresh skeleton breaks no rule except its `TODO`s. A template folder was not chosen: any `SKILL.md` on disk can be installed as a real skill.

### SKILL.md

Frontmatter: `name` (the folder name and the catalog id), `description`, optionally `compatibility` (what must be installed, at most 500 characters) and `metadata`. `license` is rendered from the catalog: never write it.

The `description` is the only thing an agent sees before deciding to load the skill, so write it to trigger:

- Open with `Use this skill when` and say the task in the user's words.
- Add the casual phrasing someone would really type: `even if the user just says "users should pay monthly"`. This is what makes a skill load when nobody names Mesub's vocabulary.
- End with what it covers, as keywords an agent can match: package names, function names, error codes.
- At most 1024 characters. State the territory, not the neighbour's.

Then one H1, the `title` of `skill.yaml`, and exactly these sections, in this order:

1. `## Overview`: what the skill makes an agent good at, in two or three sentences.
2. `## When to use this skill`
3. `## Do not use this skill when`: the edges of the territory.
4. `## Core guidance`: the rules and the steps, each rule with its reason. Use `###` freely.
5. `## Related skills`: only the two `related` markers. `pnpm render` fills them.
6. `## References`, 7. `## Assets`, 8. `## Scripts`: one line per file, or `None.`
9. `## Checks`: `checks/verification.md`.

At most 500 lines: move detail to `references/`.

### skill.yaml

| Field | What it is |
|---|---|
| `schema` | `v1`. |
| `id` | The folder name, the frontmatter `name` and the catalog id. |
| `version` | `X.Y.Z`, equal to the catalog's. Raised whenever anything in the folder changes. |
| `title` | The H1 of `SKILL.md`. |
| `description` | The one-line territory, word for word the catalog's. |
| `owns` | The artefacts and topics this skill is the owner of. No two skills may list the same one. |
| `use_when` | The situations that call for this skill. |
| `do_not_use_when` | The situations that look close but belong elsewhere. |
| `delegates_to` | Ids of shipped skills this one hands off to. May be empty. Drives the rendered hand-off block. |
| `packages` | Which of `@mesub/node` and `@mesub/react` the skill makes the agent use. May be empty. |
| `sources` | The docs files the skill is written from, as paths in the docs repository (`src/docs/webhooks.mdx`, `src/reference/errors.mdx`, `public/openapi.json`). At least one. |

## Content rules

The validator refuses, in every file of a skill:

- "secret key" in any spelling: say "API key". The other key is the "publishable key".
- devnet or mainnet: the docs and the site do not name a network for now.
- An em dash, here and in every file of the repository: use a comma, a colon or a full stop.
- A package name that is not exactly `@mesub/node` or `@mesub/react` (subpaths such as `@mesub/node/testing` are fine).
- A vendor's agent, tool or folder (see above).
- An API key where it must never be: a literal `SUB_` value, a variable a bundler ships to the browser (`NEXT_PUBLIC_`, `VITE_` and the like), a log line that prints it, client code that reads it. These checks catch the written form. The rule is wider: never tell an agent to put an API key in client code, a repository or a log.
- A `https://docs.mesub.io/...` link to a page that is not one of the skill's `sources`.
- A `TODO` left from the skeleton.

Two facts every author must write around, today:

- Neither `@mesub/node` nor `@mesub/react` is on npm yet. A skill says how to check what is installed (`package.json`, the lockfile, `node_modules/@mesub/*/package.json` for the version) before using it, and never assumes an install command will work.
- docs.mesub.io is not hosted yet. Link only to pages that exist in the docs repository, declare them in `sources`, and put what the agent needs in the skill itself or its `references/` rather than behind a link.

Style: direct, operational, exact about the product. Explain the reason behind a rule. Prefer one small example that is safe to copy. Comments in examples: one line, on what is not obvious.

## Scripts inside a skill

A script under `skills/<id>/scripts/` runs in a stranger's project. It must:

- be executable, start with a shebang, and carry a `Usage:` comment in its first lines;
- answer `--help` with exit 0, and exit 2 on arguments it does not understand;
- run from the user's project root, with its own path resolved under the skill's folder: say so in `SKILL.md`, since an agent cannot guess where the skill was installed;
- read the project and report: no write, no install, no network unless its usage says so;
- never print an API key or any other credential;
- reach nothing outside its skill's folder.

## Scripts of the kit

`scripts/*.mjs` are plain Node, with JSDoc types and one dependency, `yaml`, pinned in `package.json` and locked. Node ships no YAML parser, and `yaml` has no dependency of its own and keeps comments when `new-skill` edits the catalog. They are deterministic, need no network, name the file in every error and exit non-zero on failure.

Every validation rule has a failing kit in `test/validate.test.mjs`: the good kit of `test/helpers/kit.mjs` with one thing wrong, which must fail with that rule and no other. Add the failing kit first, then the rule.

## What validation holds

`pnpm validate` fails when:

- the catalog is malformed, a skill lacks its docs fallback, or a distribution names no renderer (`catalog/*`);
- a folder under `skills/` and the catalog disagree, a required file is missing, a folder holds something the mould does not allow, a `SKILL.md` lies outside `skills/<id>/`, or a numbered copy of a file is left behind (`layout/*`);
- the frontmatter breaks the format, the name is not the folder and the id, or the description cannot trigger (`frontmatter/*`);
- the sections, the title, the length or the list of files of a `SKILL.md` break the mould, or a `TODO` is left (`skill-md/*`);
- `skill.yaml` misses a field, disagrees with the catalog, shares an owned topic, or delegates to itself, to an unknown skill or to a planned one (`skill-yaml/*`);
- a hand-off or the directory is missing, or a planned skill is named (`related/*`);
- a link or a path leaves the skill's folder or points at a file that is not there (`links/*`);
- a script is not executable, has no shebang or no usage line (`scripts/*`);
- a content rule above is broken (`content/*`);
- a stable skill has no eval file, an eval names no shipped skill, or breaks the format (`evals/*`);
- any rendered file differs from what the catalog renders (`render/*`);
- a licence is set without its file (`release/*`);
- a skill's content changed since the base branch and its version did not rise (`version/*`).

## Adding a skill

1. `pnpm new-skill <id> --title "..."`. For an id already planned in the catalog, this marks it `experimental` at `0.1.0`. For a new id, add `--group`, `--description` and `--docs`.
2. Fill every `TODO`. Write the description to trigger. List `sources`, `owns` and, if any, `delegates_to`.
3. Add `evals/<id>.md` (see [evals/README.md](evals/README.md)). It is required before the status may become `stable`.
4. `pnpm render`, review what it wrote, then `pnpm validate` and `pnpm test`.
5. If the skill that carries the directory changed (it does whenever a skill ships), raise its version too.

## Changing a skill

Any change under `skills/<id>/`, rendered or not, raises that skill's version in `skill.yaml` and in the catalog, in the same pull request: patch for a correction, minor for new guidance, a new file or a status change, major when the territory changes (`owns`, `use_when`, `delegates_to`). A version never goes down.

## Releasing

A release is two things, done by hand for now:

1. Raise `version` in `catalog.yaml`: patch for corrections, minor when a skill ships or gains guidance, major when installing or a territory changes in a way that breaks a user.
2. Once merged, tag that commit `vX.Y.Z` and push the tag. Tags are what users pin: never move one. The tag's own notes say what changed: there is no changelog file to keep in step.

Nothing is automated yet: no release workflow, no signed-off commits, no external link checker.

## Licence

No licence has been chosen, so the repository has no `LICENSE` and no skill declares one. When the owner decides: set `license` to an SPDX id in `catalog.yaml`, add the `LICENSE` file, run `pnpm render`. The README and every frontmatter follow, and validation fails if the file is missing.

## Git

Branch from `main`, never commit on it. One pull request per issue, with `Closes #N`. Short commit subjects (`add: ...`, `fix: ...`), no body. Add files by path. Merge without squash, only when asked.
