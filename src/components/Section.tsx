import type { ReactNode } from 'react'

export function Section(props: {
  step: number
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="wizard-section">
      <header>
        <span className="step-badge">{props.step}</span>
        <div>
          <h2>{props.title}</h2>
          {props.description && <p>{props.description}</p>}
        </div>
      </header>
      <div className="section-body">{props.children}</div>
    </section>
  )
}
