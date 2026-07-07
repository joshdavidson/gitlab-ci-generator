/**
 * Static file serving for the built SPA (dist/). Traversal-safe: the decoded
 * path must resolve inside the root. Extension-less misses fall back to
 * index.html (SPA routing); content-hashed /assets/* get immutable caching.
 * Returns false when the request wasn't handled (caller sends the 404).
 */
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
}

async function fileStats(filePath: string) {
  try {
    const stats = await stat(filePath)
    return stats.isFile() ? stats : null
  } catch {
    return null
  }
}

export async function serveStatic(
  req: IncomingMessage,
  res: ServerResponse,
  rootDir: string,
): Promise<boolean> {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false

  let pathname: string
  try {
    pathname = decodeURIComponent(
      new URL(req.url ?? '/', 'http://internal').pathname,
    )
  } catch {
    return false // malformed percent-encoding
  }

  const root = path.resolve(rootDir)
  const target = path.resolve(root, '.' + pathname)
  if (target !== root && !target.startsWith(root + path.sep)) return false

  let filePath = target
  let stats = await fileStats(filePath)
  if (!stats) {
    // A miss with an extension is a real 404; anything else is an SPA route.
    if (path.extname(pathname) !== '') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Not found\n')
      return true
    }
    filePath = path.join(root, 'index.html')
    stats = await fileStats(filePath)
    if (!stats) return false
  }

  res.writeHead(200, {
    'Content-Type':
      MIME_TYPES[path.extname(filePath)] ?? 'application/octet-stream',
    'Content-Length': stats.size,
    'Cache-Control': pathname.startsWith('/assets/')
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
  })
  if (req.method === 'HEAD') {
    res.end()
    return true
  }
  const stream = createReadStream(filePath)
  stream.on('error', () => res.destroy())
  stream.pipe(res)
  return true
}
