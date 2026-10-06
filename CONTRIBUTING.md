# Contributing

The rules are in [AGENTS.md](AGENTS.md): read it first. In short:

1. Open or pick an issue, and branch from `main`.
2. `pnpm install`.
3. For a new skill, `pnpm new-skill <id> --title "..."`. For a change to a skill, raise its version in `skill.yaml` and in `catalog.yaml`.
4. Never edit rendered output. Edit `catalog.yaml` or the skill, then `pnpm render`.
5. `pnpm validate` and `pnpm test` must pass. CI runs the same two.
6. Open a pull request against `main` with `Closes #N`.

A new validation rule comes with its failing kit in `test/validate.test.mjs`, written first.
