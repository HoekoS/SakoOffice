import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chooseActivity, activitySet, shouldRedecide, ACTIVITIES } from './behavior.js'

/** Feeds a fixed sequence of rolls, then repeats the last one. */
const rolls = (...values) => {
  let i = 0
  return () => values[Math.min(i++, values.length - 1)]
}

test('a working agent only ever goes to their desk or a meeting', () => {
  for (let roll = 0; roll < 1; roll += 0.02) {
    const { kind } = chooseActivity('working', rolls(roll, 0.5))
    assert.ok(['desk', 'meeting'].includes(kind), `working produced ${kind}`)
  }
})

test('an idle or away agent is free to roam', () => {
  for (const status of ['idle', 'away', 'anything-else']) {
    for (let roll = 0; roll < 1; roll += 0.02) {
      const { kind } = chooseActivity(status, rolls(roll, 0.5))
      assert.ok(['pantry', 'wander', 'linger'].includes(kind), `${status} produced ${kind}`)
    }
  }
})

test('the weights favour desk work and the roll picks each option in turn', () => {
  assert.equal(chooseActivity('working', rolls(0.1, 0)).kind, 'desk')
  assert.equal(chooseActivity('working', rolls(0.95, 0)).kind, 'meeting')
  assert.equal(chooseActivity('idle', rolls(0.1, 0)).kind, 'pantry')
  assert.equal(chooseActivity('idle', rolls(0.5, 0)).kind, 'wander')
  assert.equal(chooseActivity('idle', rolls(0.95, 0)).kind, 'linger')
})

test('a duration spans exactly its own range, never another activity\'s', () => {
  for (const status of ['working', 'idle']) {
    for (const spec of activitySet(status)) {
      // Roll just far enough into this option's slice to select it.
      const slice =
        activitySet(status)
          .slice(0, activitySet(status).indexOf(spec))
          .reduce((sum, o) => sum + o.weight, 0) + 0.5
      const total = activitySet(status).reduce((sum, o) => sum + o.weight, 0)
      const select = slice / total

      const shortest = chooseActivity(status, rolls(select, 0))
      const longest = chooseActivity(status, rolls(select, 0.999))
      assert.equal(shortest.kind, spec.kind)
      assert.equal(shortest.duration, spec.min)
      assert.ok(longest.duration > spec.min && longest.duration <= spec.max)
    }
  }
})

test('a status change interrupts whatever the person was doing', () => {
  const person = { status: 'idle', busyUntil: 10_000 }
  assert.ok(shouldRedecide(person, 'working', 0))
  assert.ok(!shouldRedecide(person, 'idle', 0))
  assert.ok(shouldRedecide(person, 'idle', 10_000))
})
