// Counts the subagents a session currently has running.
//
// Task-tool subagents write into the parent's transcript with isSidechain:true.
// Each run is a chain: its first entry hangs off a main-thread entry, the rest
// hang off each other. Counting chains — not entries — counts subagents.
import fs from 'node:fs'

export const SUBAGENT_WINDOW_MS = 90_000
const TAIL_BYTES = 512 * 1024

/** Last `bytes` of a file as whole lines; a truncated leading line is dropped. */
export function readTail(file, bytes = TAIL_BYTES) {
  let fd
  try {
    fd = fs.openSync(file, 'r')
    const size = fs.fstatSync(fd).size
    const start = Math.max(0, size - bytes)
    const buffer = Buffer.alloc(size - start)
    fs.readSync(fd, buffer, 0, buffer.length, start)
    const text = buffer.toString('utf8')
    return start === 0 ? text : text.slice(text.indexOf('\n') + 1)
  } catch {
    return ''
  } finally {
    if (fd !== undefined) fs.closeSync(fd)
  }
}

/** For each subagent chain in the file's tail, the timestamp it was last active. */
export function chainLastSeen(file) {
  const sidechain = new Map()
  for (const line of readTail(file).split('\n')) {
    if (!line.includes('"isSidechain":true')) continue
    try {
      const entry = JSON.parse(line)
      if (entry.isSidechain && entry.uuid) sidechain.set(entry.uuid, entry)
    } catch {
      // A half-written line at the head of the tail — skip it.
    }
  }

  const lastSeen = new Map()
  for (const entry of sidechain.values()) {
    let root = entry
    const guard = new Set()
    while (sidechain.has(root.parentUuid) && !guard.has(root.uuid)) {
      guard.add(root.uuid)
      root = sidechain.get(root.parentUuid)
    }
    const at = Date.parse(entry.timestamp)
    if (Number.isNaN(at)) continue
    lastSeen.set(root.uuid, Math.max(lastSeen.get(root.uuid) ?? 0, at))
  }
  return lastSeen
}

function countFromLastSeen(lastSeen, now, windowMs) {
  let active = 0
  for (const at of lastSeen.values()) {
    if (now - at < windowMs) active += 1
  }
  return active
}

/**
 * How many subagent chains have run inside `windowMs`.
 * Chains whose start scrolled out of the tail still count — an entry with an
 * unknown parent is treated as its own root.
 */
export function countActiveSubagents(file, now = Date.now(), windowMs = SUBAGENT_WINDOW_MS) {
  return countFromLastSeen(chainLastSeen(file), now, windowMs)
}

// Re-parsing the tail is the expensive part (disk read + JSON.parse per line).
// A transcript's content is fully determined by its mtime, so skip the reparse
// when nothing has changed since the last poll — the count itself still decays
// every call, since that only depends on `now`.
const tailCache = new Map() // file -> { mtimeMs, lastSeen }

/** Same as countActiveSubagents, but skips the reparse when `mtimeMs` is unchanged. */
export function countActiveSubagentsCached(file, mtimeMs, now = Date.now(), windowMs = SUBAGENT_WINDOW_MS) {
  const cached = tailCache.get(file)
  const lastSeen = cached && cached.mtimeMs === mtimeMs ? cached.lastSeen : chainLastSeen(file)
  tailCache.set(file, { mtimeMs, lastSeen })
  return countFromLastSeen(lastSeen, now, windowMs)
}
