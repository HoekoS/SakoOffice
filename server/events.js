// Live activity pushed in by Claude Code hooks, fanned out to browsers over SSE.
//
// The session roster still comes from polling ~/.claude (see claude-agents.js);
// hooks only add what polling cannot see — which tool is running right now,
// and the instant a session starts or stops — so an office without hooks
// installed keeps working, just with less to say.

/** Names Claude Code sends in `hook_event_name`. */
export const HOOK_EVENTS = new Set([
  'SessionStart',
  'SessionEnd',
  'PreToolUse',
  'PostToolUse',
  'Stop',
  'SubagentStop',
  'Notification',
])

/** Activity is considered live for this long after its last event. */
export const ACTIVITY_TTL_MS = 10 * 60_000

/**
 * Turn a raw hook payload into the small, safe record we keep and broadcast.
 * tool_input can carry file contents and shell commands, so it is dropped —
 * only the tool's name travels.
 */
export function normalizeEvent(payload, now = Date.now()) {
  if (!payload || typeof payload !== 'object') return null
  const event = payload.hook_event_name
  const sessionId = payload.session_id
  if (!HOOK_EVENTS.has(event) || typeof sessionId !== 'string' || !sessionId) return null
  return {
    event,
    sessionId,
    cwd: typeof payload.cwd === 'string' ? payload.cwd : null,
    tool: typeof payload.tool_name === 'string' ? payload.tool_name : null,
    at: now,
  }
}

/**
 * Fold one event into a session's activity record.
 * `activity.tool` is the tool running right now, or null between tools.
 */
export function applyEvent(activity, event) {
  const next = { ...(activity ?? {}), sessionId: event.sessionId, cwd: event.cwd ?? activity?.cwd ?? null, at: event.at }
  switch (event.event) {
    case 'PreToolUse':
      next.tool = event.tool
      next.phase = 'tool'
      break
    case 'PostToolUse':
      next.tool = null
      next.phase = 'thinking'
      break
    case 'Stop':
      next.tool = null
      next.phase = 'waiting'
      break
    case 'SessionStart':
      next.tool = null
      next.phase = 'arrived'
      break
    case 'SessionEnd':
      next.tool = null
      next.phase = 'left'
      break
    default:
      // SubagentStop, Notification — keep the phase, refresh the timestamp.
      break
  }
  return next
}

/** In-memory activity per session plus the SSE clients watching it. */
export function createEventHub({ now = Date.now, ttlMs = ACTIVITY_TTL_MS } = {}) {
  const activity = new Map()
  const clients = new Set()

  const snapshot = () => {
    const cutoff = now() - ttlMs
    for (const [id, record] of activity) {
      if (record.at < cutoff) activity.delete(id)
    }
    return [...activity.values()]
  }

  const broadcast = (message) => {
    const line = `data: ${JSON.stringify(message)}\n\n`
    for (const res of clients) res.write(line)
  }

  return {
    activity,
    snapshot,
    /** Returns the normalized event, or null if the payload was not one. */
    ingest(payload) {
      const event = normalizeEvent(payload, now())
      if (!event) return null
      activity.set(event.sessionId, applyEvent(activity.get(event.sessionId), event))
      broadcast({ type: 'event', event, activity: activity.get(event.sessionId) })
      return event
    },
    /** Attach an HTTP response as an SSE client; sends the snapshot first. */
    subscribe(req, res) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
      })
      res.write(`data: ${JSON.stringify({ type: 'snapshot', activity: snapshot() })}\n\n`)
      clients.add(res)
      // Proxies and browsers drop silent streams; a comment line keeps it open.
      const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000)
      req.on('close', () => {
        clearInterval(heartbeat)
        clients.delete(res)
      })
    },
    get clientCount() {
      return clients.size
    },
  }
}

/** Collect a JSON request body; rejects anything over `limit` bytes. */
export function readJsonBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}
