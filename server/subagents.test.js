import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { countActiveSubagents, countActiveSubagentsCached, readTail } from './subagents.js'

const NOW = Date.parse('2026-08-29T10:00:00.000Z')
const at = (secondsAgo) => new Date(NOW - secondsAgo * 1000).toISOString()

function transcript(entries) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sako-sidechain-'))
  const file = path.join(dir, 'session.jsonl')
  fs.writeFileSync(file, entries.map((e) => JSON.stringify(e)).join('\n') + '\n')
  return file
}

const main = (uuid, secondsAgo) => ({ uuid, parentUuid: null, isSidechain: false, timestamp: at(secondsAgo) })
const side = (uuid, parentUuid, secondsAgo) => ({
  uuid,
  parentUuid,
  isSidechain: true,
  timestamp: at(secondsAgo),
})

test('a transcript with no subagents counts none', () => {
  const file = transcript([main('a', 10), main('b', 5)])
  assert.equal(countActiveSubagents(file, NOW), 0)
})

test('one chain of many entries is still one subagent', () => {
  const file = transcript([
    main('task-call', 30),
    side('s1', 'task-call', 25),
    side('s2', 's1', 20),
    side('s3', 's2', 5),
  ])
  assert.equal(countActiveSubagents(file, NOW), 1)
})

test('two chains off the main thread are two subagents', () => {
  const file = transcript([
    main('call-a', 40),
    main('call-b', 39),
    side('a1', 'call-a', 30),
    side('a2', 'a1', 10),
    side('b1', 'call-b', 12),
  ])
  assert.equal(countActiveSubagents(file, NOW), 2)
})

test('a chain that went quiet drops out of the window', () => {
  const file = transcript([
    main('call-a', 400),
    side('a1', 'call-a', 300),
    main('call-b', 60),
    side('b1', 'call-b', 20),
  ])
  assert.equal(countActiveSubagents(file, NOW), 1)
  // Widen the window and the older one comes back.
  assert.equal(countActiveSubagents(file, NOW, 600_000), 2)
})

test('a chain whose start scrolled out of the tail still counts once', () => {
  const file = transcript([side('orphan1', 'long-gone', 20), side('orphan2', 'orphan1', 10)])
  assert.equal(countActiveSubagents(file, NOW), 1)
})

test('the cached count decays over time without re-reading an unchanged file', () => {
  const file = transcript([main('call-a', 80), side('a1', 'call-a', 70)])
  // Same mtime both calls — the count still has to drop as `now` moves on.
  const mtime = 12345
  assert.equal(countActiveSubagentsCached(file, mtime, NOW), 1)
  assert.equal(countActiveSubagentsCached(file, mtime, NOW + 20_000), 0)
})

test('a cached result is thrown away once the mtime moves', () => {
  const file = transcript([main('call-a', 30), side('a1', 'call-a', 20)])
  assert.equal(countActiveSubagentsCached(file, 1, NOW), 1)

  // Overwrite with no subagents, same mtime as before — the stale cache wins.
  fs.writeFileSync(file, JSON.stringify(main('call-b', 5)) + '\n')
  assert.equal(countActiveSubagentsCached(file, 1, NOW), 1)

  // A new mtime forces the reparse, which now sees the emptied file.
  assert.equal(countActiveSubagentsCached(file, 2, NOW), 0)
})

test('a missing or unreadable file counts none instead of throwing', () => {
  assert.equal(readTail(path.join(os.tmpdir(), 'sako-no-such-file.jsonl')), '')
  assert.equal(countActiveSubagents(path.join(os.tmpdir(), 'sako-no-such-file.jsonl'), NOW), 0)
})

test('a half-written line at the head of the tail is skipped, not fatal', () => {
  const file = transcript([main('a', 30), side('s1', 'a', 10)])
  const full = fs.readFileSync(file, 'utf8')
  fs.writeFileSync(file, '{"uuid":"trunc' + '\n' + full)
  assert.equal(countActiveSubagents(file, NOW), 1)
})
