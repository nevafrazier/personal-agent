import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Message from './components/Message.jsx'
import ToolCall from './components/ToolCall.jsx'

const AGENT_NAME = "Neva's Agent"
const MAX_SESSIONS = 5

function makeWelcome() {
  return {
    id: 'welcome',
    role: 'assistant',
    content: "Hi Neva! I'm your personal AI assistant. I can search the web, read and write files, run code, remember things across sessions, take screenshots, open apps, and more. What do you need?",
    toolCalls: [],
  }
}

function makeSession(id) {
  return { id, name: `Chat ${id}`, messages: [makeWelcome()] }
}

let _nextId = 2

export default function App() {
  const [mainTab, setMainTab]   = useState('chat')
  const [sessions, setSessions] = useState([makeSession(1)])
  const [activeId, setActiveId] = useState(1)
  const [streamingId, setStreamingId] = useState(null)
  const [streamText, setStreamText]   = useState('')
  const [streamTools, setStreamTools] = useState([])
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)
  const abortRef  = useRef(null)
  const [input, setInput] = useState('')

  const activeSession = sessions.find(s => s.id === activeId)
  const messages = activeSession?.messages ?? []
  const isStreaming = streamingId === activeId

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamText, streamTools, activeId])

  const adjustHeight = () => {
    const ta = inputRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 180) + 'px'
  }

  // ── Session management ────────────────────────────────────
  const addSession = () => {
    if (sessions.length >= MAX_SESSIONS) return
    const id = _nextId++
    setSessions(prev => [...prev, makeSession(id)])
    setActiveId(id)
    setInput('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
  }

  const closeSession = (id, e) => {
    e.stopPropagation()
    if (sessions.length === 1) return
    setSessions(prev => {
      const next = prev.filter(s => s.id !== id)
      if (activeId === id) setActiveId(next[next.length - 1].id)
      return next
    })
  }

  const switchSession = (id) => {
    if (streamingId !== null) return  // don't switch mid-stream
    setActiveId(id)
    setInput('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
  }

  const updateMessages = (sessionId, fn) => {
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages: fn(s.messages) } : s))
  }

  const renameSession = (sessionId, firstMsg) => {
    const name = firstMsg.trim().slice(0, 24) + (firstMsg.trim().length > 24 ? '…' : '')
    setSessions(prev => prev.map(s => s.id === sessionId && s.name === `Chat ${sessionId}` ? { ...s, name } : s))
  }

  // ── Send message ──────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || streamingId !== null) return

    const sid = activeId
    setInput('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
    setStreamingId(sid)
    setStreamText('')
    setStreamTools([])

    const userMsg = { id: Date.now(), role: 'user', content: text }
    updateMessages(sid, msgs => [...msgs, userMsg])
    renameSession(sid, text)

    const apiMessages = [...messages.filter(m => m.id !== 'welcome'), userMsg]
      .map(m => ({ role: m.role, content: m.content || '' }))

    let finalText = ''
    const finalTools = []

    try {
      const controller = new AbortController()
      abortRef.current = controller

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
        signal: controller.signal,
      })

      if (!res.ok) throw new Error(`Server error: ${res.status}`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let event
          try { event = JSON.parse(line.slice(6)) } catch { continue }

          if (event.type === 'text') {
            finalText += event.text
            setStreamText(t => t + event.text)
          } else if (event.type === 'tool_start') {
            const tool = { id: event.id, name: event.name, status: 'running', input: null, result: null }
            finalTools.push(tool)
            setStreamTools(prev => [...prev, tool])
          } else if (event.type === 'email_preview') {
            const emailCard = { id: event.id, name: 'email_preview', status: 'pending', input: { to: event.to, subject: event.subject, body: event.body }, result: null }
            finalTools.push(emailCard)
            setStreamTools(prev => [...prev, emailCard])
          } else if (event.type === 'tool_end') {
            const idx = finalTools.findIndex(t => t.id === event.id)
            if (idx >= 0) finalTools[idx] = { ...finalTools[idx], status: 'done', input: event.input, result: event.result }
            setStreamTools(prev => prev.map(t =>
              t.id === event.id ? { ...t, status: 'done', input: event.input, result: event.result } : t
            ))
          } else if (event.type === 'done') {
            updateMessages(sid, msgs => [...msgs, {
              id: Date.now() + 1,
              role: 'assistant',
              content: finalText,
              toolCalls: [...finalTools],
            }])
            setStreamText('')
            setStreamTools([])
            setStreamingId(null)
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        updateMessages(sid, msgs => [...msgs, {
          id: Date.now(),
          role: 'assistant',
          content: `Something went wrong: ${err.message}`,
          toolCalls: [],
        }])
      }
      setStreamText('')
      setStreamTools([])
      setStreamingId(null)
    }
  }, [input, streamingId, activeId, messages])

  const handleKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const showThinking = isStreaming && !streamText && streamTools.length === 0
  const showStream   = isStreaming && (streamText || streamTools.length > 0)

  return (
    <div className="app">
      <header className="header">
        <div className="header-top">
          <div className="logo">
            <SparklesIcon size={17} className="logo-icon" />
            <span className="logo-name">{AGENT_NAME}</span>
          </div>
          <div className="header-right">
            <Clock />
            <span className="model-badge"><span className="model-dot" />llama-3.3-70b · groq</span>
          </div>
        </div>
        <div className="header-bottom">
          <nav className="tabs">
            <button className={`tab ${mainTab === 'chat' ? 'active' : ''}`} onClick={() => setMainTab('chat')}>Chat</button>
            <button className={`tab ${mainTab === 'memory' ? 'active' : ''}`} onClick={() => setMainTab('memory')}>Memory</button>
            <button className={`tab ${mainTab === 'info' ? 'active' : ''}`} onClick={() => setMainTab('info')}>How it Works</button>
          </nav>
        </div>
      </header>

      {mainTab === 'chat' ? (
        <>
          {/* Session tab bar */}
          <div className="session-bar">
            <div className="session-tabs">
              {sessions.map(s => (
                <button
                  key={s.id}
                  className={`session-tab ${s.id === activeId ? 'active' : ''} ${streamingId === s.id ? 'streaming' : ''}`}
                  onClick={() => switchSession(s.id)}
                  disabled={streamingId !== null && s.id !== activeId}
                >
                  {streamingId === s.id && <span className="session-dot" />}
                  <span className="session-name">{s.name}</span>
                  {sessions.length > 1 && (
                    <span className="session-close" onClick={e => closeSession(s.id, e)}>×</span>
                  )}
                </button>
              ))}
            </div>
            <button
              className="session-add"
              onClick={addSession}
              disabled={sessions.length >= MAX_SESSIONS || streamingId !== null}
              title={sessions.length >= MAX_SESSIONS ? 'Max 5 chats reached' : ''}
            >
              New Chat
            </button>
          </div>

          <main className="chat-area">
            <div className="messages">
              {messages.map(msg => <Message key={msg.id} message={msg} />)}

              {showThinking && (
                <div className="msg-row assistant">
                  <div className="nova-avatar"><SparklesIcon size={13} /></div>
                  <div className="thinking"><span /><span /><span /></div>
                </div>
              )}
              {showStream && (
                <div className="msg-row assistant">
                  <div className="nova-avatar"><SparklesIcon size={13} /></div>
                  <div className="msg-body">
                    {streamTools.map(tool =>
                      tool.name === 'email_preview'
                        ? <EmailPreviewCard key={tool.id} tool={tool} />
                        : <ToolCall key={tool.id} tool={tool} />
                    )}
                    {streamText && (
                      <div className="msg-content">
                        <MdContent content={streamText} />
                        <span className="cursor" />
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </main>

          <footer className="input-area">
            <div className="input-wrap">
              <textarea
                ref={inputRef}
                className="chat-input"
                value={input}
                onChange={e => { setInput(e.target.value); adjustHeight() }}
                onKeyDown={handleKeyDown}
                placeholder="Message your agent..."
                rows={1}
                disabled={isStreaming}
              />
              <button className="send-btn" onClick={sendMessage} disabled={!input.trim() || isStreaming}>
                <SendIcon />
              </button>
            </div>
            <p className="input-hint">Enter to send · Shift+Enter for new line</p>
          </footer>
        </>
      ) : mainTab === 'memory' ? (
        <MemoryTab />
      ) : (
        <InfoTab />
      )}
    </div>
  )
}

// ── Info tab ──────────────────────────────────────────────────────────────────
const INFO_SECTIONS = [
  {
    title: 'Web & Research',
    icon: '🌐',
    items: [
      { name: 'Web Search', desc: 'Search the web for current news, prices, tutorials, or anything up-to-date using DuckDuckGo.' },
      { name: 'Fetch URL', desc: 'Read the full content of any webpage — docs, articles, GitHub pages, product pages, etc.' },
    ],
    how: 'web_search() calls the DuckDuckGo API — no key required. fetch_url() downloads the page using requests, strips scripts, ads, and nav with BeautifulSoup, then returns up to 12,000 characters of clean readable text.',
    example: 'You: "What\'s the latest on GPT-5?"\nAgent calls web_search("GPT-5 release") → reads top 5 results → summarizes for you.',
  },
  {
    title: 'Memory',
    icon: '🧠',
    items: [
      { name: 'Remember', desc: 'Save any fact or detail to persistent memory. Stays across all future conversations — you never have to repeat yourself.' },
      { name: 'Recall', desc: 'Search everything that\'s been saved. Every conversation starts with your full memory preloaded automatically.' },
    ],
    how: 'Facts are saved as key-value pairs in ~/.nevas_agent_memory.json on your Mac. On every new conversation, the entire memory file is loaded and injected into the system prompt before your first message — so the agent already knows everything.',
    example: 'You: "Remember my gym days are Mon/Wed/Fri"\nAgent calls remember("gym schedule", "Mon/Wed/Fri") → stored to disk → recalled automatically next session.',
  },
  {
    title: 'Code & Compute',
    icon: '⚙️',
    items: [
      { name: 'Run Python', desc: 'Execute real Python code and return the output. Use for data processing, automation, math, API calls, scripts — anything.' },
      { name: 'Calculate', desc: 'Evaluate math expressions instantly (supports trig, logarithms, pi, sqrt, etc.).' },
    ],
    how: 'run_python() writes your code to a temp .py file, executes it with python3 via subprocess, captures stdout + stderr, then deletes the temp file. 30-second timeout. calculate() uses Python\'s eval() with a safe math-only sandbox.',
    example: 'You: "How many days until my deadline on June 30?"\nAgent calls run_python() with a datetime script → prints the exact day count.',
  },
  {
    title: 'Files & Notes',
    icon: '📁',
    items: [
      { name: 'Read File', desc: 'Read the contents of any file on your Mac.' },
      { name: 'Write File', desc: 'Create or overwrite files anywhere on your system. Missing folders are created automatically.' },
      { name: 'List Directory', desc: 'Browse the contents of any folder — shows file names, sizes, and subdirectories.' },
      { name: 'Save Note', desc: 'Save a titled markdown note to ~/Desktop/agent-notes/ for easy access.' },
    ],
    how: 'All file operations use Python\'s pathlib. read_file() reads up to 15,000 characters. write_file() calls Path.mkdir(parents=True) so missing folders are never a problem. Notes are saved as timestamped .md files in ~/Desktop/agent-notes/.',
    example: 'You: "Save a note with my project ideas"\nAgent calls save_note("Project Ideas", "1. SaaS tool\\n2. Template pack") → markdown file created on your Desktop.',
  },
  {
    title: 'Mac Control',
    icon: '🖥️',
    items: [
      { name: 'Open App', desc: 'Launch any Mac application by name — Safari, Spotify, Finder, VS Code, etc.' },
      { name: 'Take Screenshot', desc: 'Capture a screenshot of your current screen and save it to the Desktop.' },
    ],
    how: 'open_app() runs the macOS shell command open -a AppName via subprocess. take_screenshot() calls the built-in screencapture -x command (silent, no shutter sound) and saves a timestamped PNG directly to ~/Desktop.',
    example: 'You: "Open Spotify and take a screenshot"\nAgent calls open_app("Spotify"), waits, then calls take_screenshot() → screenshot_20260518_143201.png saved to Desktop.',
  },
  {
    title: 'Communication',
    icon: '✉️',
    items: [
      { name: 'Send Email', desc: 'Send emails via Gmail. Requires GMAIL_ADDRESS and GMAIL_APP_PASSWORD in your .env file.' },
    ],
    how: 'send_email() connects to Gmail\'s SMTP server over SSL on port 465 using Python\'s smtplib. It reads your GMAIL_ADDRESS and GMAIL_APP_PASSWORD from the .env file — your password is never hardcoded. Sends as plain text.',
    example: 'You: "Email my client that the project is done"\nAgent calls send_email("client@co.com", "Project Complete", "Hi — everything is finished and ready for review.")',
  },
  {
    title: 'Utilities',
    icon: '🕒',
    items: [
      { name: 'Date & Time', desc: 'Always knows the current date and time. Automatically injected into every conversation.' },
    ],
    how: 'get_datetime() calls Python\'s datetime.now() and formats it as a human-readable string. It runs automatically at the start of every request and is appended to the system prompt — so the agent never has to guess or ask what time it is.',
    example: 'Every message the agent receives includes:\n"Current date and time: Monday, May 18, 2026 — 03:45 PM"',
  },
  {
    title: 'Browser & Shopping',
    icon: '🛒',
    items: [
      { name: 'Add to Amazon Cart', desc: 'Tell the agent any item and it searches Amazon, finds the best result, and adds it to your cart automatically.' },
      { name: 'Multi-item shopping', desc: 'Ask for a recipe or list — the agent adds every ingredient to your cart one by one.' },
      { name: 'Browser Control', desc: 'For general browsing: open any site, click buttons, fill forms, read pages, take screenshots.' },
    ],
    how: 'add_to_amazon_cart() uses Playwright to control a real Chromium browser. It opens Amazon, types the item in the search box, clicks the first result, then clicks "Add to Cart" — all in one tool call. Your login session is saved in ~/.nevas_agent_browser so you only log in once ever.',
    example: 'You: "Add a pink cat collar and cat litter to my cart"\nAgent calls add_to_amazon_cart("pink cat collar") then add_to_amazon_cart("cat litter") — both added automatically.',
  },
]

function InfoTab() {
  const [flipped, setFlipped] = useState(new Set())

  const toggle = (title) => {
    setFlipped(prev => {
      const n = new Set(prev)
      n.has(title) ? n.delete(title) : n.add(title)
      return n
    })
  }

  return (
    <div className="info-view">
      <div className="info-header">
        <h2 className="info-title">What I Can Do</h2>
        <p className="info-sub">Click any card to see how it works under the hood.</p>
      </div>
      <div className="info-grid">
        {INFO_SECTIONS.map(section => (
          <div
            key={section.title}
            className={`info-card ${flipped.has(section.title) ? 'flipped' : ''}`}
            onClick={() => toggle(section.title)}
          >
            <div className="info-card-inner">
              <div className="info-card-front">
                <div className="info-card-title">
                  <span className="info-icon">{section.icon}</span>
                  {section.title}
                </div>
                <ul className="info-items">
                  {section.items.map(item => (
                    <li key={item.name} className="info-item">
                      <span className="info-item-name">{item.name}</span>
                      <span className="info-item-desc">{item.desc}</span>
                    </li>
                  ))}
                </ul>
                <span className="info-flip-hint">Click to see how →</span>
              </div>
              <div className="info-card-back">
                <div className="info-card-title">
                  <span className="info-icon">{section.icon}</span>
                  How it works
                </div>
                <p className="info-back-how">{section.how}</p>
                <div className="info-back-example">
                  <span className="info-example-label">Example</span>
                  <pre className="info-example-code">{section.example}</pre>
                </div>
                <span className="info-flip-hint">← Click to go back</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Memory tab ────────────────────────────────────────────────────────────────
function MemoryTab() {
  const [memory, setMemory]     = useState(null)
  const [openDates, setOpenDates] = useState(new Set())

  useEffect(() => {
    fetch('/api/memory').then(r => r.json()).then(data => {
      setMemory(data)
      const dates = [...new Set(Object.values(data).map(v => v.saved?.slice(0, 10)).filter(Boolean))].sort().reverse()
      if (dates[0]) setOpenDates(new Set([dates[0]]))
    })
  }, [])

  const deleteEntry = async key => {
    await fetch(`/api/memory/${encodeURIComponent(key)}`, { method: 'DELETE' })
    setMemory(prev => { const n = { ...prev }; delete n[key]; return n })
  }

  const toggleDate = date => setOpenDates(prev => {
    const n = new Set(prev); n.has(date) ? n.delete(date) : n.add(date); return n
  })

  if (memory === null) return <div className="mem-empty">Loading...</div>

  const grouped = {}
  for (const [key, val] of Object.entries(memory)) {
    const date = val.saved?.slice(0, 10) ?? 'Unknown'
    if (!grouped[date]) grouped[date] = []
    grouped[date].push({ key, value: val.value, time: val.saved })
  }
  const dates = Object.keys(grouped).sort().reverse()

  if (dates.length === 0) {
    return (
      <div className="mem-empty">
        <p className="mem-empty-title">No memories yet</p>
        <p className="mem-empty-sub">Tell your agent to "remember" something and it'll appear here.</p>
      </div>
    )
  }

  return (
    <div className="mem-view">
      <div className="mem-header">
        <h2 className="mem-title">Memory</h2>
        <p className="mem-sub">{Object.keys(memory).length} saved {Object.keys(memory).length === 1 ? 'item' : 'items'}</p>
      </div>
      <div className="mem-list">
        {dates.map(date => (
          <div key={date} className="mem-group">
            <button className="mem-date-btn" onClick={() => toggleDate(date)}>
              <span className="mem-date-label">{formatDate(date)}</span>
              <span className="mem-date-count">{grouped[date].length} {grouped[date].length === 1 ? 'item' : 'items'}</span>
              <ChevronIcon expanded={openDates.has(date)} />
            </button>
            {openDates.has(date) && (
              <div className="mem-entries">
                {grouped[date].map(entry => (
                  <div key={entry.key} className="mem-entry">
                    <div className="mem-entry-text">
                      <span className="mem-key">{entry.key}</span>
                      <span className="mem-value">{entry.value}</span>
                    </div>
                    <div className="mem-entry-right">
                      {entry.time && <span className="mem-time">{new Date(entry.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                      <button className="mem-delete" onClick={() => deleteEntry(entry.key)} title="Delete">×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  if (dateStr === today) return 'Today'
  if (dateStr === yesterday) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

// ── Shared markdown ───────────────────────────────────────────────────────────
export function MdContent({ content }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{content}</ReactMarkdown>
}

function CodeBlock({ language, children }) {
  const [copied, setCopied] = useState(false)
  const code = String(children).replace(/\n$/, '')
  const copy = async () => { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1800) }
  return (
    <div className="code-block">
      <div className="code-header">
        <span className="code-lang">{language || 'code'}</span>
        <button className="copy-btn" onClick={copy}>{copied ? <><CheckIcon /> Copied</> : <><CopyIcon /> Copy</>}</button>
      </div>
      <pre><code>{code}</code></pre>
    </div>
  )
}

const mdComponents = {
  code({ node, inline, className, children, ...props }) {
    const lang = /language-(\w+)/.exec(className || '')?.[1]
    if (!inline) return <CodeBlock language={lang}>{children}</CodeBlock>
    return <code className="inline-code" {...props}>{children}</code>
  },
}

// ── Clock ─────────────────────────────────────────────────────────────────────
const TIMEZONES = [
  { label: 'Local',          tz: Intl.DateTimeFormat().resolvedOptions().timeZone },
  { label: 'New York',       tz: 'America/New_York' },
  { label: 'Chicago',        tz: 'America/Chicago' },
  { label: 'Denver',         tz: 'America/Denver' },
  { label: 'Los Angeles',    tz: 'America/Los_Angeles' },
  { label: 'London',         tz: 'Europe/London' },
  { label: 'Paris',          tz: 'Europe/Paris' },
  { label: 'Dubai',          tz: 'Asia/Dubai' },
  { label: 'India',          tz: 'Asia/Kolkata' },
  { label: 'Tokyo',          tz: 'Asia/Tokyo' },
  { label: 'Sydney',         tz: 'Australia/Sydney' },
]

function Clock() {
  const [now, setNow]       = useState(new Date())
  const [tzIndex, setTzIndex] = useState(0)
  const [open, setOpen]     = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const tz = TIMEZONES[tzIndex].tz

  const time = now.toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const date = now.toLocaleDateString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <div className="clock-wrap" ref={ref}>
      <button className="clock-btn" onClick={() => setOpen(o => !o)}>
        <span className="clock-time">{time}</span>
        <span className="clock-date">{date}</span>
        <span className="clock-tz">{TIMEZONES[tzIndex].label}</span>
      </button>
      {open && (
        <div className="tz-dropdown">
          <p className="tz-label">Time Zone</p>
          {TIMEZONES.map((t, i) => (
            <button
              key={t.tz}
              className={`tz-option ${i === tzIndex ? 'active' : ''}`}
              onClick={() => { setTzIndex(i); setOpen(false) }}
            >
              <span>{t.label}</span>
              <span className="tz-time">
                {now.toLocaleTimeString('en-US', { timeZone: t.tz, hour: '2-digit', minute: '2-digit' })}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Email preview card ────────────────────────────────────────────────────────
export function EmailPreviewCard({ tool }) {
  const [status, setStatus] = useState('pending') // pending | sent | cancelled

  const confirm = async () => {
    const res = await fetch(`/api/send_email/${tool.id}`, { method: 'POST' })
    setStatus(res.ok ? 'sent' : 'error')
  }
  const cancel = async () => {
    await fetch(`/api/send_email/${tool.id}`, { method: 'DELETE' })
    setStatus('cancelled')
  }

  const { to, subject, body } = tool.input

  return (
    <div className={`email-card ${status}`}>
      <div className="email-card-header">
        <span className="email-card-icon">✉️</span>
        <span className="email-card-title">Email Preview</span>
        {status === 'sent'      && <span className="email-badge sent">Sent</span>}
        {status === 'cancelled' && <span className="email-badge cancelled">Cancelled</span>}
      </div>
      <div className="email-card-fields">
        <div className="email-field"><span className="email-label">To</span><span className="email-value">{to}</span></div>
        <div className="email-field"><span className="email-label">Subject</span><span className="email-value">{subject}</span></div>
      </div>
      <div className="email-card-body">{body}</div>
      {status === 'pending' && (
        <div className="email-card-actions">
          <button className="email-btn send" onClick={confirm}>Send</button>
          <button className="email-btn cancel" onClick={cancel}>Cancel</button>
        </div>
      )}
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function SparklesIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423L16.5 15.75l.394 1.183a2.25 2.25 0 0 0 1.423 1.423L19.5 18.75l-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
    </svg>
  )
}
function SendIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3.478 2.405a.75.75 0 0 0-.926.94l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.405Z" /></svg>
}
function PlusIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
}
function ChevronIcon({ expanded }) {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}><polyline points="6 9 12 15 18 9" /></svg>
}
function CopyIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
}
function CheckIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
}
