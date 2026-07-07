/**
 * Entry point for the bundled server (dist-server/main.js). Serves the API
 * plus the built SPA. PORT and STATIC_DIR are overridable via env; the
 * default static dir is ../dist relative to the bundle, which holds both
 * locally (dist-server/ next to dist/) and in the container (/app).
 */
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app'

const port = Number(process.env.PORT ?? 8080)
const staticDir =
  process.env.STATIC_DIR ??
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')

const server = http.createServer(createApp({ staticDir }))
server.listen(port, () => {
  console.log(
    `gitlab-ci-generator API listening on :${port} (static: ${staticDir})`,
  )
})

// Node runs as PID 1 in the container — without these, `podman stop` waits
// out the kill timeout instead of exiting promptly.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0))
    server.closeIdleConnections()
    setTimeout(() => process.exit(0), 5000).unref()
  })
}
