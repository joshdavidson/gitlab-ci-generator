/**
 * Runtime value lists for the string unions in types.ts, locked to the types
 * both ways: adding a union member without updating the matching set here
 * (or adding a stray key here) is a compile error via `satisfies`.
 * Language/PackageManager need no lists — LANGUAGES in data/defaults.ts is
 * their runtime source of truth.
 */
import type {
  DeployTarget,
  DockerMethod,
  RegistryTarget,
  RulesStyle,
} from '../types'

const DOCKER_METHOD_SET = {
  kaniko: true,
  dind: true,
  buildah: true,
} as const satisfies Record<DockerMethod, true>
export const DOCKER_METHODS = Object.keys(DOCKER_METHOD_SET) as DockerMethod[]

const REGISTRY_TARGET_SET = {
  gitlab: true,
  dockerhub: true,
  custom: true,
} as const satisfies Record<RegistryTarget, true>
export const REGISTRY_TARGETS = Object.keys(
  REGISTRY_TARGET_SET,
) as RegistryTarget[]

const DEPLOY_TARGET_SET = {
  none: true,
  pages: true,
  ssh: true,
  kubernetes: true,
  helm: true,
  s3: true,
  npm: true,
  custom: true,
} as const satisfies Record<DeployTarget, true>
export const DEPLOY_TARGETS = Object.keys(DEPLOY_TARGET_SET) as DeployTarget[]

const RULES_STYLE_SET = {
  rules: true,
  'only-except': true,
} as const satisfies Record<RulesStyle, true>
export const RULES_STYLES = Object.keys(RULES_STYLE_SET) as RulesStyle[]
