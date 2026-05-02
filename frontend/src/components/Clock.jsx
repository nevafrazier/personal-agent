import { useState, useEffect, useRef } from 'react'

const TIMEZONES = [
  { label: 'Local',       tz: Intl.DateTimeFormat().resolvedOptions().timeZone },
  { label: 'New York',    tz: 'America/New_York' },
  { label: 'Chicago',     tz: 'America/Chicago' },
  { label: 'Denver',      tz: 'America/Denver' },
  { label: 'Los Angeles', tz: 'America/Los_Angeles' },
  { label: 'London',      tz: 'Europe/London' },
  { label: 'Paris',       tz: 'Europe/Paris' },
  { label: 'Dubai',       tz: 'Asia/Dubai' },
  { label: 'India',       tz: 'Asia/Kolkata' },
  { label: 'Tokyo',       tz: 'Asia/Tokyo' },
  { label: 'Sydney',      tz: 'Australia/Sydney' },
]

export default function Clock() {
  const [now, setNow]         = useState(new Date())
  const [tzIndex, setTzIndex] = useState(0)
  const [open, setOpen]       = useState(false)
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

  const tz   = TIMEZONES[tzIndex].tz
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
