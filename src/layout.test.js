import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  gridPositions,
  deskLayout,
  meetingSeats,
  wallSpans,
  pantrySeats,
  facingRotation,
  MEETING_ROOM,
  PANTRY,
} from './layout.js'

test('gridPositions is centered and row-major', () => {
  const g = gridPositions(2, 3, 2, 4)
  assert.equal(g.length, 6)
  assert.deepEqual(
    g.map((p) => p.x),
    [-2, 0, 2, -2, 0, 2]
  )
  assert.deepEqual(
    g.map((p) => p.z),
    [-2, -2, -2, 2, 2, 2]
  )
  assert.equal(g[4].index, 4)
  assert.equal(g[4].row, 1)
  assert.equal(g[4].col, 1)
})

test('single cell sits at the origin', () => {
  assert.deepEqual(gridPositions(1, 1, 5, 5)[0].x, 0)
  assert.deepEqual(gridPositions(1, 1, 5, 5)[0].z, 0)
})

test('desks get unique names and stay inside the room', () => {
  const desks = deskLayout()
  assert.equal(desks.length, 9)
  assert.equal(new Set(desks.map((d) => d.name)).size, 9)
  assert.equal(desks[0].name, 'Desk A1')
  assert.ok(desks.every((d) => Math.abs(d.x) < 12 && Math.abs(d.z) < 9))
})

test('exactly one desk belongs to the main agent, turned a quarter clockwise', () => {
  const mains = deskLayout().filter((d) => d.main)
  assert.equal(mains.length, 1)
  assert.equal(mains[0].name, 'Main Agent')
  assert.equal(mains[0].row, 1)
  assert.equal(mains[0].col, 0)
  assert.equal(mains[0].rotation, -Math.PI / 2)
})

// A desk looks down its local -z, which rotation θ sends to (-sin θ, -cos θ).
const heading = (desk) => ({ x: -Math.sin(desk.rotation), z: -Math.cos(desk.rotation) })
const dotToward = (desk, tx, tz) => {
  const h = heading(desk)
  const dx = tx - desk.x
  const dz = tz - desk.z
  return (h.x * dx + h.z * dz) / Math.hypot(dx, dz)
}

test("desks in the main agent's row are turned toward their station", () => {
  const desks = deskLayout()
  const main = desks.find((d) => d.main)
  const row = desks.filter((d) => d.row === main.row && !d.main)
  assert.equal(row.length, 2)
  for (const desk of row) {
    assert.ok(dotToward(desk, main.x, main.z) > 0.999, `${desk.name} faces away`)
  }
})

test('the outer rows sit face to face across the aisle', () => {
  const desks = deskLayout()
  const main = desks.find((d) => d.main)
  const outer = desks.filter((d) => d.row !== main.row)
  assert.equal(outer.length, 6)
  for (const desk of outer) {
    // Each looks straight down the aisle, so it stares at its opposite number.
    const partner = outer.find((d) => d.col === desk.col && d.row !== desk.row)
    assert.ok(dotToward(desk, partner.x, partner.z) > 0.999, `${desk.name} faces away`)
    assert.ok(Math.abs(heading(desk).x) < 1e-9, `${desk.name} is not square to the aisle`)
  }
})

test('facingRotation gives the four cardinal headings', () => {
  // Headings wrap, so ±π must compare equal.
  const same = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 1e-9
  // Target north of the desk (-z) is the desk's own resting heading, 0.
  assert.ok(same(facingRotation(0, 0, 0, -1), 0))
  assert.ok(same(facingRotation(0, 0, 0, 1), Math.PI))
  assert.ok(same(facingRotation(0, 0, -1, 0), Math.PI / 2))
  assert.ok(same(facingRotation(0, 0, 1, 0), -Math.PI / 2))
})

test('a doorway splits a wall run in two and removes exactly its own width', () => {
  const spans = wallSpans(-9, 0, -2, 1.7)
  assert.equal(spans.length, 2)
  const solid = spans.reduce((sum, [a, b]) => sum + (b - a), 0)
  assert.ok(Math.abs(solid - (9 - 1.7)) < 1e-9)
  assert.deepEqual(spans, [
    [-9, -2.85],
    [-1.15, 0],
  ])
})

test('a doorway at the very edge leaves one span, and no door leaves the run whole', () => {
  assert.deepEqual(wallSpans(0, 9, 0.85, 1.7), [[1.7, 9]])
  assert.deepEqual(wallSpans(0, 9, null, 1.7), [[0, 9]])
})

test('rooms sit side by side without overlapping and share the divider', () => {
  assert.equal(MEETING_ROOM.z1, PANTRY.z0)
  assert.equal(MEETING_ROOM.x0, PANTRY.x0)
  for (const room of [MEETING_ROOM, PANTRY]) {
    assert.ok(room.doorZ > room.z0 && room.doorZ < room.z1)
  }
})

test('pantry chairs ring the table and every one faces its center', () => {
  const cx = 6.5
  const cz = 4.5
  const seats = pantrySeats(cx, cz, 1.5, 4)
  assert.equal(seats.length, 4)
  for (const seat of seats) {
    assert.ok(Math.abs(Math.hypot(seat.x - cx, seat.z - cz) - 1.5) < 1e-9)
    // Chair forward is (sin, cos) of its rotation; it must point at the table.
    const fx = Math.sin(seat.rotation)
    const fz = Math.cos(seat.rotation)
    const len = Math.hypot(cx - seat.x, cz - seat.z)
    const dot = (fx * (cx - seat.x) + fz * (cz - seat.z)) / len
    assert.ok(dot > 0.999, `seat faces away: dot ${dot}`)
  }
})

test('meeting seats face the table from both sides', () => {
  const s = meetingSeats(6, 0, 3, 1.6, 3)
  assert.equal(s.length, 6)
  assert.ok(s.every((seat) => Math.abs(seat.z) > 0.8))
  assert.equal(new Set(s.map((seat) => seat.rotation)).size, 2)
})
