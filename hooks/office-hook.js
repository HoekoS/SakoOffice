#!/usr/bin/env node
// Claude Code hook: forwards the event on stdin to the office, then gets out
// of the way. It must never slow Claude down or fail a tool call, so every
// path ends in exit 0 and nothing waits longer than a few hundred ms.
//
// Install it under "hooks" in ~/.claude/settings.json for the events you want
// the office to see (see docker-compose.yml / README for the exact block):
//
//   { "type": "command", "command": "node \"C:\\path\\to\\SakoOffice\\hooks\\office-hook.js\"" }
//
// ponytail: it posts to every port in SAKO_OFFICE_PORTS rather than knowing
// which server is up — the dev server and the production one both accept it.
import http from 'node:http'

// Production server, Vite dev server, and the published container port. A
// closed port refuses instantly, so listing all three costs nothing.
const PORTS = (process.env.SAKO_OFFICE_PORTS ?? '3000,5173,8081')
  .split(',')
  .map((p) => Number(p.trim()))
  .filter(Boolean)
const TIMEOUT_MS = 400

function post(port, body) {
  return new Promise((resolve) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: '/api/event', method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: TIMEOUT_MS },
      (res) => {
        res.resume()
        res.on('end', resolve)
      }
    )
    req.on('timeout', () => req.destroy())
    req.on('error', resolve)
    req.end(body)
  })
}

let raw = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  raw += chunk
})
process.stdin.on('end', async () => {
  let payload
  try {
    payload = JSON.parse(raw)
  } catch {
    process.exit(0)
  }
  // Only the fields the office uses leave this process; tool_input stays here.
  const body = JSON.stringify({
    hook_event_name: payload.hook_event_name,
    session_id: payload.session_id,
    cwd: payload.cwd,
    tool_name: payload.tool_name,
  })
  await Promise.all(PORTS.map((port) => post(port, body)))
  process.exit(0)
})
