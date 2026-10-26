/**
 * The question form. Five sections; every answer updates the config and the
 * YAML preview re-renders live.
 */

import { applyLanguageDefaults, LANGUAGES } from '../data/defaults'
import type {
  DeployTarget,
  DockerMethod,
  Language,
  PackageManager,
  PipelineConfig,
  RegistryTarget,
  RulesStyle,
} from '../types'
import {
  RadioGroup,
  SelectField,
  TextAreaField,
  TextField,
  ToggleField,
} from './Field'
import { Section } from './Section'

const PM_LABELS: Record<PackageManager, string> = {
  npm: 'npm',
  yarn: 'Yarn',
  pnpm: 'pnpm',
  pip: 'pip (requirements.txt)',
  poetry: 'Poetry',
  pipenv: 'Pipenv',
  maven: 'Maven',
  gradle: 'Gradle',
  none: 'None',
}

const DEPLOY_OPTIONS: { value: DeployTarget; label: string }[] = [
  { value: 'none', label: 'No deployment' },
  { value: 'pages', label: 'GitLab Pages (static site)' },
  { value: 'ssh', label: 'SSH / rsync to a server' },
  { value: 'kubernetes', label: 'Kubernetes (kubectl apply)' },
  { value: 'helm', label: 'Kubernetes (Helm chart)' },
  { value: 's3', label: 'AWS S3 sync' },
  { value: 'npm', label: 'Publish npm package' },
  { value: 'custom', label: 'Custom script' },
]

export function Wizard(props: {
  config: PipelineConfig
  onChange: (config: PipelineConfig) => void
}) {
  const { config, onChange } = props

  const patch = (p: Partial<PipelineConfig>) => onChange({ ...config, ...p })
  const patchJobs = (p: Partial<PipelineConfig['jobs']>) =>
    onChange({ ...config, jobs: { ...config.jobs, ...p } })
  const patchDocker = (p: Partial<PipelineConfig['docker']>) =>
    onChange({ ...config, docker: { ...config.docker, ...p } })
  const patchDeploy = (p: Partial<PipelineConfig['deploy']>) =>
    onChange({ ...config, deploy: { ...config.deploy, ...p } })
  const patchPipeline = (p: Partial<PipelineConfig['pipeline']>) =>
    onChange({ ...config, pipeline: { ...config.pipeline, ...p } })

  const languageEntry = LANGUAGES.find((l) => l.value === config.language)
  const pms = languageEntry?.pms ?? []
  const isDockerOnly = config.language === 'docker'
  const isStatic = config.language === 'static'
  const hasCoreJobs = !isDockerOnly && !isStatic
  const deployUsesBuildDir = ['pages', 'ssh', 's3'].includes(
    config.deploy.target,
  )
  const deployHasEnvironment = [
    'ssh',
    'kubernetes',
    'helm',
    's3',
    'custom',
  ].includes(config.deploy.target)

  return (
    <div className="wizard">
      <Section
        step={1}
        title="Project basics"
        description="What are we building a pipeline for?"
      >
        <TextField
          label="Project name (optional)"
          value={config.projectName}
          onChange={(v) => patch({ projectName: v })}
          placeholder="my-app"
        />
        <RadioGroup<Language>
          label="Language / project type"
          value={config.language}
          options={LANGUAGES.map((l) => ({ value: l.value, label: l.label }))}
          onChange={(language) =>
            onChange(applyLanguageDefaults(config, language))
          }
        />
        {pms.length > 0 && (
          <SelectField<PackageManager>
            label="Package manager"
            value={config.packageManager}
            options={pms.map((pm) => ({ value: pm, label: PM_LABELS[pm] }))}
            onChange={(pm) =>
              onChange(applyLanguageDefaults(config, config.language, pm))
            }
          />
        )}
        {!isDockerOnly && (
          <TextField
            label="CI image"
            value={config.image}
            onChange={(v) => patch({ image: v })}
            hint="Default image jobs run in (any image from Docker Hub or your registry)."
            mono
          />
        )}
      </Section>

      <Section
        step={2}
        title="Jobs & stages"
        description="Which checks should run on every pipeline?"
      >
        {hasCoreJobs && (
          <>
            <TextField
              label="Install command"
              value={config.jobs.installCommand}
              onChange={(v) => patchJobs({ installCommand: v })}
              hint="Runs as before_script in each job below."
              mono
            />
            <ToggleField
              label="Lint"
              checked={config.jobs.lint}
              onChange={(v) => patchJobs({ lint: v })}
            >
              <TextField
                label="Lint command"
                value={config.jobs.lintCommand}
                onChange={(v) => patchJobs({ lintCommand: v })}
                mono
              />
            </ToggleField>
            <ToggleField
              label="Test"
              checked={config.jobs.test}
              onChange={(v) => patchJobs({ test: v })}
            >
              <TextField
                label="Test command"
                value={config.jobs.testCommand}
                onChange={(v) => patchJobs({ testCommand: v })}
                mono
              />
            </ToggleField>
            <ToggleField
              label="Build"
              checked={config.jobs.build}
              onChange={(v) => patchJobs({ build: v })}
            >
              <TextField
                label="Build command"
                value={config.jobs.buildCommand}
                onChange={(v) => patchJobs({ buildCommand: v })}
                mono
              />
              <TextField
                label="Build artifacts"
                value={config.jobs.buildArtifacts.join(', ')}
                onChange={(v) =>
                  patchJobs({
                    buildArtifacts: v
                      .split(',')
                      .map((s) => s.trim())
                      .filter((s) => s !== ''),
                  })
                }
                hint="Comma-separated paths kept as job artifacts (e.g. dist/, build/)."
                mono
              />
            </ToggleField>
          </>
        )}
        <ToggleField
          label="Security scanning"
          checked={config.jobs.security}
          onChange={(v) => patchJobs({ security: v })}
          hint="Includes GitLab's maintained SAST and Secret Detection templates."
        />
      </Section>

      <Section
        step={3}
        title="Container image"
        description="Build and push a Docker image from your Dockerfile?"
      >
        <ToggleField
          label="Build a container image"
          checked={config.docker.enabled}
          onChange={(v) => patchDocker({ enabled: v })}
        >
          <RadioGroup<DockerMethod>
            label="Build method"
            value={config.docker.method}
            options={[
              {
                value: 'kaniko',
                label: 'Kaniko',
                description:
                  'Works on shared runners — no privileged mode needed. Recommended.',
              },
              {
                value: 'dind',
                label: 'Docker-in-Docker',
                description:
                  'Classic docker build; requires a privileged runner.',
              },
              {
                value: 'buildah',
                label: 'Buildah',
                description: 'Daemonless OCI builds, rootless-friendly.',
              },
            ]}
            onChange={(method) => patchDocker({ method })}
          />
          <SelectField<RegistryTarget>
            label="Registry"
            value={config.docker.registry}
            options={[
              {
                value: 'gitlab',
                label: 'GitLab container registry (this project)',
              },
              { value: 'dockerhub', label: 'Docker Hub' },
              { value: 'custom', label: 'Custom registry' },
            ]}
            onChange={(registry) =>
              patchDocker({
                registry,
                imageName:
                  registry === 'gitlab'
                    ? '$CI_REGISTRY_IMAGE'
                    : config.docker.imageName,
              })
            }
          />
          {config.docker.registry === 'custom' && (
            <TextField
              label="Registry host"
              value={config.docker.customRegistry}
              onChange={(v) => patchDocker({ customRegistry: v })}
              placeholder="registry.example.com"
              mono
            />
          )}
          <TextField
            label="Image name"
            value={config.docker.imageName}
            onChange={(v) => patchDocker({ imageName: v })}
            hint="Tagged with the commit SHA and latest."
            mono
          />
          <TextField
            label="Dockerfile path"
            value={config.docker.dockerfilePath}
            onChange={(v) => patchDocker({ dockerfilePath: v })}
            mono
          />
        </ToggleField>
      </Section>

      <Section
        step={4}
        title="Deployment"
        description="Where should releases go?"
      >
        <SelectField<DeployTarget>
          label="Deploy target"
          value={config.deploy.target}
          options={DEPLOY_OPTIONS}
          onChange={(target) => patchDeploy({ target })}
        />
        {config.deploy.target !== 'none' && config.deploy.target !== 'npm' && (
          <TextField
            label="Deploy branch"
            value={config.deploy.branch}
            onChange={(v) => patchDeploy({ branch: v })}
            hint="Deploy (and image push) run only on this branch."
            mono
          />
        )}
        {deployUsesBuildDir && (
          <TextField
            label="Directory to publish"
            value={config.deploy.buildDir}
            onChange={(v) => patchDeploy({ buildDir: v })}
            hint='Built site directory. Use "." for the repository root.'
            mono
          />
        )}
        {deployHasEnvironment && (
          <>
            <TextField
              label="Environment name"
              value={config.deploy.environmentName}
              onChange={(v) => patchDeploy({ environmentName: v })}
            />
            <TextField
              label="Environment URL (optional)"
              value={config.deploy.environmentUrl}
              onChange={(v) => patchDeploy({ environmentUrl: v })}
              placeholder="https://example.com"
              mono
            />
          </>
        )}
        {config.deploy.target === 'custom' && (
          <TextAreaField
            label="Deploy script"
            value={config.deploy.script}
            onChange={(v) => patchDeploy({ script: v })}
            placeholder={'./deploy.sh\ncurl -X POST "$WEBHOOK_URL"'}
            hint="One command per line."
          />
        )}
      </Section>

      <Section
        step={5}
        title="Pipeline behaviour"
        description="House-keeping that keeps pipelines fast and tidy."
      >
        <ToggleField
          label="Avoid duplicate pipelines"
          checked={config.pipeline.workflowRules}
          onChange={(v) => patchPipeline({ workflowRules: v })}
          hint="Adds a workflow: block so a commit with an open MR runs one pipeline, not two."
        />
        <ToggleField
          label="Cache dependencies"
          checked={config.cache}
          onChange={(v) => patch({ cache: v })}
          hint="Keyed on your lockfile; speeds up repeat pipelines."
        />
        <RadioGroup<RulesStyle>
          label="Rules style"
          value={config.pipeline.rulesStyle}
          options={[
            {
              value: 'rules',
              label: 'rules: (recommended)',
              description: 'The modern, flexible syntax.',
            },
            {
              value: 'only-except',
              label: 'only / except',
              description: 'Legacy syntax for older GitLab versions.',
            },
          ]}
          onChange={(rulesStyle) => patchPipeline({ rulesStyle })}
        />
      </Section>
    </div>
  )
}
