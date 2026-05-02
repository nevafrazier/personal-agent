import { useState } from 'react'

export default function EmailPreviewCard({ tool }) {
  const [status, setStatus] = useState('pending')

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
