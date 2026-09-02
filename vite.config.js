import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readAgents } from './server/claude-agents.js'
import { createEventHub, readJsonBody } from './server/events.js'

// ponytail: dev-server middleware mirroring server/index.js, so `vite dev`
// serves the same three endpoints without running the production server.
function claudeAgents() {
  const hub = createEventHub()
  return {
    name: 'claude-agents',
    configureServer(server) {
      server.middlewares.use('/api/agents', (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        try {
          res.end(JSON.stringify({ agents: readAgents() }))
        } catch (error) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: String(error) }))
        }
      })
      server.middlewares.use('/api/event', async (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        try {
          const accepted = hub.ingest(await readJsonBody(req))
          res.statusCode = accepted ? 202 : 400
          res.end(JSON.stringify({ ok: Boolean(accepted) }))
        } catch (error) {
          res.statusCode = 400
          res.end(JSON.stringify({ error: String(error.message ?? error) }))
        }
      })
      server.middlewares.use('/api/stream', (req, res) => hub.subscribe(req, res))
    },
  }
}

export default defineConfig({ plugins: [react(), claudeAgents()] })
