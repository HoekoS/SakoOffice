import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readAgents } from './server/claude-agents.js'

// ponytail: dev-server middleware, not a separate backend. Move it to a real
// server only when the workspace needs to run without `vite dev`.
function claudeAgents() {
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
    },
  }
}

export default defineConfig({ plugins: [react(), claudeAgents()] })
