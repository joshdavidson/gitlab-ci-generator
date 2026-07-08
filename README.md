# GitLab CI Generator

Answer a few questions about your project and get a production-ready
`.gitlab-ci.yml` — sensible stages, dependency caching, security scanning,
container image builds, and deployment included.

Built with React + Vite + TypeScript. The **web UI** is fully client-side:
nothing you type leaves the browser (and the GitLab Pages deployment stays
pure static). The **container image** additionally ships a small HTTP API
exposing the same generator for scripted use — see [HTTP API](#http-api).

## What it asks

1. **Project basics** — language/project type (Node, Python, Go, Rust, Java,
   PHP, Ruby, .NET, static site, or container-image-only), package manager,
   and CI image.
2. **Jobs & stages** — lint / test / build toggles with editable commands,
   plus GitLab's maintained SAST + Secret Detection templates.
3. **Container image** — build & push with Kaniko (default, no privileged
   runner needed), docker-in-docker, or Buildah — to the GitLab registry,
   Docker Hub, or a custom registry.
4. **Deployment** — GitLab Pages, SSH/rsync, Kubernetes (kubectl or Helm),
   AWS S3, npm publish, or a custom script.
5. **Pipeline behaviour** — duplicate-pipeline avoidance (`workflow:` rules),
   dependency caching keyed on the lockfile, and `rules:` vs legacy
   `only/except` syntax.

The preview updates live; **Copy** or **Download** the result and drop it in
your repo. Generated pipelines are portable to gitlab.com and self-hosted
GitLab.

## HTTP API

The same generator, without the browser. Send a **partial** config — anything
you omit falls back to the wizard's defaults, and setting `language` /
`packageManager` pulls in that language's expert defaults exactly like picking
it in the UI. Unknown keys and invalid values are rejected with a 400 listing
every problem.

```sh
# Default Node.js pipeline
curl -X POST localhost:8080/api/generate -H 'content-type: application/json' -d '{}'

# Python + poetry, with a custom test command
curl -X POST localhost:8080/api/generate -H 'content-type: application/json' \
  -d '{"language":"python","packageManager":"poetry","jobs":{"testCommand":"tox"}}' \
  -o .gitlab-ci.yml

# JSON envelope (yaml + the fully resolved config + active stages)
curl -X POST localhost:8080/api/generate -H 'content-type: application/json' \
  -H 'accept: application/json' -d '{"language":"go","docker":{"enabled":true}}'
```

| Endpoint | What it does |
|---|---|
| `POST /api/generate` | Partial `PipelineConfig` JSON → `.gitlab-ci.yml` text (or a `{yaml, config, stages}` envelope with `Accept: application/json`) |
| `GET /api/defaults` | The fully materialized default config; `?language=` and `?packageManager=` apply language defaults first |
| `GET /api/languages` | Supported languages and their package managers |
| `GET /healthz` | Liveness probe |

The config shape is [`PipelineConfig` in src/types.ts](src/types.ts) — every
wizard answer has a JSON field.

## Running locally

```sh
npm install       # first time only
npm run dev       # dev server with hot reload → http://localhost:5173
```

Or serve the production build:

```sh
npm run build             # production bundle in dist/
npm run preview           # serve dist/ → http://localhost:4173
npm run preview -- --host # same, but reachable from other machines on your network
```

Both servers bind to localhost only by default; add `-- --host` (note the extra
`--`, which passes the flag through npm to Vite) to listen on all interfaces.
The web UI itself is fully client-side — the Vite servers only serve files.

To run the UI + HTTP API together the way the container does:

```sh
npm run build     # dist/ (SPA) — the API serves it as static files
npm run dev:api   # bundle + start the API server → http://localhost:8080
```

## Development checks

```sh
npm run test      # vitest — generator scenario tests (output must parse as YAML)
                  # + API tests (validation, merging, static serving)
npm run lint      # tsc typecheck (app, server, and vite config projects)
```

## How it's structured

- `src/types.ts` — `PipelineConfig`, the full answer-set collected by the wizard.
- `src/data/defaults.ts` — per-language expert defaults (image, commands,
  cache shape); everything stays editable in the UI.
- `src/data/enums.ts` — runtime value lists for the unions in `types.ts`,
  compile-time locked so they can't drift.
- `src/generator/` — pure functions that turn a `PipelineConfig` into YAML.
  The output is hand-assembled (not serialized) so it carries comments and
  reads like a pipeline written by a person. Tested in `generate.test.ts`.
- `src/components/` — the wizard form and the live YAML preview.
- `src/server/` — the zero-dependency `node:http` API (validation + partial
  config merging + static serving of the built UI), bundled to
  `dist-server/main.js` by `vite build --ssr`.

## CI

This repo's own [.gitlab-ci.yml](.gitlab-ci.yml) runs on the Defiant Labs
shell runner: `test` (typecheck + vitest), `build` (SPA + API server bundle
artifacts), `containerize` (image build + push, main and tags only), and
`deploy` (GitLab Pages, main only).

## Deployment

Every merge to `main` publishes the tested production bundle to GitLab Pages:

**http://defiant.pages.defiantlabs.cloud/gitlab-ci-generator**

The `pages` job reuses the `dist/` artifact from the `build` job (the exact
bundle the tests ran against), so no rebuild happens at deploy time. Pages
serves only the static web UI; for the HTTP API, run the container image
below.

This repo is also push-mirrored to GitHub
([joshdavidson/gitlab-ci-generator](https://github.com/joshdavidson/gitlab-ci-generator)).
When the mirror pushes `main`,
[.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml)
lint+tests, builds, and publishes the same `dist/` bundle to GitHub Pages:

**https://joshdavidson.github.io/gitlab-ci-generator/**

The two deploys are independent — GitLab CI ignores `.github/`, GitHub
ignores `.gitlab-ci.yml` — and the site works at both URLs because Vite
builds with `base: './'` (relative asset paths).

## Docker

On every merge to `main` (and on tags) CI builds a Node image serving the
web UI **and** the [HTTP API](#http-api) on port 8080, and pushes it to this
project's GitLab container registry (project → **Deploy → Container
Registry**), tagged `latest` and with the commit short SHA:

```sh
docker pull gitlab.defiantlabs.cloud:5050/defiant/gitlab-ci-generator:latest
docker run --rm -p 8080:8080 gitlab.defiantlabs.cloud:5050/defiant/gitlab-ci-generator:latest
# → http://localhost:8080          (web UI)
# → http://localhost:8080/api/...  (HTTP API)
```

To build the image locally, produce the bundles first — the
[Dockerfile](Dockerfile) only packages prebuilt output (`dist/` and
`dist-server/`; the server bundle is self-contained, so the image carries no
node_modules):

```sh
npm run build
docker build -t gitlab-ci-generator .
```
