// The runner of the mechanical part of an eval: what it reads from an eval file,
// what it substitutes, and what it exits with.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { extractChecks, substitute } from '../scripts/lib/eval-checks.mjs'
import { runEvalChecks } from '../scripts/run-eval-checks.mjs'
import { makeKit, write } from './helpers/kit.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const CLI = resolve(HERE, '../scripts/run-eval-checks.mjs')

const prompt = (number, checks) => `## Prompt ${number}: Number ${number}

Fixture: none.

> Do thing ${number}.

### Expected behaviours

- [ ] Does it.

### Must not

- [ ] Breaks it.

### Checks

${checks}
`
const evalFile = (...checks) => `# Eval: mesub-alpha\n\n${checks.map((body, index) => prompt(index + 1, body)).join('\n')}`
const bash = (...lines) => ['```bash', ...lines, '```'].join('\n')

/** A kit whose alpha eval holds these checks, and an empty project to run them in. */
function setup(...checks) {
  const root = makeKit({ after: (dir) => write(dir, 'evals/mesub-alpha.md', evalFile(...checks)) })
  const project = mkdtempSync(join(tmpdir(), 'mesub-project-'))
  return { root, project }
}

/** Runs the runner in-process and returns its exit code and what it printed. */
function run(root, argv) {
  const lines = []
  const code = runEvalChecks(root, argv, (line) => lines.push(line))
  return { code, out: lines.join('\n') }
}

// --- Extraction ---

test('it reads each command under Checks with the comment above it', () => {
  const [first] = extractChecks(evalFile(bash('# Exits 0 with no FAIL line', 'node "<skill-dir>/scripts/verify.mjs"', '', '# No key in the sources', "! grep -rn 'SUB_' src")))
  assert.equal(first.number, 1)
  assert.equal(first.title, 'Number 1')
  assert.deepEqual(first.commands.map(({ command, expect }) => [command, expect]), [
    ['node "<skill-dir>/scripts/verify.mjs"', 'Exits 0 with no FAIL line'],
    ["! grep -rn 'SUB_' src", 'No key in the sources'],
  ])
})

test('it keeps prompts apart, and a prompt with no command has none', () => {
  const prompts = extractChecks(evalFile(bash('# One', 'true'), 'Nothing can be checked mechanically.', bash('# Three', 'false')))
  assert.deepEqual(prompts.map(({ number, commands }) => [number, commands.length]), [[1, 1], [2, 0], [3, 1]])
})

test('it joins a command continued over several lines, and a comment of several lines', () => {
  const [first] = extractChecks(evalFile(bash('# Signed out,', '# the paid route answers 401', 'test "$(curl -s -o /dev/null \\', "  -w '%{http_code}' <base-url>/api/reports)\" = 401")))
  assert.equal(first.commands.length, 1)
  assert.equal(first.commands[0].expect, 'Signed out, the paid route answers 401')
  assert.equal(first.commands[0].command, 'test "$(curl -s -o /dev/null \\\n  -w \'%{http_code}\' <base-url>/api/reports)" = 401')
})

test('it reads shell fences under Checks only', () => {
  const content = evalFile(['```ts', 'await run()', '```', '', bash('# Runs', 'true')].join('\n'))
    .replace('- [ ] Does it.', `- [ ] Does it.\n\n${bash('# Not a check', 'false')}`)
  const [first] = extractChecks(content)
  assert.deepEqual(first.commands.map(({ command }) => command), ['true'])
})

test('it gives each command the line it is written on', () => {
  const content = evalFile(bash('# Runs', 'true'))
  const [first] = extractChecks(content)
  assert.equal(content.split('\n')[first.commands[0].line - 1], 'true')
})

test('a command with no comment above it has an empty expectation', () => {
  const [first] = extractChecks(evalFile(bash('true')))
  assert.equal(first.commands[0].expect, '')
})

// --- Substitution ---

test('it puts the skill folder and the base URL in a command, wherever they are', () => {
  const done = substitute('node "<skill-dir>/a.mjs" <base-url>/x && ls "<skill-dir>"', { skillDir: '/kit/skills/mesub-alpha', baseUrl: 'http://localhost:3000' })
  assert.deepEqual(done, { command: 'node "/kit/skills/mesub-alpha/a.mjs" http://localhost:3000/x && ls "/kit/skills/mesub-alpha"', missing: [] })
})

test('it names the placeholder it has no value for', () => {
  const done = substitute('curl <base-url>/x', { skillDir: '/kit/skills/mesub-alpha' })
  assert.deepEqual(done.missing, ['<base-url>'])
})

// --- Running ---

test('exit 0 when every command passes, each one reported', () => {
  const { root, project } = setup(bash('# Is true', 'true', '# The skill is where the kit keeps it', 'test -f "<skill-dir>/SKILL.md"'))
  const { code, out } = run(root, ['mesub-alpha', project])
  assert.equal(code, 0, out)
  assert.match(out, /^PASS {2}prompt 1: Is true$/m)
  assert.match(out, /^PASS {2}prompt 1: The skill is where the kit keeps it$/m)
  assert.match(out, /2 passed, 0 failed, 0 skipped/)
})

test('exit 1 when a command fails, and the others still run', () => {
  const { root, project } = setup(bash('# Says why and fails', 'echo broken-here && exit 3', '# Still runs', 'true'))
  const { code, out } = run(root, ['mesub-alpha', project])
  assert.equal(code, 1)
  assert.match(out, /^FAIL {2}prompt 1: Says why and fails \(exit 3\)$/m)
  assert.match(out, /evals\/mesub-alpha\.md:\d+/)
  assert.match(out, /broken-here/)
  assert.match(out, /^PASS {2}prompt 1: Still runs$/m)
  assert.match(out, /1 passed, 1 failed, 0 skipped/)
})

test('commands run in the project folder', () => {
  const { root, project } = setup(bash('# The project holds its marker', 'test -f marker.txt'))
  assert.equal(run(root, ['mesub-alpha', project]).code, 1)
  writeFileSync(join(project, 'marker.txt'), '')
  assert.equal(run(root, ['mesub-alpha', project]).code, 0)
})

test('a check against the running app is skipped without --base-url, and run with it', () => {
  const { root, project } = setup(bash('# The URL is the one given', 'test "<base-url>" = "http://localhost:4010"'))
  const skipped = run(root, ['mesub-alpha', project])
  assert.equal(skipped.code, 0)
  assert.match(skipped.out, /^SKIP {2}prompt 1: The URL is the one given \(needs --base-url\)$/m)
  assert.match(skipped.out, /0 passed, 0 failed, 1 skipped/)
  const live = run(root, ['mesub-alpha', project, '--base-url', 'http://localhost:4010/'])
  assert.equal(live.code, 0, live.out)
  assert.match(live.out, /1 passed/)
})

test('--skill-dir points the commands at an installed copy of the skill', () => {
  const { root, project } = setup(bash('# The copy is the one used', 'test -f "<skill-dir>/copied.txt"'))
  write(project, '.agents/skills/mesub-alpha/copied.txt', '')
  write(project, '.agents/skills/mesub-alpha/SKILL.md', '# Alpha\n')
  assert.equal(run(root, ['mesub-alpha', project]).code, 1)
  assert.equal(run(root, ['mesub-alpha', project, '--skill-dir', join(project, '.agents/skills/mesub-alpha')]).code, 0)
})

test('--prompt runs one prompt, and says when it holds no command', () => {
  const { root, project } = setup(bash('# Fails', 'false'), 'Nothing can be checked mechanically.', bash('# Passes', 'true'))
  assert.equal(run(root, ['mesub-alpha', project]).code, 1)
  const third = run(root, ['mesub-alpha', project, '--prompt', '3'])
  assert.equal(third.code, 0)
  assert.doesNotMatch(third.out, /prompt 1/)
  const second = run(root, ['mesub-alpha', project, '--prompt', '2'])
  assert.equal(second.code, 0)
  assert.match(second.out, /^NONE {2}prompt 2: no command to run/m)
})

test('a command that outlives --timeout fails', () => {
  const { root, project } = setup(bash('# Never ends', 'sleep 5'))
  const { code, out } = run(root, ['mesub-alpha', project, '--timeout', '1'])
  assert.equal(code, 1)
  assert.match(out, /^FAIL {2}prompt 1: Never ends \(timed out after 1 s\)$/m)
})

test('exit 2, naming the file, on what it cannot run', () => {
  const { root, project } = setup(bash('# Passes', 'true'))
  const cases = [
    [[], /usage/i],
    [['mesub-alpha'], /usage/i],
    [['mesub-omega', project], /mesub-omega.*catalog\.yaml/],
    [['mesub-gamma', project], /planned/],
    [['mesub-beta', project], /evals\/mesub-beta\.md/],
    [['mesub-alpha', join(project, 'nope')], /nope.*not a folder/],
    [['mesub-alpha', project, '--prompt', '9'], /evals\/mesub-alpha\.md.*prompt 9/],
    [['mesub-alpha', project, '--prompt', 'two'], /--prompt/],
    [['mesub-alpha', project, '--base-url', 'localhost'], /--base-url/],
    [['mesub-alpha', project, '--base-url', 'http://localhost:3000/$(id)'], /--base-url/],
    [['mesub-alpha', project, '--skill-dir', join(project, 'missing')], /missing.*SKILL\.md/],
    [['mesub-alpha', project, '--nope'], /--nope/],
  ]
  for (const [argv, message] of cases) {
    const { code, out } = run(root, argv)
    assert.equal(code, 2, `${argv.join(' ')}\n${out}`)
    assert.match(out, message, argv.join(' '))
  }
})

test('--help answers the usage and exits 0', () => {
  const { code, out } = run(makeKit(), ['--help'])
  assert.equal(code, 0)
  assert.match(out, /^Usage: node scripts\/run-eval-checks\.mjs <skill-id> <project-dir>/)
})

test('the command line exits with the same codes', () => {
  assert.match(execFileSync('node', [CLI, '--help'], { encoding: 'utf8' }), /^Usage:/)
  assert.equal(spawnSync('node', [CLI, '--nope'], { encoding: 'utf8' }).status, 2)
  // This repository's own eval, on a project that holds nothing: its checks fail.
  const empty = mkdtempSync(join(tmpdir(), 'mesub-project-'))
  const ran = spawnSync('node', [CLI, 'mesub-webhooks', empty, '--prompt', '1'], { encoding: 'utf8' })
  assert.equal(ran.status, 1, ran.stdout + ran.stderr)
  assert.match(ran.stdout, /^FAIL {2}prompt 1:/m)
})
