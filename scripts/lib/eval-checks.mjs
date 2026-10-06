// The mechanical part of an eval: the commands under each "### Checks" of an eval
// file, read, given their placeholders and run in a project.
import { spawnSync } from 'node:child_process'

/** What a command may hold, and the option that gives each its value. */
export const PLACEHOLDERS = { '<skill-dir>': '--skill-dir', '<base-url>': '--base-url' }

const SHELLS = ['', 'bash', 'sh', 'shell']

/**
 * @typedef {{ command: string, expect: string, line: number }} Check
 * command: as written, placeholders included. expect: the comment above it. line: 1-based.
 * @typedef {{ number: number, title: string, commands: Check[] }} PromptChecks
 */

/**
 * Every prompt of an eval file with the commands of its Checks part.
 * @param {string} content
 * @returns {PromptChecks[]}
 */
export function extractChecks(content) {
  /** @type {PromptChecks[]} */
  const prompts = []
  let current = null
  let inChecks = false
  let fence = null
  let expect = []
  let command = null

  content.split('\n').forEach((raw, index) => {
    const mark = raw.match(/^\s*(```+|~~~+)\s*(\S*)/)
    if (fence === null) {
      if (mark) {
        fence = { mark: mark[1], shell: SHELLS.includes(mark[2]) }
        expect = []
        return
      }
      const heading = raw.match(/^## Prompt (\d+): (.+?)\s*$/)
      if (heading) {
        current = { number: Number(heading[1]), title: heading[2], commands: [] }
        prompts.push(current)
        inChecks = false
      } else if (/^### /.test(raw)) {
        inChecks = /^### Checks\s*$/.test(raw)
      } else if (/^##? /.test(raw)) {
        current = null
        inChecks = false
      }
      return
    }
    if (mark && mark[1].startsWith(fence.mark) && mark[2] === '') {
      fence = null
      command = null
      return
    }
    if (!current || !inChecks || !fence.shell) return

    if (command) {
      command.command += `\n${raw}`
    } else if (raw.trim() === '') {
      expect = []
      return
    } else if (/^\s*#/.test(raw)) {
      expect.push(raw.replace(/^\s*#\s?/, '').trim())
      return
    } else {
      command = { command: raw.trim(), expect: expect.join(' '), line: index + 1 }
      current.commands.push(command)
      expect = []
    }
    // A trailing backslash carries the command onto the next line.
    if (!/\\\s*$/.test(raw)) command = null
  })
  return prompts
}

/**
 * The command with its placeholders replaced, and the ones no value was given for.
 * @param {string} command
 * @param {{ skillDir?: string, baseUrl?: string }} values
 * @returns {{ command: string, missing: string[] }}
 */
export function substitute(command, values) {
  const given = { '<skill-dir>': values.skillDir, '<base-url>': values.baseUrl }
  const missing = []
  let out = command
  for (const [placeholder, value] of Object.entries(given)) {
    if (!out.includes(placeholder)) continue
    if (value === undefined) missing.push(placeholder)
    else out = out.split(placeholder).join(value)
  }
  return { command: out, missing }
}

/**
 * Runs one command with a shell, in the project. A pass is exit 0.
 * @param {string} command
 * @param {{ cwd: string, timeoutMs: number }} options
 * @returns {{ ok: boolean, why: string, output: string }}
 */
export function runCommand(command, { cwd, timeoutMs }) {
  const result = spawnSync('/bin/sh', ['-c', command], {
    cwd,
    encoding: 'utf8',
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trimEnd()
  if (result.error?.code === 'ETIMEDOUT') return { ok: false, why: `timed out after ${timeoutMs / 1000} s`, output }
  if (result.error) return { ok: false, why: result.error.message, output }
  if (result.status === 0) return { ok: true, why: '', output }
  return { ok: false, why: result.status === null ? `killed by ${result.signal}` : `exit ${result.status}`, output }
}
