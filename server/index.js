// Production server: serves the built frontend plus the agent feed.
// Node stdlib only — the browser bundle already contains three and react, so
// the runtime image needs no node_modules at all.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readAgents, CLAUDE_DIR, pidAlive } from './claude-agents.js'
import { createEventHub, readJsonBody } from './events.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.resolve(HERE, '..', 'dist')

const PORT = Number(process.env.PORT ?? 3000)
const CLAUDE_ROOT = process.env.SAKO_CLAUDE_DIR || CLAUDE_DIR
/** The host path of the workspace, so the right session gets the main desk. */
const WORKSPACE = process.env.SAKO_WORKSPACE || process.cwd()

/**
 * Host pids mean nothing inside a container, so pid checking is skipped
 * whenever the .claude directory is someone else's. Stale session files are
 * then dropped on age instead — a real session touches its transcript often.
 */
const CHECK_PIDS = process.env.SAKO_CHECK_PIDS !== '0'
const MAX_IDLE_MS = CHECK_PIDS ? Infinity : 6 * 60 * 60_000

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

function sendAgents(res) {
  res.setHeader('Content-Type', MIME['.json'])
  res.setHeader('Cache-Control', 'no-store')
  try {
    const agents = readAgents({
      dir: CLAUDE_ROOT,
      workspace: WORKSPACE,
      isAlive: CHECK_PIDS ? pidAlive : () => true,
      maxIdleMs: MAX_IDLE_MS,
    })
    res.end(JSON.stringify({ agents }))
  } catch (error) {
    res.statusCode = 500
    res.end(JSON.stringify({ error: String(error) }))
  }
}

function sendFile(res, file) {
  fs.readFile(file, (error, body) => {
    if (error) {
      res.statusCode = 404
      res.end('Not found')
      return
    }
    res.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream')
    res.end(body)
  })
}

const hub = createEventHub()

async function receiveEvent(req, res) {
  res.setHeader('Content-Type', MIME['.json'])
  try {
    const accepted = hub.ingest(await readJsonBody(req))
    res.statusCode = accepted ? 202 : 400
    res.end(JSON.stringify({ ok: Boolean(accepted) }))
  } catch (error) {
    res.statusCode = 400
    res.end(JSON.stringify({ error: String(error.message ?? error) }))
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname === '/api/agents') return sendAgents(res)
  if (url.pathname === '/api/event' && req.method === 'POST') return receiveEvent(req, res)
  if (url.pathname === '/api/stream') return hub.subscribe(req, res)

  // Resolve inside dist and confirm it stayed there, so ../ can't escape.
  const requested = path.resolve(DIST, `.${url.pathname}`)
  const file = requested === DIST || !requested.startsWith(DIST) ? path.join(DIST, 'index.html') : requested
  sendFile(res, fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(DIST, 'index.html'))
})

server.listen(PORT, () => {
  console.log(`sako-office on http://localhost:${PORT}`)
  console.log(`  reading ${CLAUDE_ROOT}${CHECK_PIDS ? '' : ' (pid checks off)'}`)
  console.log(`  main desk: ${WORKSPACE}`)
})
