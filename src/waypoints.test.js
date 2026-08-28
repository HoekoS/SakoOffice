import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildGraph, findPath, crossesWall, nearestNode, STATIC_NODES } from './waypoints.js'
import { MEETING_ROOM, PANTRY } from './layout.js'

const graph = buildGraph()

test('a line through solid partition is blocked, through a doorway is not', () => {
  assert.ok(crossesWall({ x: 1.6, z: -6 }, { x: 4, z: -6 }))
  assert.ok(!crossesWall({ x: 1.6, z: MEETING_ROOM.doorZ }, { x: 4, z: MEETING_ROOM.doorZ }))
  assert.ok(!crossesWall({ x: 1.6, z: PANTRY.doorZ }, { x: 4, z: PANTRY.doorZ }))
})

test('the meeting room and the pantry have no door between them', () => {
  assert.ok(crossesWall({ x: 7, z: -3 }, { x: 7, z: 3 }))
})

test('walking inside one area never trips the wall check', () => {
  assert.ok(!crossesWall({ x: -10, z: -6 }, { x: -2, z: 6 }))
})

test('every node is reachable from the office', () => {
  const start = 'office:-10.5:-6.5'
  for (const node of STATIC_NODES) {
    assert.ok(findPath(graph, start, node.id), `no path to ${node.id}`)
  }
})

test('a diagonal that merely clips the opening is not a way through', () => {
  assert.ok(crossesWall({ x: -2, z: 2 }, { x: 3.4, z: PANTRY.doorZ }))
})

test('the route from the office into the pantry goes through the pantry door', () => {
  const path = findPath(graph, 'office:-10.5:-6.5', 'pantry:counter')
  assert.ok(path.includes('office:pantry-door'), `landing skipped: ${path.join(' > ')}`)
  assert.ok(path.includes('pantry:door'))
  // Every hop stays on the walkable side of the glass.
  for (let i = 1; i < path.length; i++) {
    const a = graph.nodes.get(path[i - 1])
    const b = graph.nodes.get(path[i])
    assert.ok(!crossesWall(a, b), `hop ${a.id}->${b.id} crosses a wall`)
  }
})

test('getting from the meeting room to the pantry means leaving through both doors', () => {
  const path = findPath(graph, 'meeting:table', 'pantry:table')
  assert.ok(path.includes('meeting:door'))
  assert.ok(path.includes('pantry:door'))
})

test('extra nodes join the graph and inherit the wall rules', () => {
  const seat = { id: 'seat:test', x: -8, z: 0.9, area: 'office' }
  const withSeat = buildGraph([seat])
  assert.ok(findPath(withSeat, seat.id, 'pantry:table'))
  assert.equal(nearestNode(withSeat, -8, 1, 'office').id, 'seat:test')
})

test('an unknown node id yields no path instead of throwing', () => {
  assert.equal(findPath(graph, 'office:-2:2', 'nowhere'), null)
})
