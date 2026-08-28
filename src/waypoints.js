// Walkable graph for the floor. People follow it so they never cross glass.
import { MEETING_ROOM, PANTRY, PARTITION } from './layout.js'

const PARTITION_X = MEETING_ROOM.x0
const DIVIDER_Z = MEETING_ROOM.z1
// How far off the door's centre line an endpoint may sit and still count as
// lined up with it. Well under half the opening, so nobody clips the leaf.
const DOOR_ALIGN = Math.min(0.25, PARTITION.doorWidth / 4)

/** Corridor nodes: three aisles across the open office, one along the partition. */
export const STATIC_NODES = []
for (const x of [-10.5, -6, -2, 1.6]) {
  for (const z of [-6.5, -2, 2, 6.5]) {
    STATIC_NODES.push({ id: `office:${x}:${z}`, x, z, area: 'office' })
  }
}
// The office-side landing of each doorway, so crossings are always square-on.
STATIC_NODES.push({ id: 'office:meeting-door', x: 1.6, z: MEETING_ROOM.doorZ, area: 'office' })
STATIC_NODES.push({ id: 'office:pantry-door', x: 1.6, z: PANTRY.doorZ, area: 'office' })
for (const [id, x, z] of [
  ['meeting:door', 3.4, MEETING_ROOM.doorZ],
  ['meeting:hall', 5, -2],
  ['meeting:head', 7.25, -2],
  ['meeting:table', 7.25, -5],
  ['meeting:far', 10, -5],
]) {
  STATIC_NODES.push({ id, x, z, area: 'meeting' })
}
for (const [id, x, z] of [
  ['pantry:door', 3.4, PANTRY.doorZ],
  ['pantry:hall', 5, 2.4],
  ['pantry:table', 5.1, 4.5],
  ['pantry:mid', 8, 4.5],
  ['pantry:counter', 10.6, 4.6],
  ['pantry:fridge', 10.4, 6.6],
]) {
  STATIC_NODES.push({ id, x, z, area: 'pantry' })
}

/**
 * True when the straight line a→b would pass through a wall rather than a door.
 * A doorway only counts when both ends line up with it — a diagonal that merely
 * clips the opening would walk somebody straight into the door leaf.
 */
export function crossesWall(a, b) {
  if ((a.x - PARTITION_X) * (b.x - PARTITION_X) < 0) {
    const squareOn = (doorZ) =>
      Math.abs(a.z - doorZ) < DOOR_ALIGN && Math.abs(b.z - doorZ) < DOOR_ALIGN
    if (!squareOn(MEETING_ROOM.doorZ) && !squareOn(PANTRY.doorZ)) return true
  }
  // The meeting room and the pantry share a solid divider — no way through.
  if (a.x > PARTITION_X && b.x > PARTITION_X && (a.z - DIVIDER_Z) * (b.z - DIVIDER_Z) < 0) {
    return true
  }
  return false
}

/**
 * Connect every pair of nodes that is close enough and not separated by a wall.
 * ponytail: desks are not obstacles — people walk between them, which reads fine.
 */
export function buildGraph(extraNodes = [], maxEdge = 6) {
  const nodes = [...STATIC_NODES, ...extraNodes]
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const edges = new Map(nodes.map((n) => [n.id, []]))

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]
      const b = nodes[j]
      if (Math.hypot(b.x - a.x, b.z - a.z) > maxEdge) continue
      if (crossesWall(a, b)) continue
      edges.get(a.id).push(b.id)
      edges.get(b.id).push(a.id)
    }
  }
  return { nodes: byId, edges }
}

/** Breadth-first hop count is good enough on a grid this even. */
export function findPath(graph, fromId, toId) {
  if (fromId === toId) return [fromId]
  if (!graph.edges.has(fromId) || !graph.edges.has(toId)) return null

  const cameFrom = new Map([[fromId, null]])
  const queue = [fromId]
  while (queue.length > 0) {
    const current = queue.shift()
    for (const next of graph.edges.get(current)) {
      if (cameFrom.has(next)) continue
      cameFrom.set(next, current)
      if (next === toId) {
        const path = [next]
        let step = current
        while (step != null) {
          path.unshift(step)
          step = cameFrom.get(step)
        }
        return path
      }
      queue.push(next)
    }
  }
  return null
}

export function nearestNode(graph, x, z, area) {
  let best = null
  let bestDistance = Infinity
  for (const node of graph.nodes.values()) {
    if (area && node.area !== area) continue
    const distance = Math.hypot(node.x - x, node.z - z)
    if (distance < bestDistance) {
      bestDistance = distance
      best = node
    }
  }
  return best
}
