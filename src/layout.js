// Pure geometry helpers — kept out of the React file so they're testable in plain node.

export const ROOM = { width: 24, depth: 18, height: 3.2, wallThickness: 0.2 }

/**
 * Centered grid of positions on the XZ plane.
 * Returns [{ x, z, row, col, index }] ordered row-major.
 */
export function gridPositions(rows, cols, spacingX, spacingZ) {
  const out = []
  const offsetX = ((cols - 1) * spacingX) / 2
  const offsetZ = ((rows - 1) * spacingZ) / 2
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      out.push({
        x: col * spacingX - offsetX,
        z: row * spacingZ - offsetZ,
        row,
        col,
        index: row * cols + col,
      })
    }
  }
  return out
}

/** The middle-row desk on the window side belongs to the main agent. */
export const MAIN_DESK = { row: 1, col: 0 }

/** Quarter turn clockwise seen from above — negative around the Y axis. */
export const MAIN_DESK_ROTATION = -Math.PI / 2

export const MAIN_DESK_NAME = 'Main Agent'

/**
 * Heading that turns a desk at (x, z) toward (tx, tz).
 * A desk looks down its own -z, which a Y rotation of θ sends to (-sinθ, -cosθ).
 */
export function facingRotation(x, z, tx, tz) {
  return Math.atan2(-(tx - x), -(tz - z))
}

/** Desk cluster placed in the left two-thirds of the room. */
export function deskLayout() {
  const cells = gridPositions(3, 3, 4, 4).map((p) => ({ ...p, x: p.x - 4 }))
  const mainCell = cells.find((p) => p.row === MAIN_DESK.row && p.col === MAIN_DESK.col)

  return cells.map((p) => {
    const main = p === mainCell
    // Outer rows face across the aisle at each other; the main agent's own row
    // turns to face their station.
    const rotation = main
      ? MAIN_DESK_ROTATION
      : p.row === mainCell.row
        ? facingRotation(p.x, p.z, mainCell.x, mainCell.z)
        : facingRotation(p.x, p.z, p.x, mainCell.z)

    return {
      ...p,
      main,
      name: main ? MAIN_DESK_NAME : `Desk ${String.fromCharCode(65 + p.row)}${p.col + 1}`,
      rotation,
    }
  })
}

/** Chairs around a rectangular meeting table centered at (cx, cz). */
export function meetingSeats(cx, cz, tableW, tableD, perSide) {
  const seats = []
  const gap = 0.9
  for (let i = 0; i < perSide; i++) {
    const t = (i - (perSide - 1) / 2) * (tableW / perSide)
    seats.push({ x: cx + t, z: cz - tableD / 2 - gap, rotation: 0 })
    seats.push({ x: cx + t, z: cz + tableD / 2 + gap, rotation: Math.PI })
  }
  return seats
}

// The right-hand third of the floor is partitioned into two glass-walled rooms.
export const MEETING_ROOM = { x0: 2.5, x1: 12, z0: -9, z1: 0, doorZ: -2 }
export const PANTRY = { x0: 2.5, x1: 12, z0: 0, z1: 9, doorZ: 2.4 }
export const PARTITION = { height: 2.7, thickness: 0.1, doorWidth: 1.7 }

/**
 * Split a wall run into the spans left over once a doorway is cut out.
 * Coordinates are 1D along the wall's own axis; doorCenter of null means no door.
 * Returns [[from, to], ...] — one span, two, or none if the door swallows the run.
 */
export function wallSpans(from, to, doorCenter, doorWidth) {
  if (doorCenter == null) return [[from, to]]
  const gapStart = doorCenter - doorWidth / 2
  const gapEnd = doorCenter + doorWidth / 2
  const spans = []
  if (gapStart > from) spans.push([from, Math.min(gapStart, to)])
  if (gapEnd < to) spans.push([Math.max(gapEnd, from), to])
  return spans
}

/** Chairs evenly spaced around a round table, each turned to face its center. */
export function pantrySeats(cx, cz, radius, count) {
  const seats = []
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2
    const x = cx + Math.sin(angle) * radius
    const z = cz + Math.cos(angle) * radius
    // buildChair looks down its local +z, so aim that axis back at the table.
    seats.push({ x, z, rotation: Math.atan2(cx - x, cz - z) })
  }
  return seats
}
