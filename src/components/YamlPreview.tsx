/**
 * Live preview of the generated file with copy + download actions and a
 * lightweight line-based highlighter (comments, keys, list dashes).
 */

import type { ReactNode } from 'react'
import { useCallback, useMemo, useState } from 'react'

function highlightLine(line: string, index: number): ReactNode {
  if (/^\s*#/.test(line)) {
    return (
      <span key={index} className="yaml-comment">
        {line}
      </span>
    )
  }
  const keyMatch = /^(\s*(?:- )?)([A-Za-z_][\w./-]*)(:)(\s|$)/.exec(line)
  if (keyMatch) {
    const [, lead, key, colon] = keyMatch
    const rest = line.slice(lead.length + key.length + colon.length)
    return (
      <span key={index}>
        {lead}
        <span className="yaml-key">{key}</span>
        {colon}
        {rest}
      </span>
    )
  }
  return <span key={index}>{line}</span>
}

export function YamlPreview(props: { yaml: string }) {
  const [copied, setCopied] = useState(false)

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(props.yaml)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API unavailable (e.g. http) — fall back to a manual select.
      window
        .getSelection()
        ?.selectAllChildren(document.querySelector('.yaml-body')!)
    }
  }, [props.yaml])

  const download = useCallback(() => {
    const blob = new Blob([props.yaml], { type: 'text/yaml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '.gitlab-ci.yml'
    a.click()
    URL.revokeObjectURL(url)
  }, [props.yaml])

  const lines = useMemo(
    () => props.yaml.replace(/\n$/, '').split('\n'),
    [props.yaml],
  )

  return (
    <div className="preview">
      <div className="preview-header">
        <span className="preview-title mono">.gitlab-ci.yml</span>
        <span className="preview-meta">{lines.length} lines</span>
        <div className="preview-actions">
          <button type="button" onClick={copy}>
            {copied ? 'Copied ✓' : 'Copy'}
          </button>
          <button type="button" className="primary" onClick={download}>
            Download
          </button>
        </div>
      </div>
      <pre className="yaml-body">
        <code>
          {lines.map((line, i) => (
            <div key={i} className="yaml-line">
              {highlightLine(line, i)}
            </div>
          ))}
        </code>
      </pre>
      <p className="preview-footnote">
        Validate any time in GitLab:{' '}
        <span className="mono">CI/CD → Pipeline editor</span> or{' '}
        <span className="mono">/-/ci/lint</span> on your project.
      </p>
    </div>
  )
}
