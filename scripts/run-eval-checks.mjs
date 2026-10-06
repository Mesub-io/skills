#!/usr/bin/env node
// Usage: node scripts/run-eval-checks.mjs <skill-id> <project-dir> [--prompt <n>] [--base-url <url>] [--skill-dir <path>] [--timeout <seconds>]
// Runs, in <project-dir>, the commands under each "### Checks" of evals/<skill-id>.md.
// Prints PASS, FAIL, SKIP or NONE per command. Exits 0 when none failed, 1 when one did,
// 2 on arguments it cannot use. It runs what the eval file says and nothing else: it starts
// no agent and no server, and judges no checklist line.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { isShipped, loadCatalog, skillById } from './lib/catalog.mjs'
import { extractChecks, runCommand, substitute } from './lib/eval-checks.mjs'

const USAGE = `Usage: node scripts/run-eval-checks.mjs <skill-id> <project-dir> [options]

Runs, in <project-dir>, the commands under each "### Checks" of evals/<skill-id>.md.
A command passes when it exits 0.

  --prompt <n>         run the checks of one prompt only
  --base-url <url>     where the project's app is running, for the commands that hold
                       <base-url>. Without it they are skipped, not failed
  --skill-dir <path>   the skill's folder, for the commands that hold <skill-dir>.
                       Default: skills/<skill-id> of this kit
  --timeout <seconds>  how long one command may take. Default: 120
  --help               show this text

Exit 0: no command failed. Exit 1: at least one did. Exit 2: arguments not understood.`

// What would end a double-quoted argument or start a substitution in the shell.
const UNSAFE = /["`$\\]/

class UsageError extends Error {}

/**
 * @param {string} root The kit's root folder.
 * @param {string[]} argv
 * @param {(line: string) => void} [print]
 * @returns {number} The exit code.
 */
export function runEvalChecks(root, argv, print = console.log) {
  try {
    return run(root, argv, print)
  } catch (error) {
    if (!(error instanceof UsageError)) throw error
    print(`${error.message}\n\n${USAGE}`)
    return 2
  }
}

function run(root, argv, print) {
  let parsed
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        prompt: { type: 'string' },
        'base-url': { type: 'string' },
        'skill-dir': { type: 'string' },
        timeout: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    })
  } catch (error) {
    throw new UsageError(error.message)
  }
  const { values, positionals } = parsed
  if (values.help) {
    print(USAGE)
    return 0
  }
  if (positionals.length !== 2) throw new UsageError('usage: give a skill id and a project folder')
  const [id, projectArg] = positionals

  const skill = skillById(loadCatalog(root), id)
  if (!skill) throw new UsageError(`"${id}" is not a skill of catalog.yaml`)
  if (!isShipped(skill)) throw new UsageError(`"${id}" is only planned in catalog.yaml: it has no eval to run`)
  const file = `evals/${id}.md`
  if (!existsSync(join(root, file))) throw new UsageError(`${file} does not exist: this skill has no eval yet`)

  const project = resolve(projectArg)
  if (!existsSync(project) || !statSync(project).isDirectory()) throw new UsageError(`${projectArg} is not a folder`)

  const skillDir = resolve(values['skill-dir'] ?? join(root, 'skills', id))
  if (!existsSync(join(skillDir, 'SKILL.md'))) throw new UsageError(`${skillDir} holds no SKILL.md: --skill-dir is the skill's own folder`)
  if (UNSAFE.test(skillDir)) throw new UsageError(`--skill-dir: ${skillDir} holds a character the shell reads inside quotes`)

  let baseUrl
  if (values['base-url'] !== undefined) {
    if (!/^https?:\/\/[^/\s]+\S*$/.test(values['base-url']) || /['\s]/.test(values['base-url']) || UNSAFE.test(values['base-url'])) {
      throw new UsageError('--base-url must be an http(s) URL with nothing the shell reads, such as http://localhost:3000')
    }
    baseUrl = values['base-url'].replace(/\/+$/, '')
  }

  const seconds = values.timeout === undefined ? 120 : Number(values.timeout)
  if (!Number.isFinite(seconds) || seconds <= 0) throw new UsageError('--timeout must be a number of seconds above 0')

  let prompts = extractChecks(readFileSync(join(root, file), 'utf8'))
  if (values.prompt !== undefined) {
    if (!/^[1-9]\d*$/.test(values.prompt)) throw new UsageError('--prompt must be the number of a prompt, from 1')
    prompts = prompts.filter((prompt) => prompt.number === Number(values.prompt))
    if (prompts.length === 0) throw new UsageError(`${file} has no prompt ${values.prompt}`)
  }

  print(`${file} in ${project}`)
  const count = { PASS: 0, FAIL: 0, SKIP: 0 }
  for (const prompt of prompts) {
    const label = `prompt ${prompt.number}`
    if (prompt.commands.length === 0) {
      print(`NONE  ${label}: no command to run, its lines are checked by reading`)
      continue
    }
    for (const check of prompt.commands) {
      const what = check.expect || check.command.split('\n')[0]
      const { command, missing } = substitute(check.command, { skillDir, baseUrl })
      if (missing.length > 0) {
        count.SKIP += 1
        print(`SKIP  ${label}: ${what} (needs ${missing.map((name) => `--${name.slice(1, -1)}`).join(', ')})`)
        continue
      }
      const result = runCommand(command, { cwd: project, timeoutMs: seconds * 1000 })
      if (result.ok) {
        count.PASS += 1
        print(`PASS  ${label}: ${what}`)
        continue
      }
      count.FAIL += 1
      print(`FAIL  ${label}: ${what} (${result.why})`)
      print(`      ${file}:${check.line}`)
      for (const line of `$ ${command}${result.output ? `\n${result.output}` : ''}`.split('\n')) print(`      ${line}`)
    }
  }
  print(`\n${count.PASS} passed, ${count.FAIL} failed, ${count.SKIP} skipped`)
  return count.FAIL > 0 ? 1 : 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  process.exitCode = runEvalChecks(root, process.argv.slice(2))
}
