import { useMemo, useState } from 'react'
import { Wizard } from './components/Wizard'
import { YamlPreview } from './components/YamlPreview'
import { defaultConfig } from './data/defaults'
import { generateGitlabCI } from './generator/generate'
import './App.css'

export default function App() {
  const [config, setConfig] = useState(defaultConfig)
  const yaml = useMemo(() => generateGitlabCI(config), [config])

  return (
    <div className="app">
      <header className="app-header">
        <h1>
          GitLab CI <span className="accent">Generator</span>
        </h1>
        <p>
          Answer a few questions about your project and get a production-ready{' '}
          <span className="mono">.gitlab-ci.yml</span> — sensible stages, caching, security
          scanning, and deployment included.
        </p>
      </header>
      <main className="app-main">
        <Wizard config={config} onChange={setConfig} />
        <div className="preview-pane">
          <YamlPreview yaml={yaml} />
        </div>
      </main>
      <footer className="app-footer">
        Built with React + Vite · Generated pipelines are portable to gitlab.com and
        self-hosted GitLab
      </footer>
    </div>
  )
}
