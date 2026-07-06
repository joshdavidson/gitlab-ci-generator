/**
 * The full answer-set collected by the wizard. `generateGitlabCI(config)`
 * turns one of these into a ready-to-commit .gitlab-ci.yml string.
 */

export type Language =
  | 'node'
  | 'python'
  | 'go'
  | 'rust'
  | 'java'
  | 'php'
  | 'ruby'
  | 'dotnet'
  | 'static'
  | 'docker'

export type PackageManager =
  | 'npm'
  | 'yarn'
  | 'pnpm'
  | 'pip'
  | 'poetry'
  | 'pipenv'
  | 'maven'
  | 'gradle'
  | 'none'

export type DockerMethod = 'kaniko' | 'dind' | 'buildah'
export type RegistryTarget = 'gitlab' | 'dockerhub' | 'custom'
export type DeployTarget =
  | 'none'
  | 'pages'
  | 'ssh'
  | 'kubernetes'
  | 'helm'
  | 's3'
  | 'npm'
  | 'custom'
export type RulesStyle = 'rules' | 'only-except'

export interface JobsConfig {
  lint: boolean
  test: boolean
  build: boolean
  /** GitLab SAST + Secret Detection template includes. */
  security: boolean
  installCommand: string
  lintCommand: string
  testCommand: string
  buildCommand: string
  /** Artifact paths produced by the build job (e.g. ["dist/"]). */
  buildArtifacts: string[]
}

export interface DockerConfig {
  enabled: boolean
  method: DockerMethod
  registry: RegistryTarget
  /** Registry host when registry === 'custom' (e.g. registry.example.com). */
  customRegistry: string
  /** Full image name without tag; defaults to $CI_REGISTRY_IMAGE. */
  imageName: string
  dockerfilePath: string
}

export interface DeployConfig {
  target: DeployTarget
  /** Branch that triggers container build + deploy jobs. */
  branch: string
  environmentName: string
  environmentUrl: string
  /** Directory holding the built site (pages / ssh / s3 targets). */
  buildDir: string
  /** Custom deploy script (one command per line) for target === 'custom'. */
  script: string
}

export interface PipelineOptions {
  /** 'rules' = modern rules: keyword; 'only-except' = legacy only/except. */
  rulesStyle: RulesStyle
  /** Emit the standard MR-vs-branch dedup workflow: block. */
  workflowRules: boolean
}

export interface PipelineConfig {
  projectName: string
  language: Language
  packageManager: PackageManager
  /** Default job image (ignored for language === 'docker'). */
  image: string
  /** Cache dependencies between pipelines, keyed on the lockfile. */
  cache: boolean
  jobs: JobsConfig
  docker: DockerConfig
  deploy: DeployConfig
  pipeline: PipelineOptions
}
