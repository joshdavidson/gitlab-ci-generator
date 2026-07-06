# GitLab CI Generator

Answer a few questions about your project and get a production-ready
`.gitlab-ci.yml` — sensible stages, dependency caching, security scanning,
container image builds, and deployment included.

Built with React + Vite + TypeScript. Fully client-side: nothing you type
leaves the browser.

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
The app is fully client-side — there is no backend to configure.

## Development checks

```sh
npm run test      # vitest — generator scenario tests (output must parse as YAML)
npm run lint      # tsc typecheck
```

## How it's structured

- `src/types.ts` — `PipelineConfig`, the full answer-set collected by the wizard.
- `src/data/defaults.ts` — per-language expert defaults (image, commands,
  cache shape); everything stays editable in the UI.
- `src/generator/` — pure functions that turn a `PipelineConfig` into YAML.
  The output is hand-assembled (not serialized) so it carries comments and
  reads like a pipeline written by a person. Tested in `generate.test.ts`.
- `src/components/` — the wizard form and the live YAML preview.

## CI

This repo's own [.gitlab-ci.yml](.gitlab-ci.yml) runs on the Defiant Labs
shell runner: `test` (typecheck + vitest) and `build` (bundle artifact).
A commented-out `pages` job is included for publishing via GitLab Pages.
