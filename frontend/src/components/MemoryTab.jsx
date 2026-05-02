import { useState, useEffect } from 'react'
import { ChevronIcon } from './Icons.jsx'

function formatDate(dateStr) {
  const d         = new Date(dateStr + 'T00:00:00')
  const today     = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  if (dateStr === today)     return 'Today'
  if (dateStr === yesterday) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

export default function MemoryTab() {
  const [memory, setMemory]       = useState(null)
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
