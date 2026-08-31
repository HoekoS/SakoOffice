import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readAgents, projectSlug, statusFor } from './claude-agents.js'

function fixture(sessions, transcripts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sako-agents-'))
  fs.mkdirSync(path.join(dir, 'sessions'), { recursive: true })
  for (const [name, session] of Object.entries(sessions)) {
    fs.writeFileSync(path.join(dir, 'sessions', `${name}.json`), JSON.stringify(session))
  }
  for (const [sessionId, { cwd, mtime }] of Object.entries(transcripts)) {
    const projectDir = path.join(dir, 'projects', projectSlug(cwd))
    fs.mkdirSync(projectDir, { recursive: true })
    const file = path.join(projectDir, `${sessionId}.jsonl`)
    fs.writeFileSync(file, '{}\n')
    fs.utimesSync(file, mtime / 1000, mtime / 1000)
  }
  return dir
}

test('a Windows project path flattens to its transcript folder name', () => {
  assert.equal(
    projectSlug('C:\\Users\\Formulatrix\\Documents\\Data\\Projek\\SakoOffice'),
    'C--Users-Formulatrix-Documents-Data-Projek-SakoOffice'
  )
})

test('activity age decides the status', () => {
  const now = 1_000_000
  assert.equal(statusFor(now - 1_000, now), 'working')
  assert.equal(statusFor(now - 120_000, now), 'idle')
  assert.equal(statusFor(now - 3_600_000, now), 'away')
})

test('live sessions are listed oldest first, dead pids dropped', () => {
  const cwd = 'C:\\work\\alpha'
  const now = 1_000_000
  const dir = fixture(
    {
      100: { pid: 100, sessionId: 'aaa', cwd, startedAt: 500, name: 'alpha-1' },
      200: { pid: 200, sessionId: 'bbb', cwd, startedAt: 100, name: 'beta-2' },
      300: { pid: 300, sessionId: 'ccc', cwd, startedAt: 900, name: 'ghost-3' },
    },
    {
      aaa: { cwd, mtime: now - 1_000 },
      bbb: { cwd, mtime: now - 120_000 },
    }
  )

  const agents = readAgents({ dir, now, isAlive: (pid) => pid !== 300 })

  assert.deepEqual(
    agents.map((a) => a.name),
    ['beta-2', 'alpha-1']
  )
  assert.equal(agents[0].project, 'alpha')
  assert.equal(agents[1].lastActive, now - 1_000)
  assert.equal(agents[1].status, 'working')
  assert.equal(agents[0].status, 'idle')
})

test('the session running in the workspace is flagged as the main agent', () => {
  const dir = fixture({
    1: { pid: 1, sessionId: 'aaa', cwd: 'C:\\work\\alpha', startedAt: 1, name: 'other' },
    2: { pid: 2, sessionId: 'bbb', cwd: 'C:\\work\\HERE', startedAt: 2, name: 'mine' },
  })
  const agents = readAgents({ dir, now: 5_000, isAlive: () => true, workspace: 'C:\\work\\here\\' })
  assert.deepEqual(
    agents.map((a) => [a.name, a.isMain]),
    [
      ['other', false],
      ['mine', true],
    ]
  )
})

test('without pid checks, stale session files are dropped on age', () => {
  const cwd = 'C:\\work\\alpha'
  // A real epoch: file mtimes ten hours back have to stay above zero.
  const now = Date.parse('2026-08-29T10:00:00.000Z')
  const dir = fixture(
    {
      1: { pid: 1, sessionId: 'fresh', cwd, startedAt: 1, name: 'fresh' },
      2: { pid: 2, sessionId: 'stale', cwd, startedAt: 2, name: 'stale' },
    },
    {
      fresh: { cwd, mtime: now - 60_000 },
      stale: { cwd, mtime: now - 10 * 60 * 60_000 },
    }
  )

  // Every pid "alive", as it looks from inside a container reading a mount.
  const all = readAgents({ dir, now, isAlive: () => true })
  assert.deepEqual(all.map((a) => a.name), ['fresh', 'stale'])

  const recent = readAgents({ dir, now, isAlive: () => true, maxIdleMs: 6 * 60 * 60_000 })
  assert.deepEqual(recent.map((a) => a.name), ['fresh'])
})

test('a session with no transcript yet falls back to its start time', () => {
  const dir = fixture({
    77: { pid: 77, sessionId: 'zzz', cwd: 'C:\\work\\beta', startedAt: 4_000, name: 'fresh' },
  })
  const [agent] = readAgents({ dir, now: 5_000, isAlive: () => true })
  assert.equal(agent.lastActive, 4_000)
  assert.equal(agent.status, 'working')
})

test('a missing .claude directory yields no agents instead of throwing', () => {
  assert.deepEqual(readAgents({ dir: path.join(os.tmpdir(), 'sako-does-not-exist') }), [])
})
