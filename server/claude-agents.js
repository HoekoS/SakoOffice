// Reads the live Claude Code sessions off disk. Node-only, no dependencies.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { countActiveSubagents } from './subagents.js'

export const CLAUDE_DIR = path.join(os.homedir(), '.claude')

export const WORKING_WINDOW_MS = 45_000
export const IDLE_WINDOW_MS = 15 * 60_000

/** Claude stores transcripts under a flattened form of the project's path. */
export function projectSlug(cwd) {
  return cwd.replace(/[:\\/]/g, '-')
}

/** A session file outlives its process, so ask the OS whether the pid is still there. */
export function pidAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM means the process exists but belongs to someone else.
    return error.code === 'EPERM'
  }
}

export function statusFor(lastActive, now) {
  const age = now - lastActive
  if (age < WORKING_WINDOW_MS) return 'working'
  if (age < IDLE_WINDOW_MS) return 'idle'
  return 'away'
}

/** Windows paths differ in case and trailing slash but mean the same folder. */
export function samePath(a, b) {
  if (!a || !b) return false
  const clean = (p) => path.resolve(p).replace(/[\\/]+$/, '').toLowerCase()
  return clean(a) === clean(b)
}

/**
 * One entry per live session, oldest first.
 * The session running in `workspace` is the main agent — it gets the main desk.
 * `isAlive` is injectable so tests don't depend on real pids.
 */
export function readAgents({
  dir = CLAUDE_DIR,
  now = Date.now(),
  isAlive = pidAlive,
  workspace = process.cwd(),
} = {}) {
  const sessionsDir = path.join(dir, 'sessions')
  let files = []
  try {
    files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('.json'))
  } catch {
    return []
  }

  const agents = []
  for (const file of files) {
    let session
    try {
      session = JSON.parse(fs.readFileSync(path.join(sessionsDir, file), 'utf8'))
    } catch {
      continue
    }
    if (!session.sessionId || !session.cwd) continue
    if (!isAlive(session.pid)) continue

    const transcript = path.join(dir, 'projects', projectSlug(session.cwd), `${session.sessionId}.jsonl`)
    let lastActive = session.startedAt ?? 0
    let subagents = 0
    try {
      lastActive = Math.max(lastActive, fs.statSync(transcript).mtimeMs)
      subagents = countActiveSubagents(transcript, now)
    } catch {
      // No transcript yet — the session has only just started.
    }

    agents.push({
      sessionId: session.sessionId,
      name: session.name ?? session.sessionId.slice(0, 8),
      cwd: session.cwd,
      project: path.basename(session.cwd),
      kind: session.kind ?? 'interactive',
      entrypoint: session.entrypoint ?? 'unknown',
      startedAt: session.startedAt ?? 0,
      lastActive,
      status: statusFor(lastActive, now),
      isMain: samePath(session.cwd, workspace),
      subagents,
    })
  }

  return agents.sort((a, b) => a.startedAt - b.startedAt)
}
