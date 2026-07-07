import { describe, expect, it } from 'vitest'
import { applyLanguageDefaults, defaultConfig } from '../data/defaults'
import { validateAndMerge } from './validate'

describe('validateAndMerge', () => {
  it('materializes the full default config from an empty partial', () => {
    const result = validateAndMerge({})
    expect(result).toEqual({ ok: true, config: defaultConfig() })
  })

  it('routes language through applyLanguageDefaults with its default pm', () => {
    const result = validateAndMerge({ language: 'rust' })
    expect(result).toEqual({
      ok: true,
      config: applyLanguageDefaults(defaultConfig(), 'rust'),
    })
  })

  it('replaces arrays wholesale instead of concatenating', () => {
    const result = validateAndMerge({
      jobs: { buildArtifacts: ['build/', 'coverage/'] },
    })
    expect(result.ok).toBe(true)
    if (result.ok)
      expect(result.config.jobs.buildArtifacts).toEqual(['build/', 'coverage/'])
  })

  it('collects issues from every level in one pass', () => {
    const result = validateAndMerge({
      language: 'fortran',
      docker: { method: 'magic', extra: 1 },
      pipeline: { workflowRules: 'yes' },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.map((i) => i.path).sort()).toEqual([
        'docker.extra',
        'docker.method',
        'language',
        'pipeline.workflowRules',
      ])
    }
  })

  it('rejects non-object array leaves', () => {
    const result = validateAndMerge({ jobs: { buildArtifacts: [1, 'ok'] } })
    expect(result.ok).toBe(false)
  })

  it('accepts a valid language + package manager combination', () => {
    const result = validateAndMerge({ language: 'java', packageManager: 'gradle' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.config.image).toBe('gradle:8-jdk21')
  })

  it('rejects a package manager outside the language pms list', () => {
    const result = validateAndMerge({ language: 'go', packageManager: 'npm' })
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.issues[0].message).toContain('language "go"')
  })
})
