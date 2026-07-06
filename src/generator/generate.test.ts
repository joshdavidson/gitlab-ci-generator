import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { activeStages, generateGitlabCI } from './generate'
import { applyLanguageDefaults, defaultConfig, defaultPackageManager, LANGUAGES } from '../data/defaults'
import type { PipelineConfig } from '../types'

function parseYaml(config: PipelineConfig): Record<string, unknown> {
  const output = generateGitlabCI(config)
  return parse(output) as Record<string, unknown>
}

describe('generateGitlabCI', () => {
  it('generates a full Node pipeline with docker build and Pages deploy', () => {
    const config = defaultConfig()
    config.projectName = 'My App'
    config.docker.enabled = true
    config.deploy.target = 'pages'

    const output = generateGitlabCI(config)
    const doc = parse(output) as Record<string, unknown>

    expect(doc.stages).toEqual(['test', 'build', 'package', 'deploy'])
    expect(doc).toHaveProperty('workflow')
    expect(doc).toHaveProperty('lint')
    expect(doc).toHaveProperty('test')
    expect(doc).toHaveProperty('build')
    expect(doc).toHaveProperty('docker-build')
    expect(doc).toHaveProperty('pages')

    // Kaniko is the default image build method.
    expect(output).toContain('gcr.io/kaniko-project/executor')
    expect(output).toContain('--destination "$CI_REGISTRY_IMAGE:${CI_COMMIT_SHORT_SHA}"')

    // Cache keyed on the npm lockfile.
    const cache = doc.cache as { key: { files: string[] }; paths: string[] }
    expect(cache.key.files).toEqual(['package-lock.json'])
    expect(cache.paths).toEqual(['.npm/'])

    // Security templates included.
    expect(doc.include).toEqual([
      { template: 'Security/SAST.gitlab-ci.yml' },
      { template: 'Security/Secret-Detection.gitlab-ci.yml' },
    ])
  })

  it('uses poetry commands and pip cache variables for Python + poetry', () => {
    const config = applyLanguageDefaults(defaultConfig(), 'python', 'poetry')
    const doc = parseYaml(config)

    const test = doc.test as { before_script: string[]; script: string[] }
    expect(test.before_script).toEqual(['pip install poetry && poetry install'])
    expect(test.script).toEqual(['poetry run pytest'])

    const variables = doc.variables as Record<string, string>
    expect(variables.PIP_CACHE_DIR).toBe('$CI_PROJECT_DIR/.cache/pip')
    expect(variables.POETRY_VIRTUALENVS_IN_PROJECT).toBe('true')
  })

  it('generates a minimal Go pipeline without docker, deploy, or security', () => {
    const config = applyLanguageDefaults(defaultConfig(), 'go')
    config.jobs.security = false
    config.pipeline.workflowRules = false

    const output = generateGitlabCI(config)
    const doc = parse(output) as Record<string, unknown>

    expect(doc.stages).toEqual(['test', 'build'])
    expect(doc).not.toHaveProperty('workflow')
    expect(doc).not.toHaveProperty('include')
    expect(doc).not.toHaveProperty('docker-build')
    expect(output).toContain('go test ./...')
  })

  it('publishes a repo-root static site to Pages with the dotfile-safe copy', () => {
    const config = applyLanguageDefaults(defaultConfig(), 'static')
    config.jobs.security = false

    const doc = parseYaml(config)
    expect(doc.stages).toEqual(['deploy'])

    const pages = doc.pages as { script: string[]; artifacts: { paths: string[] } }
    expect(pages.script).toContain('mkdir .public')
    expect(pages.script).toContain('mv .public public')
    expect(pages.artifacts.paths).toEqual(['public'])
  })

  it('emits only/except instead of rules when the legacy style is chosen', () => {
    const config = defaultConfig()
    config.docker.enabled = true
    config.deploy.target = 'ssh'
    config.pipeline.rulesStyle = 'only-except'

    const doc = parseYaml(config)
    const docker = doc['docker-build'] as Record<string, unknown>
    expect(docker.only).toEqual(['main', 'tags'])
    expect(docker.rules).toBeUndefined()

    const deploy = doc.deploy as Record<string, unknown>
    expect(deploy.only).toEqual(['main'])
  })

  it('respects a custom release branch in job rules', () => {
    const config = defaultConfig()
    config.deploy.target = 'custom'
    config.deploy.branch = 'production'
    config.deploy.script = 'echo step one\necho step two'

    const doc = parseYaml(config)
    const deploy = doc.deploy as { script: string[]; rules: { if: string }[] }
    expect(deploy.script).toEqual(['echo step one', 'echo step two'])
    expect(deploy.rules[0].if).toBe('$CI_COMMIT_BRANCH == "production"')
  })

  it('switches docker build recipe with the chosen method', () => {
    const config = defaultConfig()
    config.docker.enabled = true

    config.docker.method = 'dind'
    let output = generateGitlabCI(config)
    expect(output).toContain('docker:27-dind')
    expect(parse(output)).toHaveProperty('docker-build')

    config.docker.method = 'buildah'
    output = generateGitlabCI(config)
    expect(output).toContain('buildah bud')
    expect(parse(output)).toHaveProperty('docker-build')
  })

  it('quotes script lines that would break YAML plain scalars', () => {
    const config = defaultConfig()
    config.jobs.testCommand = 'echo "done: ok"'
    const doc = parseYaml(config)
    const test = doc.test as { script: string[] }
    expect(test.script).toEqual(['echo "done: ok"'])
  })

  it('produces valid YAML for every language at its defaults', () => {
    for (const { value } of LANGUAGES) {
      const config = applyLanguageDefaults(defaultConfig(), value, defaultPackageManager(value))
      const output = generateGitlabCI(config)
      expect(() => parse(output), `language: ${value}`).not.toThrow()
      const doc = parse(output) as Record<string, unknown>
      expect(doc.stages, `language: ${value}`).toEqual(activeStages(config))
    }
  })

  it('produces valid YAML for every deploy target', () => {
    const targets = ['none', 'pages', 'ssh', 'kubernetes', 'helm', 's3', 'npm', 'custom'] as const
    for (const target of targets) {
      const config = defaultConfig()
      config.deploy.target = target
      config.deploy.environmentUrl = 'https://example.com'
      const output = generateGitlabCI(config)
      expect(() => parse(output), `target: ${target}`).not.toThrow()
      if (target !== 'none') {
        const doc = parse(output) as Record<string, unknown>
        const jobName = target === 'pages' ? 'pages' : target === 'npm' ? 'publish' : 'deploy'
        expect(doc, `target: ${target}`).toHaveProperty(jobName)
      }
    }
  })
})
