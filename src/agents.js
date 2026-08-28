// Maps the live Claude sessions onto the desks in the room.

export const STATUS_LOOK = {
  working: { color: 0x7ee787, intensity: 1.1 },
  idle: { color: 0x4da3ff, intensity: 0.35 },
  away: { color: 0x2b3138, intensity: 0.04 },
  empty: { color: 0x2b3138, intensity: 0.02 },
}

export function statusLook(status) {
  return STATUS_LOOK[status] ?? STATUS_LOOK.empty
}

/**
 * Seat agents at desks. The main agent — the session running in this workspace —
 * takes the main desk; without one, the longest-running session does. The rest
 * fill the remaining desks in layout order, and extras are left standing.
 * Returns a Map of desk name to agent.
 */
export function seatAgents(agents, deskNames, mainDeskName) {
  const seating = new Map()
  const others = deskNames.filter((name) => name !== mainDeskName)
  const queue = [...agents]

  if (queue.length > 0 && deskNames.includes(mainDeskName)) {
    const mainIndex = queue.findIndex((agent) => agent.isMain)
    const [mainAgent] = queue.splice(mainIndex === -1 ? 0 : mainIndex, 1)
    seating.set(mainDeskName, mainAgent)
  }
  for (const name of others) {
    if (queue.length === 0) break
    seating.set(name, queue.shift())
  }
  return seating
}

/** One-line summary for the overlay. */
export function rosterSummary(agents) {
  if (agents.length === 0) return 'No Claude sessions running'
  const working = agents.filter((a) => a.status === 'working').length
  const idle = agents.filter((a) => a.status === 'idle').length
  const away = agents.length - working - idle
  const parts = [`${agents.length} session${agents.length === 1 ? '' : 's'}`, `${working} working`]
  if (idle) parts.push(`${idle} idle`)
  if (away) parts.push(`${away} away`)
  return parts.join(' · ')
}
