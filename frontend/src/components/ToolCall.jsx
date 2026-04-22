import { useState } from 'react'

const META = {
  web_search:     { icon: '🔍', label: 'Web search' },
  fetch_url:      { icon: '🌐', label: 'Fetch URL' },
  remember:       { icon: '🧠', label: 'Remember' },
  recall:         { icon: '🧠', label: 'Recall memory' },
  run_python:     { icon: '⚡', label: 'Run code' },
  read_file:      { icon: '📄', label: 'Read file' },
  write_file:     { icon: '💾', label: 'Write file' },
  list_directory: { icon: '📁', label: 'List directory' },
  get_datetime:   { icon: '🕐', label: 'Get date & time' },
  calculate:      { icon: '🧮', label: 'Calculate' },
  save_note:      { icon: '📝', label: 'Save note' },
  take_screenshot:{ icon: '📸', label: 'Screenshot' },
  open_app:       { icon: '🖥️', label: 'Open app' },
  send_email:     { icon: '✉️', label: 'Send email' },
}

export default function ToolCall({ tool }) {
  const [expanded, setExpanded] = useState(false)
  const { icon, label } = META[tool.name] ?? { icon: '🔧', label: tool.name }
  const isDone = tool.status === 'done'

  const subtitle = tool.input
    ? Object.values(tool.input)[0]?.toString().slice(0, 65)
    : null

  return (
    <div className={`tool-card ${tool.status}`}>
      <button
        className="tool-header"
        onClick={() => isDone && setExpanded(e => !e)}
        disabled={!isDone}
      >
        <span className="tool-icon-wrap">{icon}</span>
        <div className="tool-info">
          <span className="tool-name">{label}</span>
          {subtitle && <span className="tool-sub">{subtitle}</span>}
        </div>
        {isDone ? (
          <div className="tool-right">
            <span className="status-pill done">Done</span>
            <ChevronIcon expanded={expanded} />
          </div>
        ) : (
          <div className="tool-right">
            <span className="status-pill running">Running</span>
            <span className="tool-spinner" />
          </div>
        )}
      </button>

      {expanded && isDone && (
        <div className="tool-body">
          {tool.input && Object.keys(tool.input).length > 0 && (
            <Section label="Input">
              <pre className="tool-pre">{JSON.stringify(tool.input, null, 2)}</pre>
            </Section>
          )}
          <Section label="Result">
            <pre className="tool-pre">{tool.result}</pre>
          </Section>
        </div>
      )}
    </div>
  )
}

function Section({ label, children }) {
  return (
    <div className="tool-section">
      <p className="tool-section-label">{label}</p>
      {children}
    </div>
  )
}

function ChevronIcon({ expanded }) {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"
      style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', opacity: 0.5 }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}
