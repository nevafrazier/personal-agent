import { MdContent } from './MdContent.jsx'
import EmailPreviewCard from './EmailPreviewCard.jsx'
import ToolCall from './ToolCall.jsx'

function SparklesIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423L16.5 15.75l.394 1.183a2.25 2.25 0 0 0 1.423 1.423L19.5 18.75l-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
    </svg>
  )
}

export default function Message({ message }) {
  const { role, content, toolCalls = [] } = message

  if (role === 'user') {
    return (
      <div className="msg-row user">
        <div className="user-bubble">{content}</div>
      </div>
    )
  }

  return (
    <div className="msg-row assistant">
      <div className="nova-avatar"><SparklesIcon /></div>
      <div className="msg-body">
        {toolCalls.map(tool =>
          tool.name === 'email_preview'
            ? <EmailPreviewCard key={tool.id} tool={tool} />
            : <ToolCall key={tool.id} tool={tool} />
        )}
        {content && (
          <div className="msg-content">
            <MdContent content={content} />
          </div>
        )}
      </div>
    </div>
  )
}
