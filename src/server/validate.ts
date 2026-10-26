/**
 * Validation + merge for the HTTP API: a request body is a *partial*
 * PipelineConfig that gets validated against a declarative spec (all issues
 * collected, unknown keys rejected) and then layered over defaultConfig()
 * the same way the wizard does — language/packageManager go through
 * applyLanguageDefaults first, explicit fields win afterwards.
 */

import {
  applyLanguageDefaults,
  defaultConfig,
  LANGUAGES,
} from '../data/defaults'
import {
  DEPLOY_TARGETS,
  DOCKER_METHODS,
  REGISTRY_TARGETS,
  RULES_STYLES,
} from '../data/enums'
import type { Language, PackageManager, PipelineConfig } from '../types'

export interface ValidationIssue {
  path: string
  message: string
}

export type ValidateResult =
  | { ok: true; config: PipelineConfig }
  | { ok: false; issues: ValidationIssue[] }

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends string[]
    ? string[]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K]
}

/**
 * Spec leaves: 'string' | 'boolean' | 'string[]', or an array of allowed
 * enum values. `satisfies Spec<PipelineConfig>` keeps the spec key-for-key
 * in lockstep with types.ts — a missing or extra key fails to compile.
 */
type Spec<T> = {
  [K in keyof T]-?: T[K] extends boolean
    ? 'boolean'
    : T[K] extends string[]
      ? 'string[]'
      : T[K] extends string
        ? 'string' | readonly T[K][]
        : Spec<T[K]>
}

const LANGUAGE_VALUES = LANGUAGES.map((l) => l.value)
const PACKAGE_MANAGERS: PackageManager[] = [
  ...new Set(LANGUAGES.flatMap((l) => l.pms)),
  'none',
]

const CONFIG_SPEC = {
  projectName: 'string',
  language: LANGUAGE_VALUES,
  packageManager: PACKAGE_MANAGERS,
  image: 'string',
  cache: 'boolean',
  jobs: {
    lint: 'boolean',
    test: 'boolean',
    build: 'boolean',
    security: 'boolean',
    installCommand: 'string',
    lintCommand: 'string',
    testCommand: 'string',
    buildCommand: 'string',
    buildArtifacts: 'string[]',
  },
  docker: {
    enabled: 'boolean',
    method: DOCKER_METHODS,
    registry: REGISTRY_TARGETS,
    customRegistry: 'string',
    imageName: 'string',
    dockerfilePath: 'string',
  },
  deploy: {
    target: DEPLOY_TARGETS,
    branch: 'string',
    environmentName: 'string',
    environmentUrl: 'string',
    buildDir: 'string',
    script: 'string',
  },
  pipeline: {
    rulesStyle: RULES_STYLES,
    workflowRules: 'boolean',
  },
} satisfies Spec<PipelineConfig>

type SpecNode = { [key: string]: SpecLeaf | SpecNode }
type SpecLeaf = 'string' | 'boolean' | 'string[]' | readonly string[]

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function checkLeaf(
  leaf: SpecLeaf,
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (leaf === 'string') {
    if (typeof value !== 'string')
      issues.push({ path, message: 'must be a string' })
  } else if (leaf === 'boolean') {
    if (typeof value !== 'boolean')
      issues.push({ path, message: 'must be a boolean' })
  } else if (leaf === 'string[]') {
    if (!Array.isArray(value) || value.some((v) => typeof v !== 'string'))
      issues.push({ path, message: 'must be an array of strings' })
  } else if (typeof value !== 'string' || !leaf.includes(value)) {
    issues.push({ path, message: `must be one of: ${leaf.join(', ')}` })
  }
}

function walk(
  spec: SpecNode,
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isPlainObject(value)) {
    issues.push({ path: path || '(body)', message: 'must be a JSON object' })
    return
  }
  for (const [key, v] of Object.entries(value)) {
    if (v === undefined) continue
    const childPath = path ? `${path}.${key}` : key
    const leaf = spec[key]
    if (leaf === undefined) {
      issues.push({ path: childPath, message: 'unknown key' })
    } else if (typeof leaf === 'string' || Array.isArray(leaf)) {
      checkLeaf(leaf as SpecLeaf, v, childPath, issues)
    } else {
      walk(leaf as SpecNode, v, childPath, issues)
    }
  }
}

/** The wizard's constraint: pm must come from the language's pms list. */
function checkLanguagePm(
  partial: DeepPartial<PipelineConfig>,
  issues: ValidationIssue[],
): void {
  if (partial.packageManager === undefined) return
  const language = (partial.language ?? defaultConfig().language) as Language
  const entry = LANGUAGES.find((l) => l.value === language)
  if (!entry) return // language itself already reported
  const valid: PackageManager[] = entry.pms.length > 0 ? entry.pms : ['none']
  if (!valid.includes(partial.packageManager as PackageManager)) {
    issues.push({
      path: 'packageManager',
      message: `"${partial.packageManager}" is not valid for language "${language}" (valid: ${valid.join(', ')})`,
    })
  }
}

/** Deep-merge a validated partial onto a full config; arrays replace wholesale. */
function merge<T extends object>(base: T, patch: DeepPartial<T>): T {
  const out = { ...base } as Record<string, unknown>
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    out[key] = isPlainObject(value) ? merge(out[key] as object, value) : value
  }
  return out as T
}

export function validateAndMerge(body: unknown): ValidateResult {
  const issues: ValidationIssue[] = []
  walk(CONFIG_SPEC, body, '', issues)
  if (issues.length === 0)
    checkLanguagePm(body as DeepPartial<PipelineConfig>, issues)
  if (issues.length > 0) return { ok: false, issues }

  const partial = body as DeepPartial<PipelineConfig>
  let config = defaultConfig()
  if (partial.language !== undefined || partial.packageManager !== undefined) {
    config = applyLanguageDefaults(
      config,
      (partial.language ?? config.language) as Language,
      partial.packageManager as PackageManager | undefined,
    )
  }
  return { ok: true, config: merge(config, partial) }
}
