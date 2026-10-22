/**
 * Per-language expert defaults: image, commands, artifacts, and dependency
 * cache shape. These prefill the wizard; everything stays editable.
 */
import type { Language, PackageManager, PipelineConfig } from '../types'

export interface LanguageDefaults {
  image: string
  install: string
  lint: string
  test: string
  build: string
  artifacts: string[]
  cacheKeyFiles: string[]
  cachePaths: string[]
  /** variables: entries needed to make the cache paths effective. */
  cacheVariables: Record<string, string>
}

export const LANGUAGES: {
  value: Language
  label: string
  pms: PackageManager[]
}[] = [
  {
    value: 'node',
    label: 'Node.js / TypeScript',
    pms: ['npm', 'yarn', 'pnpm'],
  },
  { value: 'python', label: 'Python', pms: ['pip', 'poetry', 'pipenv'] },
  { value: 'go', label: 'Go', pms: [] },
  { value: 'rust', label: 'Rust', pms: [] },
  { value: 'java', label: 'Java / JVM', pms: ['maven', 'gradle'] },
  { value: 'php', label: 'PHP', pms: [] },
  { value: 'ruby', label: 'Ruby', pms: [] },
  { value: 'dotnet', label: '.NET', pms: [] },
  { value: 'static', label: 'Static site (no build)', pms: [] },
  { value: 'docker', label: 'Container image only', pms: [] },
]

export function defaultPackageManager(language: Language): PackageManager {
  const entry = LANGUAGES.find((l) => l.value === language)
  return entry && entry.pms.length > 0 ? entry.pms[0] : 'none'
}

export function languageDefaults(
  language: Language,
  pm: PackageManager,
): LanguageDefaults {
  switch (language) {
    case 'node': {
      if (pm === 'yarn') {
        return {
          image: 'node:24',
          install: 'yarn install --frozen-lockfile --cache-folder .yarn-cache',
          lint: 'yarn lint',
          test: 'yarn test',
          build: 'yarn build',
          artifacts: ['dist/'],
          cacheKeyFiles: ['yarn.lock'],
          cachePaths: ['.yarn-cache/'],
          cacheVariables: {},
        }
      }
      if (pm === 'pnpm') {
        return {
          image: 'node:24',
          install:
            'corepack enable && pnpm install --frozen-lockfile --store-dir .pnpm-store',
          lint: 'pnpm lint',
          test: 'pnpm test',
          build: 'pnpm build',
          artifacts: ['dist/'],
          cacheKeyFiles: ['pnpm-lock.yaml'],
          cachePaths: ['.pnpm-store/'],
          cacheVariables: {},
        }
      }
      return {
        image: 'node:24',
        install: 'npm ci --cache .npm --prefer-offline',
        lint: 'npm run lint',
        test: 'npm test',
        build: 'npm run build',
        artifacts: ['dist/'],
        cacheKeyFiles: ['package-lock.json'],
        cachePaths: ['.npm/'],
        cacheVariables: {},
      }
    }
    case 'python': {
      const pipCache = { PIP_CACHE_DIR: '$CI_PROJECT_DIR/.cache/pip' }
      if (pm === 'poetry') {
        return {
          image: 'python:3.12',
          install: 'pip install poetry && poetry install',
          lint: 'poetry run ruff check .',
          test: 'poetry run pytest',
          build: 'poetry build',
          artifacts: ['dist/'],
          cacheKeyFiles: ['poetry.lock'],
          cachePaths: ['.cache/pip', '.venv/'],
          cacheVariables: {
            ...pipCache,
            POETRY_VIRTUALENVS_IN_PROJECT: 'true',
          },
        }
      }
      if (pm === 'pipenv') {
        return {
          image: 'python:3.12',
          install: 'pip install pipenv && pipenv install --dev',
          lint: 'pipenv run ruff check .',
          test: 'pipenv run pytest',
          build: '',
          artifacts: [],
          cacheKeyFiles: ['Pipfile.lock'],
          cachePaths: ['.cache/pip'],
          cacheVariables: pipCache,
        }
      }
      return {
        image: 'python:3.12',
        install: 'pip install -r requirements.txt',
        lint: 'ruff check .',
        test: 'pytest',
        build: 'python -m build',
        artifacts: ['dist/'],
        cacheKeyFiles: ['requirements.txt'],
        cachePaths: ['.cache/pip'],
        cacheVariables: pipCache,
      }
    }
    case 'go':
      return {
        image: 'golang:1.23',
        install: 'go mod download',
        lint: 'go vet ./...',
        test: 'go test ./...',
        build: 'go build -o bin/ ./...',
        artifacts: ['bin/'],
        cacheKeyFiles: ['go.sum'],
        cachePaths: ['.go/pkg/mod/'],
        cacheVariables: { GOPATH: '$CI_PROJECT_DIR/.go' },
      }
    case 'rust':
      return {
        image: 'rust:1.82',
        install: 'cargo fetch',
        lint: 'cargo clippy --all-targets -- -D warnings',
        test: 'cargo test',
        build: 'cargo build --release',
        artifacts: ['target/release/'],
        cacheKeyFiles: ['Cargo.lock'],
        cachePaths: ['.cargo/', 'target/'],
        cacheVariables: { CARGO_HOME: '$CI_PROJECT_DIR/.cargo' },
      }
    case 'java': {
      if (pm === 'gradle') {
        return {
          image: 'gradle:8-jdk21',
          install: '',
          lint: '',
          test: 'gradle --build-cache test',
          build: 'gradle --build-cache assemble',
          artifacts: ['build/libs/'],
          cacheKeyFiles: ['build.gradle'],
          cachePaths: ['.gradle/'],
          cacheVariables: { GRADLE_USER_HOME: '$CI_PROJECT_DIR/.gradle' },
        }
      }
      return {
        image: 'maven:3.9-eclipse-temurin-21',
        install: '',
        lint: '',
        test: 'mvn $MAVEN_CLI_OPTS test',
        build: 'mvn $MAVEN_CLI_OPTS package -DskipTests',
        artifacts: ['target/*.jar'],
        cacheKeyFiles: ['pom.xml'],
        cachePaths: ['.m2/repository/'],
        cacheVariables: {
          MAVEN_CLI_OPTS: '--batch-mode -Dmaven.repo.local=.m2/repository',
        },
      }
    }
    case 'php':
      return {
        image: 'composer:2',
        install: 'composer install --prefer-dist --no-progress',
        lint: 'composer validate --strict',
        test: 'vendor/bin/phpunit',
        build: '',
        artifacts: [],
        cacheKeyFiles: ['composer.lock'],
        cachePaths: ['vendor/'],
        cacheVariables: {},
      }
    case 'ruby':
      return {
        image: 'ruby:3.3',
        install:
          'bundle config set --local path vendor/bundle && bundle install --jobs "$(nproc)"',
        lint: 'bundle exec rubocop',
        test: 'bundle exec rspec',
        build: '',
        artifacts: [],
        cacheKeyFiles: ['Gemfile.lock'],
        cachePaths: ['vendor/bundle/'],
        cacheVariables: {},
      }
    case 'dotnet':
      return {
        image: 'mcr.microsoft.com/dotnet/sdk:8.0',
        install: 'dotnet restore --packages .nuget/packages',
        lint: 'dotnet format --verify-no-changes',
        test: 'dotnet test --no-restore',
        build: 'dotnet publish -c Release -o publish --no-restore',
        artifacts: ['publish/'],
        cacheKeyFiles: [],
        cachePaths: ['.nuget/packages/'],
        cacheVariables: { NUGET_PACKAGES: '$CI_PROJECT_DIR/.nuget/packages' },
      }
    case 'static':
      return {
        image: 'alpine:3.20',
        install: '',
        lint: '',
        test: '',
        build: '',
        artifacts: [],
        cacheKeyFiles: [],
        cachePaths: [],
        cacheVariables: {},
      }
    case 'docker':
      return {
        image: '',
        install: '',
        lint: '',
        test: '',
        build: '',
        artifacts: [],
        cacheKeyFiles: [],
        cachePaths: [],
        cacheVariables: {},
      }
  }
}

/** Directory the deploy job publishes (pages/ssh/s3): first artifact dir. */
function defaultBuildDir(
  language: Language,
  defaults: LanguageDefaults,
): string {
  if (language === 'static') return '.'
  const first = defaults.artifacts[0]
  return first ? first.replace(/\/$/, '') : 'dist'
}

/**
 * Re-derive language-specific fields (image, commands, cache, artifacts)
 * while keeping the user's docker/deploy/pipeline answers intact.
 */
export function applyLanguageDefaults(
  config: PipelineConfig,
  language: Language,
  pm?: PackageManager,
): PipelineConfig {
  const packageManager = pm ?? defaultPackageManager(language)
  const d = languageDefaults(language, packageManager)
  return {
    ...config,
    language,
    packageManager,
    image: d.image,
    jobs: {
      ...config.jobs,
      lint: d.lint !== '',
      test: d.test !== '',
      build: d.build !== '',
      installCommand: d.install,
      lintCommand: d.lint,
      testCommand: d.test,
      buildCommand: d.build,
      buildArtifacts: d.artifacts,
    },
    docker: {
      ...config.docker,
      // "Container image only" projects exist to build an image.
      enabled: language === 'docker' ? true : config.docker.enabled,
    },
    deploy: {
      ...config.deploy,
      buildDir: defaultBuildDir(language, d),
      // A plain static site almost always wants Pages.
      target:
        language === 'static' && config.deploy.target === 'none'
          ? 'pages'
          : config.deploy.target,
    },
  }
}

export function defaultConfig(): PipelineConfig {
  const language: Language = 'node'
  const pm = defaultPackageManager(language)
  const d = languageDefaults(language, pm)
  return {
    projectName: '',
    language,
    packageManager: pm,
    image: d.image,
    cache: true,
    jobs: {
      lint: true,
      test: true,
      build: true,
      security: true,
      installCommand: d.install,
      lintCommand: d.lint,
      testCommand: d.test,
      buildCommand: d.build,
      buildArtifacts: d.artifacts,
    },
    docker: {
      enabled: false,
      method: 'kaniko',
      registry: 'gitlab',
      customRegistry: '',
      imageName: '$CI_REGISTRY_IMAGE',
      dockerfilePath: 'Dockerfile',
    },
    deploy: {
      target: 'none',
      branch: 'main',
      environmentName: 'production',
      environmentUrl: '',
      buildDir: 'dist',
      script: '',
    },
    pipeline: {
      rulesStyle: 'rules',
      workflowRules: true,
    },
  }
}
