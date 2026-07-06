/**
 * YAML fragment builders. Each function returns an array of lines (no
 * trailing newline); generate.ts stitches them together with blank lines.
 *
 * The YAML is hand-assembled (not serialized) so the output carries
 * comments and reads like a pipeline written by a person.
 */
import type { PipelineConfig } from '../types'
import { languageDefaults } from '../data/defaults'

/**
 * Quote a shell command for use as a YAML plain scalar when needed.
 * Plain style is kept where safe so the file stays human-readable.
 */
export function yamlScalar(value: string): string {
  const needsQuoting =
    value === '' ||
    /^[\s"'>|@`&*!%#{[\]},]/.test(value) ||
    /:(\s|$)/.test(value) ||
    /\s#/.test(value) ||
    /\s$/.test(value)
  return needsQuoting ? JSON.stringify(value) : value
}

/** Split a possibly multi-line command string into script lines. */
export function scriptLines(command: string): string[] {
  return command
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '')
}

function emitScriptList(key: string, commands: string[], indent = '  '): string[] {
  const lines = [`${indent}${key}:`]
  for (const c of commands) lines.push(`${indent}  - ${yamlScalar(c)}`)
  return lines
}

/** Branch (and optionally tag) restriction for release-ish jobs. */
export function releaseRestriction(
  config: PipelineConfig,
  opts: { tags?: boolean } = {},
): string[] {
  const branch = config.deploy.branch || 'main'
  if (config.pipeline.rulesStyle === 'only-except') {
    const lines = ['  only:', `    - ${branch}`]
    if (opts.tags) lines.push('    - tags')
    return lines
  }
  const lines = ['  rules:', `    - if: '$CI_COMMIT_BRANCH == "${branch}"'`]
  if (opts.tags) lines.push(`    - if: '$CI_COMMIT_TAG'`)
  return lines
}

export function headerComment(config: PipelineConfig): string[] {
  const name = config.projectName.trim()
  const what =
    config.language === 'docker'
      ? 'container image'
      : `${config.language}${config.packageManager !== 'none' ? ` / ${config.packageManager}` : ''}`
  return [
    '# ----------------------------------------------------------------------------',
    `# .gitlab-ci.yml${name ? ` — ${name}` : ''} (${what})`,
    '# Generated with GitLab CI Generator — review before committing.',
    '#',
    '# Jobs that push images or deploy may need CI/CD variables configured under',
    '# Settings > CI/CD > Variables; each job notes what it expects.',
    '# ----------------------------------------------------------------------------',
  ]
}

export function stagesBlock(stages: string[]): string[] {
  return ['stages:', ...stages.map((s) => `  - ${s}`)]
}

export function workflowBlock(): string[] {
  return [
    '# Run merge-request pipelines and branch pipelines, but never both for the',
    '# same commit (avoids duplicate pipelines when an MR is open).',
    'workflow:',
    '  rules:',
    `    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'`,
    `    - if: '$CI_COMMIT_BRANCH && $CI_OPEN_MERGE_REQUESTS'`,
    '      when: never',
    `    - if: '$CI_COMMIT_BRANCH'`,
    `    - if: '$CI_COMMIT_TAG'`,
  ]
}

export function defaultBlock(config: PipelineConfig): string[] {
  const lines = ['default:']
  if (config.image.trim() !== '') lines.push(`  image: ${yamlScalar(config.image.trim())}`)
  lines.push('  interruptible: true')
  return lines
}

export function variablesBlock(config: PipelineConfig): string[] {
  if (!config.cache) return []
  const vars = languageDefaults(config.language, config.packageManager).cacheVariables
  const entries = Object.entries(vars)
  if (entries.length === 0) return []
  return ['variables:', ...entries.map(([k, v]) => `  ${k}: "${v}"`)]
}

export function cacheBlock(config: PipelineConfig): string[] {
  if (!config.cache) return []
  const d = languageDefaults(config.language, config.packageManager)
  if (d.cachePaths.length === 0) return []
  const lines = ['# Cache dependencies between pipelines.', 'cache:']
  if (d.cacheKeyFiles.length > 0) {
    lines.push('  key:', '    files:')
    for (const f of d.cacheKeyFiles) lines.push(`      - ${f}`)
  }
  lines.push('  paths:')
  for (const p of d.cachePaths) lines.push(`    - ${p}`)
  return lines
}

export function securityInclude(): string[] {
  return [
    '# GitLab-maintained security scanners (results under Secure > Vulnerability report).',
    'include:',
    '  - template: Security/SAST.gitlab-ci.yml',
    '  - template: Security/Secret-Detection.gitlab-ci.yml',
  ]
}

function coreJob(
  name: string,
  stage: string,
  config: PipelineConfig,
  command: string,
  extra: string[] = [],
): string[] {
  const lines = [`${name}:`, `  stage: ${stage}`]
  const install = scriptLines(config.jobs.installCommand)
  if (install.length > 0) lines.push(...emitScriptList('before_script', install))
  lines.push(...emitScriptList('script', scriptLines(command)))
  lines.push(...extra)
  return lines
}

export function lintJob(config: PipelineConfig): string[] {
  return coreJob('lint', 'test', config, config.jobs.lintCommand)
}

export function testJob(config: PipelineConfig): string[] {
  return coreJob('test', 'test', config, config.jobs.testCommand)
}

export function buildJob(config: PipelineConfig): string[] {
  const artifacts = config.jobs.buildArtifacts.filter((a) => a.trim() !== '')
  const extra: string[] = []
  if (artifacts.length > 0) {
    extra.push('  artifacts:', '    paths:')
    for (const a of artifacts) extra.push(`      - ${a}`)
    extra.push('    expire_in: 1 week')
  }
  return coreJob('build', 'build', config, config.jobs.buildCommand, extra)
}

/** Registry host + login credentials per registry choice. */
function registryEnv(config: PipelineConfig): {
  host: string
  user: string
  password: string
  note: string[]
} {
  switch (config.docker.registry) {
    case 'dockerhub':
      return {
        host: 'docker.io',
        user: '$DOCKERHUB_USERNAME',
        password: '$DOCKERHUB_TOKEN',
        note: [
          '# Requires CI/CD variables: DOCKERHUB_USERNAME, DOCKERHUB_TOKEN (access token).',
        ],
      }
    case 'custom':
      return {
        host: config.docker.customRegistry || 'registry.example.com',
        user: '$REGISTRY_USER',
        password: '$REGISTRY_PASSWORD',
        note: ['# Requires CI/CD variables: REGISTRY_USER, REGISTRY_PASSWORD.'],
      }
    default:
      return {
        host: '$CI_REGISTRY',
        user: '$CI_REGISTRY_USER',
        password: '$CI_JOB_TOKEN',
        note: [
          "# Pushes to this project's GitLab container registry using the job token —",
          '# no extra variables needed.',
        ],
      }
  }
}

export function dockerJob(config: PipelineConfig): string[] {
  const { host, user, password, note } = registryEnv(config)
  const image = config.docker.imageName.trim() || '$CI_REGISTRY_IMAGE'
  const dockerfile = config.docker.dockerfilePath.trim() || 'Dockerfile'
  const restriction = releaseRestriction(config, { tags: true })

  if (config.docker.method === 'kaniko') {
    return [
      '# Build and push the image with Kaniko — works on shared runners without',
      '# privileged mode or docker-in-docker.',
      ...note,
      'docker-build:',
      '  stage: package',
      '  image:',
      '    name: gcr.io/kaniko-project/executor:v1.23.2-debug',
      '    entrypoint: [""]',
      '  script:',
      '    - mkdir -p /kaniko/.docker',
      `    - echo "{\\"auths\\":{\\"${host}\\":{\\"auth\\":\\"$(printf '%s:%s' "${user}" "${password}" | base64 | tr -d '\\n')\\"}}}" > /kaniko/.docker/config.json`,
      '    - >-',
      '      /kaniko/executor',
      '      --context "${CI_PROJECT_DIR}"',
      `      --dockerfile "\${CI_PROJECT_DIR}/${dockerfile}"`,
      `      --destination "${image}:\${CI_COMMIT_SHORT_SHA}"`,
      `      --destination "${image}:latest"`,
      ...restriction,
    ]
  }

  if (config.docker.method === 'buildah') {
    return [
      '# Build and push the image with Buildah (daemonless, rootless-friendly).',
      ...note,
      'docker-build:',
      '  stage: package',
      '  image: quay.io/buildah/stable:latest',
      '  variables:',
      '    STORAGE_DRIVER: vfs',
      '  script:',
      `    - buildah login -u "${user}" -p "${password}" ${host}`,
      `    - buildah bud -f ${dockerfile} -t "${image}:\${CI_COMMIT_SHORT_SHA}" -t "${image}:latest" .`,
      `    - buildah push "${image}:\${CI_COMMIT_SHORT_SHA}"`,
      `    - buildah push "${image}:latest"`,
      ...restriction,
    ]
  }

  // docker-in-dind — requires a runner that allows privileged containers.
  return [
    '# Build and push the image with docker-in-docker.',
    '# NOTE: the runner must allow privileged containers for the dind service.',
    ...note,
    'docker-build:',
    '  stage: package',
    '  image: docker:27',
    '  services:',
    '    - docker:27-dind',
    '  variables:',
    '    DOCKER_TLS_CERTDIR: "/certs"',
    '  script:',
    `    - echo "${password}" | docker login -u "${user}" --password-stdin ${host}`,
    `    - docker build -f ${dockerfile} -t "${image}:\${CI_COMMIT_SHORT_SHA}" -t "${image}:latest" .`,
    `    - docker push "${image}:\${CI_COMMIT_SHORT_SHA}"`,
    `    - docker push "${image}:latest"`,
    ...restriction,
  ]
}

function environmentBlock(config: PipelineConfig): string[] {
  const { environmentName, environmentUrl } = config.deploy
  if (environmentName.trim() === '') return []
  const lines = ['  environment:', `    name: ${yamlScalar(environmentName.trim())}`]
  if (environmentUrl.trim() !== '') lines.push(`    url: ${yamlScalar(environmentUrl.trim())}`)
  return lines
}

export function deployJob(config: PipelineConfig): string[] {
  const restriction = releaseRestriction(config)
  const buildDir = config.deploy.buildDir.trim() || 'dist'

  switch (config.deploy.target) {
    case 'pages': {
      const script =
        buildDir === '.'
          ? [
              // `*` skips dotfiles, so .public never copies into itself.
              '    - mkdir .public',
              '    - cp -r * .public',
              '    - rm -rf public',
              '    - mv .public public',
            ]
          : ['    - rm -rf public', `    - cp -r ${buildDir} public`]
      return [
        '# Publish with GitLab Pages (Deploy > Pages once the first run finishes).',
        'pages:',
        '  stage: deploy',
        '  script:',
        ...script,
        '  artifacts:',
        '    paths:',
        '      - public',
        ...restriction,
      ]
    }
    case 'ssh':
      return [
        '# Deploy over SSH/rsync. Requires CI/CD variables:',
        '#   SSH_PRIVATE_KEY  — key with access to the server',
        '#   SSH_KNOWN_HOSTS  — output of: ssh-keyscan <your-server>',
        '#   DEPLOY_USER, DEPLOY_HOST, DEPLOY_PATH',
        'deploy:',
        '  stage: deploy',
        '  image: alpine:3.20',
        '  before_script:',
        '    - apk add --no-cache openssh-client rsync',
        '    - eval "$(ssh-agent -s)"',
        `    - echo "$SSH_PRIVATE_KEY" | tr -d '\\r' | ssh-add -`,
        '    - mkdir -p ~/.ssh && chmod 700 ~/.ssh',
        '    - echo "$SSH_KNOWN_HOSTS" >> ~/.ssh/known_hosts',
        '    - chmod 644 ~/.ssh/known_hosts',
        '  script:',
        `    - rsync -az --delete ${buildDir}/ "$DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_PATH"`,
        ...environmentBlock(config),
        ...restriction,
      ]
    case 'kubernetes':
      return [
        '# Deploy to Kubernetes via a GitLab agent connection',
        '# (Operate > Kubernetes clusters). KUBE_CONTEXT is usually',
        '# "<group>/<agent-config-project>:<agent-name>".',
        'deploy:',
        '  stage: deploy',
        '  image:',
        '    name: bitnami/kubectl:latest',
        '    entrypoint: [""]',
        '  script:',
        '    - kubectl config use-context "$KUBE_CONTEXT"',
        '    - kubectl apply -f k8s/',
        ...environmentBlock(config),
        ...restriction,
      ]
    case 'helm': {
      const release = config.projectName.trim() !== '' ? slug(config.projectName) : 'my-app'
      return [
        '# Deploy with Helm via a GitLab agent connection (KUBE_CONTEXT as above).',
        'deploy:',
        '  stage: deploy',
        '  image:',
        '    name: alpine/helm:3.16.2',
        '    entrypoint: [""]',
        '  script:',
        '    - kubectl config use-context "$KUBE_CONTEXT"',
        '    - >-',
        `      helm upgrade --install ${release} ./chart`,
        `      --namespace ${release} --create-namespace`,
        '      --set image.tag="$CI_COMMIT_SHORT_SHA"',
        '      --wait',
        ...environmentBlock(config),
        ...restriction,
      ]
    }
    case 's3':
      return [
        '# Sync the built site to S3. Requires CI/CD variables:',
        '#   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION, S3_BUCKET',
        'deploy:',
        '  stage: deploy',
        '  image:',
        '    name: amazon/aws-cli:latest',
        '    entrypoint: [""]',
        '  script:',
        `    - aws s3 sync ${buildDir}/ "s3://$S3_BUCKET" --delete`,
        ...environmentBlock(config),
        ...restriction,
      ]
    case 'npm': {
      const lines = [
        "# Publish the package to this project's GitLab package registry on tags.",
        '# To publish to npmjs.org instead: replace the .npmrc lines with',
        '#   echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > .npmrc && npm publish',
        'publish:',
        '  stage: deploy',
        '  script:',
        `    - echo "//\${CI_SERVER_HOST}/api/v4/projects/\${CI_PROJECT_ID}/packages/npm/:_authToken=\${CI_JOB_TOKEN}" > .npmrc`,
        `    - npm publish --registry "https://\${CI_SERVER_HOST}/api/v4/projects/\${CI_PROJECT_ID}/packages/npm/"`,
      ]
      if (config.pipeline.rulesStyle === 'only-except') {
        lines.push('  only:', '    - tags')
      } else {
        lines.push('  rules:', `    - if: '$CI_COMMIT_TAG'`)
      }
      return lines
    }
    case 'custom': {
      const commands = scriptLines(config.deploy.script)
      return [
        '# Custom deploy step — edit to match your infrastructure.',
        'deploy:',
        '  stage: deploy',
        ...emitScriptList(
          'script',
          commands.length > 0 ? commands : ['echo "add your deploy commands here"'],
        ),
        ...environmentBlock(config),
        ...restriction,
      ]
    }
    default:
      return []
  }
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'my-app'
  )
}
