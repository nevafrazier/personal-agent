import { useState, useRef, useEffect, useCallback } from 'react'
import Message from './components/Message.jsx'
import ToolCall from './components/ToolCall.jsx'
import Clock from './components/Clock.jsx'
import { MdContent } from './components/MdContent.jsx'
import EmailPreviewCard from './components/EmailPreviewCard.jsx'
import InfoTab from './components/InfoTab.jsx'
import MemoryTab from './components/MemoryTab.jsx'
import { SparklesIcon, SendIcon } from './components/Icons.jsx'

const AGENT_NAME  = "Neva's Agent"
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
  const messages      = activeSession?.messages ?? []
  const isStreaming   = streamingId === activeId

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamText, streamTools, activeId])

  const adjustHeight = () => {
    const ta = inputRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 180) + 'px'
  }

  // ── Session management ────────────────────────────────────────────────────────

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

  const switchSession = id => {
    if (streamingId !== null) return
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

  // ── Send message ──────────────────────────────────────────────────────────────

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
      abortRef.current  = controller

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
        signal: controller.signal,
      })

      if (!res.ok) throw new Error(`Server error: ${res.status}`)

      const reader  = res.body.getReader()
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
            const card = { id: event.id, name: 'email_preview', status: 'pending', input: { to: event.to, subject: event.subject, body: event.body }, result: null }
            finalTools.push(card)
            setStreamTools(prev => [...prev, card])
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
            <span className="model-badge"><span className="model-dot" />claude-sonnet-4-6 · anthropic</span>
          </div>
        </div>
        <div className="header-bottom">
          <nav className="tabs">
            <button className={`tab ${mainTab === 'chat'   ? 'active' : ''}`} onClick={() => setMainTab('chat')}>Chat</button>
            <button className={`tab ${mainTab === 'memory' ? 'active' : ''}`} onClick={() => setMainTab('memory')}>Memory</button>
            <button className={`tab ${mainTab === 'info'   ? 'active' : ''}`} onClick={() => setMainTab('info')}>How it Works</button>
          </nav>
        </div>
      </header>

      {mainTab === 'chat' ? (
        <>
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
