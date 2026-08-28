import { test } from 'node:test'
import assert from 'node:assert/strict'
import { seatAgents, rosterSummary, statusLook } from './agents.js'
import { deskLayout } from './layout.js'

const names = deskLayout().map((d) => d.name)
const agent = (name, status = 'working') => ({ sessionId: name, name, status })

test('the main agent takes the main desk even when it started last', () => {
  const others = [agent('one'), agent('two')]
  const main = { ...agent('workspace'), isMain: true }
  const seating = seatAgents([...others, main], names, 'Main Agent')
  assert.equal(seating.get('Main Agent').name, 'workspace')
  const rest = names.filter((n) => n !== 'Main Agent')
  assert.equal(seating.get(rest[0]).name, 'one')
  assert.equal(seating.get(rest[1]).name, 'two')
  // The main agent is seated once, not also among the others.
  assert.equal([...seating.values()].filter((a) => a.name === 'workspace').length, 1)
})

test('with no main agent the main desk falls back to the oldest session', () => {
  const seating = seatAgents([agent('one'), agent('two'), agent('three')], names, 'Main Agent')
  assert.equal(seating.get('Main Agent').name, 'one')
  const rest = names.filter((n) => n !== 'Main Agent')
  assert.equal(seating.get(rest[0]).name, 'two')
  assert.equal(seating.get(rest[1]).name, 'three')
  assert.equal(seating.size, 3)
})

test('more agents than desks leaves the extras unseated, never overwrites a desk', () => {
  const many = Array.from({ length: names.length + 4 }, (_, i) => agent(`a${i}`))
  const seating = seatAgents(many, names, 'Main Agent')
  assert.equal(seating.size, names.length)
  assert.equal(new Set([...seating.values()].map((a) => a.name)).size, names.length)
})

test('no agents means no desks are seated', () => {
  assert.equal(seatAgents([], names, 'Main Agent').size, 0)
})

test('roster summary counts each status', () => {
  assert.equal(rosterSummary([]), 'No Claude sessions running')
  assert.equal(rosterSummary([agent('a')]), '1 session · 1 working')
  assert.equal(
    rosterSummary([agent('a'), agent('b', 'idle'), agent('c', 'away')]),
    '3 sessions · 1 working · 1 idle · 1 away'
  )
})

test('an unknown status falls back to the empty-desk look', () => {
  assert.equal(statusLook('nonsense'), statusLook('empty'))
  assert.ok(statusLook('working').intensity > statusLook('idle').intensity)
})
