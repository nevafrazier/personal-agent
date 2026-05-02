import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CopyIcon, CheckIcon } from './Icons.jsx'

function CodeBlock({ language, children }) {
  const [copied, setCopied] = useState(false)
  const code = String(children).replace(/\n$/, '')
  const copy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }
  return (
    <div className="code-block">
      <div className="code-header">
        <span className="code-lang">{language || 'code'}</span>
        <button className="copy-btn" onClick={copy}>
          {copied ? <><CheckIcon /> Copied</> : <><CopyIcon /> Copy</>}
        </button>
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

export function MdContent({ content }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{content}</ReactMarkdown>
}
