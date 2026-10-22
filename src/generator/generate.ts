/**
 * Assemble the final .gitlab-ci.yml from the wizard answers.
 */
import type { PipelineConfig } from '../types'
import {
  buildJob,
  cacheBlock,
  defaultBlock,
  deployJob,
  dockerJob,
  headerComment,
  lintJob,
  securityInclude,
  stagesBlock,
  testJob,
  variablesBlock,
  workflowBlock,
} from './jobs'

/** Stage names, in pipeline order, for the enabled jobs. */
export function activeStages(config: PipelineConfig): string[] {
  const stages: string[] = []
  // The SAST/Secret-Detection templates attach their jobs to the test stage.
  if (config.jobs.lint || config.jobs.test || config.jobs.security)
    stages.push('test')
  if (config.jobs.build) stages.push('build')
  if (config.docker.enabled) stages.push('package')
  if (config.deploy.target !== 'none') stages.push('deploy')
  return stages
}

export function generateGitlabCI(config: PipelineConfig): string {
  const sections: string[][] = []

  sections.push(headerComment(config))

  const stages = activeStages(config)
  if (stages.length > 0) sections.push(stagesBlock(stages))

  if (config.pipeline.workflowRules) sections.push(workflowBlock())

  sections.push(defaultBlock(config))

  const variables = variablesBlock(config)
  if (variables.length > 0) sections.push(variables)

  const cache = cacheBlock(config)
  if (cache.length > 0) sections.push(cache)

  if (config.jobs.security) sections.push(securityInclude())

  if (config.jobs.lint) sections.push(lintJob(config))
  if (config.jobs.test) sections.push(testJob(config))
  if (config.jobs.build) sections.push(buildJob(config))
  if (config.docker.enabled) sections.push(dockerJob(config))

  const deploy = deployJob(config)
  if (deploy.length > 0) sections.push(deploy)

  return sections.map((s) => s.join('\n')).join('\n\n') + '\n'
}
