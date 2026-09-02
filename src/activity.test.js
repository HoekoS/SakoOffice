import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bubbleText, refineStatus, toolLabel } from './activity.js'

test('a running tool becomes a verb, an unknown tool keeps its name', () => {
  assert.equal(bubbleText({ phase: 'tool', tool: 'Edit' }), 'editing')
  assert.equal(bubbleText({ phase: 'tool', tool: 'Bash' }), 'running a command')
  assert.equal(bubbleText({ phase: 'tool', tool: 'NotebookEdit' }), 'using NotebookEdit')
  assert.equal(bubbleText({ phase: 'tool', tool: null }), 'using a tool')
})

test('an MCP tool loses its server prefix, which is too long to fit a bubble', () => {
  // Real names seen from this machine's hooks.
  assert.equal(toolLabel('mcp__Claude_Browser__javascript_tool'), 'using javascript tool')
  assert.equal(toolLabel('mcp__ccd_session__mark_chapter'), 'using mark chapter')
  assert.equal(toolLabel('mcp__visualize__show_widget'), 'using show widget')
  // A plain tool is untouched, and a known one still wins.
  assert.equal(toolLabel('NotebookEdit'), 'using NotebookEdit')
  assert.equal(toolLabel('Edit'), 'editing')
  assert.equal(toolLabel(null), 'using a tool')
})

test('the phases between tools each get their own line, and nothing else does', () => {
  assert.equal(bubbleText({ phase: 'thinking' }), 'thinking…')
  assert.equal(bubbleText({ phase: 'waiting' }), 'waiting for you')
  assert.equal(bubbleText({ phase: 'arrived' }), 'just got in')
  assert.equal(bubbleText({ phase: 'left' }), null)
  assert.equal(bubbleText(undefined), null)
})

test('fresh activity overrides the polled status, stale activity does not', () => {
  const now = 100_000
  assert.equal(refineStatus('idle', { phase: 'tool', at: now - 1000 }, now), 'working')
  assert.equal(refineStatus('working', { phase: 'waiting', at: now - 1000 }, now), 'idle')
  assert.equal(refineStatus('away', { phase: 'arrived', at: now - 1000 }, now), 'away')
  assert.equal(refineStatus('idle', { phase: 'tool', at: now - 90_000 }, now), 'idle')
  assert.equal(refineStatus('idle', undefined, now), 'idle')
})
