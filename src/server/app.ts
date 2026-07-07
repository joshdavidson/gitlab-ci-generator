/**
 * HTTP API exposing the generator: the same capability as the web UI, for
 * curl/scripts. createApp returns a plain request listener (no listen()) so
 * tests can mount it on an ephemeral port.
 *
 *   POST /api/generate   partial PipelineConfig JSON -> .gitlab-ci.yml text
 *                        (Accept: application/json -> {yaml, config, stages})
 *   GET  /api/defaults   materialized default config (?language=&packageManager=)
 *   GET  /api/languages  supported languages + their package managers
 *   GET  /healthz        liveness probe
 *   GET  *               static SPA from dist/
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { activeStages, generateGitlabCI } from '../generator/generate'
import { LANGUAGES } from '../data/defaults'
import { serveStatic } from './static'
import { validateAndMerge } from './validate'

const MAX_BODY_BYTES = 1024 * 1024

export interface AppOptions {
  staticDir: string
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body, null, 2) + '\n'
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
  })
  res.end(text)
}

function sendText(res: ServerResponse, status: number, text: string): void {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
  })
  res.end(text)
}

function methodNotAllowed(res: ServerResponse, allow: string): void {
  res.setHeader('Allow', allow)
  sendJson(res, 405, { error: 'method_not_allowed', allow })
}

function wantsJson(req: IncomingMessage): boolean {
  return (req.headers.accept ?? '').includes('application/json')
}

/** Read the request body; null means the 413 was already sent. */
function readBody(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        sendJson(res, 413, {
          error: 'payload_too_large',
          message: `request body exceeds ${MAX_BODY_BYTES} bytes`,
        })
        req.destroy()
        resolve(null)
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

async function handleGenerate(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const contentType = req.headers['content-type']
  if (contentType !== undefined && !contentType.includes('application/json')) {
    sendJson(res, 415, {
      error: 'unsupported_media_type',
      message: `expected application/json, got ${contentType}`,
    })
    return
  }

  const body = await readBody(req, res)
  if (body === null) return

  let parsed: unknown
  try {
    parsed = body.trim() === '' ? {} : JSON.parse(body)
  } catch (err) {
    sendJson(res, 400, {
      error: 'invalid_json',
      message: err instanceof Error ? err.message : String(err),
    })
    return
  }

  const result = validateAndMerge(parsed)
  if (!result.ok) {
    sendJson(res, 400, { error: 'validation_failed', issues: result.issues })
    return
  }

  const yaml = generateGitlabCI(result.config)
  if (wantsJson(req)) {
    sendJson(res, 200, {
      yaml,
      config: result.config,
      stages: activeStages(result.config),
    })
  } else {
    sendText(res, 200, yaml)
  }
}

function handleDefaults(url: URL, res: ServerResponse): void {
  // Reuse the exact /api/generate merge path: query params become a partial.
  const partial: Record<string, string> = {}
  const language = url.searchParams.get('language')
  const packageManager = url.searchParams.get('packageManager')
  if (language !== null) partial.language = language
  if (packageManager !== null) partial.packageManager = packageManager

  const result = validateAndMerge(partial)
  if (!result.ok) {
    sendJson(res, 400, { error: 'validation_failed', issues: result.issues })
    return
  }
  sendJson(res, 200, result.config)
}

async function route(
  req: IncomingMessage,
  res: ServerResponse,
  opts: AppOptions,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://internal')
  const { pathname } = url

  if (pathname === '/healthz') {
    if (req.method !== 'GET' && req.method !== 'HEAD')
      return methodNotAllowed(res, 'GET, HEAD')
    return sendJson(res, 200, { status: 'ok' })
  }

  if (pathname === '/api/generate') {
    if (req.method !== 'POST') return methodNotAllowed(res, 'POST')
    return handleGenerate(req, res)
  }

  if (pathname === '/api/defaults') {
    if (req.method !== 'GET') return methodNotAllowed(res, 'GET')
    return handleDefaults(url, res)
  }

  if (pathname === '/api/languages') {
    if (req.method !== 'GET') return methodNotAllowed(res, 'GET')
    return sendJson(res, 200, LANGUAGES)
  }

  if (pathname === '/api' || pathname.startsWith('/api/')) {
    return sendJson(res, 404, { error: 'not_found' })
  }

  if (await serveStatic(req, res, opts.staticDir)) return
  sendText(res, 404, 'Not found\n')
}

export function createApp(
  opts: AppOptions,
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    route(req, res, opts).catch((err: unknown) => {
      // Never leave a socket hanging on a bug.
      console.error('unhandled error:', err)
      if (!res.headersSent) {
        sendJson(res, 500, { error: 'internal_error' })
      } else {
        res.destroy()
      }
    })
  }
}
