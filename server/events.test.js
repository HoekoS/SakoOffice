import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { normalizeEvent, applyEvent, createEventHub, readJsonBody } from './events.js'

const NOW = 1_700_000_000_000

test('a hook payload is reduced to its safe fields and tool_input is dropped', () => {
  const event = normalizeEvent(
    {
      hook_event_name: 'PreToolUse',
      session_id: 'abc',
      cwd: 'C:\\work\\x',
      tool_name: 'Edit',
      tool_input: { file_path: 'secret.txt', content: 'do not leak' },
    },
    NOW
  )
  assert.deepEqual(event, { event: 'PreToolUse', sessionId: 'abc', cwd: 'C:\\work\\x', tool: 'Edit', at: NOW })
  assert.ok(!('tool_input' in event))
})

test('unknown events, missing session ids and junk are rejected', () => {
  assert.equal(normalizeEvent({ hook_event_name: 'Whatever', session_id: 'abc' }), null)
  assert.equal(normalizeEvent({ hook_event_name: 'Stop' }), null)
  assert.equal(normalizeEvent({ hook_event_name: 'Stop', session_id: '' }), null)
  assert.equal(normalizeEvent('nope'), null)
  assert.equal(normalizeEvent(null), null)
})

test('the tool is set by PreToolUse and cleared again by PostToolUse', () => {
  let a = applyEvent(undefined, { event: 'SessionStart', sessionId: 's', cwd: 'C:\\w', at: 1 })
  assert.equal(a.phase, 'arrived')
  a = applyEvent(a, { event: 'PreToolUse', sessionId: 's', tool: 'Bash', at: 2 })
  assert.equal(a.tool, 'Bash')
  assert.equal(a.phase, 'tool')
  a = applyEvent(a, { event: 'PostToolUse', sessionId: 's', tool: 'Bash', at: 3 })
  assert.equal(a.tool, null)
  assert.equal(a.phase, 'thinking')
  a = applyEvent(a, { event: 'Stop', sessionId: 's', at: 4 })
  assert.equal(a.phase, 'waiting')
  a = applyEvent(a, { event: 'SessionEnd', sessionId: 's', at: 5 })
  assert.equal(a.phase, 'left')
  assert.equal(a.cwd, 'C:\\w', 'cwd survives events that do not carry one')
})

test('the hub keeps one record per session and forgets stale ones', () => {
  let clock = NOW
  const hub = createEventHub({ now: () => clock, ttlMs: 1000 })
  hub.ingest({ hook_event_name: 'PreToolUse', session_id: 'a', tool_name: 'Read' })
  hub.ingest({ hook_event_name: 'PreToolUse', session_id: 'b', tool_name: 'Grep' })
  hub.ingest({ hook_event_name: 'PostToolUse', session_id: 'a', tool_name: 'Read' })
  assert.equal(hub.snapshot().length, 2)
  assert.equal(hub.activity.get('a').phase, 'thinking')

  clock += 1500
  hub.ingest({ hook_event_name: 'Stop', session_id: 'b' })
  const left = hub.snapshot().map((r) => r.sessionId)
  assert.deepEqual(left, ['b'], 'a went quiet past the ttl, b was just refreshed')
})

test('subscribers get a snapshot on connect and every event after', () => {
  const hub = createEventHub({ now: () => NOW })
  hub.ingest({ hook_event_name: 'PreToolUse', session_id: 'a', tool_name: 'Read' })

  const written = []
  const req = new EventEmitter()
  const res = { writeHead() {}, write: (s) => written.push(s) }
  hub.subscribe(req, res)
  assert.equal(hub.clientCount, 1)
  assert.match(written[0], /"type":"snapshot"/)
  assert.match(written[0], /"sessionId":"a"/)

  hub.ingest({ hook_event_name: 'Stop', session_id: 'a' })
  assert.match(written[1], /"type":"event"/)
  assert.match(written[1], /"phase":"waiting"/)

  req.emit('close')
  assert.equal(hub.clientCount, 0)
})

test('readJsonBody parses a body and refuses an oversized one', async () => {
  const ok = new EventEmitter()
  const parsed = readJsonBody(ok)
  ok.emit('data', Buffer.from('{"a":'))
  ok.emit('data', Buffer.from('1}'))
  ok.emit('end')
  assert.deepEqual(await parsed, { a: 1 })

  const big = new EventEmitter()
  big.destroy = () => {}
  const rejected = readJsonBody(big, 8)
  big.emit('data', Buffer.from('0123456789'))
  await assert.rejects(rejected, /too large/)
})
