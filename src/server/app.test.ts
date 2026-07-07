import { createServer, type Server } from 'node:http'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { applyLanguageDefaults, defaultConfig, LANGUAGES } from '../data/defaults'
import { activeStages, generateGitlabCI } from '../generator/generate'
import { createApp } from './app'

let server: Server
let base: string

beforeAll(async () => {
  // Fixture static dir so tests don't depend on a built dist/.
  const staticDir = await mkdtemp(path.join(tmpdir(), 'ci-gen-static-'))
  await writeFile(
    path.join(staticDir, 'index.html'),
    '<!doctype html><title>fixture</title>',
  )
  await mkdir(path.join(staticDir, 'assets'))
  await writeFile(path.join(staticDir, 'assets', 'app.js'), 'console.log(1)')

  server = createServer(createApp({ staticDir }))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(
  () =>
    new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    ),
)

/** res.json() is typed unknown under @types/node; tests want loose access. */
const asJson = (res: Response): Promise<Record<string, any>> =>
  res.json() as Promise<Record<string, any>>

function generate(body: string, headers: Record<string, string> = {}) {
  return fetch(`${base}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  })
}

describe('POST /api/generate', () => {
  it('generates the default pipeline for an empty config', async () => {
    const res = await generate('{}')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/plain')
    expect(await res.text()).toBe(generateGitlabCI(defaultConfig()))
  })

  it('treats an empty body as an empty config', async () => {
    const res = await generate('')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe(generateGitlabCI(defaultConfig()))
  })

  it('applies language defaults like the wizard does', async () => {
    const res = await generate(
      JSON.stringify({ language: 'python', packageManager: 'poetry' }),
    )
    expect(await res.text()).toBe(
      generateGitlabCI(applyLanguageDefaults(defaultConfig(), 'python', 'poetry')),
    )
  })

  it('lets explicit fields override language defaults', async () => {
    const res = await generate(
      JSON.stringify({ language: 'python', jobs: { testCommand: 'tox' } }),
    )
    const expected = applyLanguageDefaults(defaultConfig(), 'python', 'pip')
    expected.jobs.testCommand = 'tox'
    expect(await res.text()).toBe(generateGitlabCI(expected))
  })

  it('deep-merges nested partials, keeping sibling defaults', async () => {
    const res = await generate(JSON.stringify({ docker: { enabled: true } }))
    const expected = defaultConfig()
    expected.docker.enabled = true
    const text = await res.text()
    expect(text).toBe(generateGitlabCI(expected))
    expect(text).toContain('kaniko') // default method survived the merge
  })

  it('returns a JSON envelope on Accept: application/json', async () => {
    const res = await generate(JSON.stringify({ language: 'go' }), {
      accept: 'application/json',
    })
    expect(res.headers.get('content-type')).toContain('application/json')
    const body = await asJson(res)
    expect(body.config.language).toBe('go')
    expect(body.config.image).toBe('golang:1.23')
    expect(body.stages).toEqual(activeStages(body.config))
    expect(() => parse(body.yaml)).not.toThrow()
    expect(body.yaml).toBe(generateGitlabCI(body.config))
  })

  it('rejects unknown enum values, listing the allowed ones', async () => {
    const res = await generate(JSON.stringify({ language: 'cobol' }))
    expect(res.status).toBe(400)
    const body = await asJson(res)
    expect(body.error).toBe('validation_failed')
    expect(body.issues).toEqual([
      { path: 'language', message: expect.stringContaining('node') },
    ])
  })

  it('rejects unknown keys (typo protection)', async () => {
    const res = await generate(JSON.stringify({ langauge: 'go' }))
    expect(res.status).toBe(400)
    const body = await asJson(res)
    expect(body.issues).toEqual([
      { path: 'langauge', message: 'unknown key' },
    ])
  })

  it('rejects wrong types and collects every issue', async () => {
    const res = await generate(
      JSON.stringify({ cache: 'yes', jobs: { lint: 1, bogus: true } }),
    )
    expect(res.status).toBe(400)
    const body = await asJson(res)
    const paths = body.issues.map((i: { path: string }) => i.path).sort()
    expect(paths).toEqual(['cache', 'jobs.bogus', 'jobs.lint'])
  })

  it('rejects a package manager the language does not support', async () => {
    const res = await generate(JSON.stringify({ packageManager: 'poetry' }))
    expect(res.status).toBe(400)
    const body = await asJson(res)
    expect(body.issues[0].path).toBe('packageManager')
    expect(body.issues[0].message).toContain('language "node"')
  })

  it('rejects malformed JSON', async () => {
    const res = await generate('{not json')
    expect(res.status).toBe(400)
    expect((await asJson(res)).error).toBe('invalid_json')
  })

  it('rejects a non-object body', async () => {
    const res = await generate('"pipeline please"')
    expect(res.status).toBe(400)
    expect((await asJson(res)).error).toBe('validation_failed')
  })

  it('rejects non-JSON content types', async () => {
    const res = await generate('language=go', {
      'content-type': 'application/x-www-form-urlencoded',
    })
    expect(res.status).toBe(415)
  })

  it('rejects bodies over 1 MB', async () => {
    const res = await generate(
      JSON.stringify({ projectName: 'x'.repeat(1024 * 1024 + 16) }),
    )
    expect(res.status).toBe(413)
  })

  it('answers 405 with Allow for wrong methods', async () => {
    const res = await fetch(`${base}/api/generate`)
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('POST')
  })
})

describe('GET /api/defaults', () => {
  it('returns the materialized default config', async () => {
    const res = await fetch(`${base}/api/defaults`)
    expect(res.status).toBe(200)
    expect(await asJson(res)).toEqual(defaultConfig())
  })

  it('applies language and package manager from query params', async () => {
    const res = await fetch(`${base}/api/defaults?language=go`)
    const body = await asJson(res)
    expect(body.image).toBe('golang:1.23')
    expect(body).toEqual(applyLanguageDefaults(defaultConfig(), 'go'))
  })

  it('rejects invalid query params', async () => {
    const res = await fetch(`${base}/api/defaults?language=cobol`)
    expect(res.status).toBe(400)
  })
})

describe('GET /api/languages and /healthz', () => {
  it('returns the LANGUAGES list verbatim', async () => {
    const res = await fetch(`${base}/api/languages`)
    expect(await asJson(res)).toEqual(LANGUAGES)
  })

  it('reports healthy', async () => {
    const res = await fetch(`${base}/healthz`)
    expect(res.status).toBe(200)
    expect(await asJson(res)).toEqual({ status: 'ok' })
  })

  it('404s unknown API paths as JSON', async () => {
    const res = await fetch(`${base}/api/nope`)
    expect(res.status).toBe(404)
    expect((await asJson(res)).error).toBe('not_found')
  })
})

describe('static serving', () => {
  it('serves index.html at the root', async () => {
    const res = await fetch(`${base}/`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(await res.text()).toContain('fixture')
  })

  it('serves assets with the right MIME type and immutable caching', async () => {
    const res = await fetch(`${base}/assets/app.js`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/javascript')
    expect(res.headers.get('cache-control')).toContain('immutable')
  })

  it('falls back to index.html for SPA routes', async () => {
    const res = await fetch(`${base}/some/client/route`)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('fixture')
  })

  it('404s missing files with extensions', async () => {
    const res = await fetch(`${base}/missing.png`)
    expect(res.status).toBe(404)
  })

  it('blocks path traversal', async () => {
    // fetch() normalizes literal "..", so send it percent-encoded.
    const res = await fetch(`${base}/assets/%2e%2e/%2e%2e/package.json`)
    expect(res.status).toBe(404)
  })
})
