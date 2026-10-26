/**
 * Small controlled form controls shared by the wizard sections.
 */
import type { ReactNode } from 'react'

interface Option<T extends string> {
  value: T
  label: string
  description?: string
}

export function TextField(props: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  hint?: string
  mono?: boolean
}) {
  return (
    <label className="field">
      <span className="field-label">{props.label}</span>
      <input
        type="text"
        className={props.mono ? 'mono' : undefined}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
        spellCheck={false}
      />
      {props.hint && <span className="field-hint">{props.hint}</span>}
    </label>
  )
}

export function TextAreaField(props: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  hint?: string
}) {
  return (
    <label className="field">
      <span className="field-label">{props.label}</span>
      <textarea
        className="mono"
        rows={3}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
        spellCheck={false}
      />
      {props.hint && <span className="field-hint">{props.hint}</span>}
    </label>
  )
}

export function SelectField<T extends string>(props: {
  label: string
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
  hint?: string
}) {
  return (
    <label className="field">
      <span className="field-label">{props.label}</span>
      <select
        value={props.value}
        onChange={(e) => props.onChange(e.target.value as T)}
      >
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {props.hint && <span className="field-hint">{props.hint}</span>}
    </label>
  )
}

export function ToggleField(props: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  hint?: string
  children?: ReactNode
}) {
  return (
    <div className="toggle-field">
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={props.checked}
          onChange={(e) => props.onChange(e.target.checked)}
        />
        <span className="field-label">{props.label}</span>
      </label>
      {props.hint && <span className="field-hint">{props.hint}</span>}
      {props.checked && props.children && (
        <div className="toggle-detail">{props.children}</div>
      )}
    </div>
  )
}

export function RadioGroup<T extends string>(props: {
  label: string
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
}) {
  return (
    <fieldset className="field radio-group">
      <legend className="field-label">{props.label}</legend>
      <div className="radio-options">
        {props.options.map((o) => (
          <label
            key={o.value}
            className={`radio-option${props.value === o.value ? ' selected' : ''}`}
          >
            <input
              type="radio"
              name={props.label}
              value={o.value}
              checked={props.value === o.value}
              onChange={() => props.onChange(o.value)}
            />
            <span>
              <span className="radio-title">{o.label}</span>
              {o.description && (
                <span className="radio-desc">{o.description}</span>
              )}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
