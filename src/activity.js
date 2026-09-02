// What a person's speech bubble should say, given the live activity for their session.

/** Friendlier verbs for the tools people see most. */
const TOOL_LABELS = {
  Read: 'reading',
  Edit: 'editing',
  Write: 'writing',
  Bash: 'running a command',
  Grep: 'searching',
  Glob: 'searching',
  Agent: 'delegating',
  WebFetch: 'browsing',
  WebSearch: 'browsing',
}

/**
 * A tool's name as a bubble would say it. MCP tools arrive as
 * `mcp__<server>__<tool>`, which is far too long to sit over someone's head,
 * so only the tool half survives and its underscores become spaces.
 */
export function toolLabel(tool) {
  if (!tool) return 'using a tool'
  if (TOOL_LABELS[tool]) return TOOL_LABELS[tool]
  const mcp = tool.match(/^mcp__[^_]+(?:_[^_]+)*__(.+)$/)
  const name = mcp ? mcp[1].replace(/_/g, ' ') : tool
  return `using ${name}`
}

/**
 * Bubble text, or null when there is nothing worth saying.
 * `activity` is the hub record for this session (may be undefined).
 */
export function bubbleText(activity) {
  if (!activity) return null
  switch (activity.phase) {
    case 'tool':
      return toolLabel(activity.tool)
    case 'thinking':
      return 'thinking…'
    case 'waiting':
      return 'waiting for you'
    case 'arrived':
      return 'just got in'
    default:
      return null
  }
}

/**
 * Hooks make the status sharper than the mtime heuristic can: a session with
 * a tool in flight or mid-thought is working, one that stopped is idle right
 * now, whatever the transcript's age says.
 */
export function refineStatus(status, activity, now, freshMs = 45_000) {
  if (!activity || now - activity.at > freshMs) return status
  if (activity.phase === 'tool' || activity.phase === 'thinking') return 'working'
  if (activity.phase === 'waiting') return 'idle'
  return status
}
