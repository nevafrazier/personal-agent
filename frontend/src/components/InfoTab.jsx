import { useState } from 'react'

const INFO_SECTIONS = [
  {
    title: 'Web & Research', icon: '🌐',
    items: [
      { name: 'Web Search', desc: 'Search the web for current news, prices, tutorials, or anything up-to-date using DuckDuckGo.' },
      { name: 'Fetch URL',  desc: 'Read the full content of any webpage — docs, articles, GitHub pages, product pages, etc.' },
    ],
    how: 'web_search() calls the DuckDuckGo API — no key required. fetch_url() downloads the page using requests, strips scripts, ads, and nav with BeautifulSoup, then returns up to 12,000 characters of clean readable text.',
    example: 'You: "What\'s the latest on GPT-5?"\nAgent calls web_search("GPT-5 release") → reads top 5 results → summarizes for you.',
  },
  {
    title: 'Memory', icon: '🧠',
    items: [
      { name: 'Remember', desc: 'Save any fact or detail to persistent memory. Stays across all future conversations — you never have to repeat yourself.' },
      { name: 'Recall',   desc: 'Search everything that\'s been saved. Every conversation starts with your full memory preloaded automatically.' },
    ],
    how: 'Facts are saved as key-value pairs in ~/.nevas_agent_memory.json on your Mac. On every new conversation, the entire memory file is loaded and injected into the system prompt before your first message — so the agent already knows everything.',
    example: 'You: "Remember my gym days are Mon/Wed/Fri"\nAgent calls remember("gym schedule", "Mon/Wed/Fri") → stored to disk → recalled automatically next session.',
  },
  {
    title: 'Code & Compute', icon: '⚙️',
    items: [
      { name: 'Run Python', desc: 'Execute real Python code and return the output. Use for data processing, automation, math, API calls, scripts — anything.' },
      { name: 'Calculate',  desc: 'Evaluate math expressions instantly (supports trig, logarithms, pi, sqrt, etc.).' },
    ],
    how: 'run_python() writes your code to a temp .py file, executes it with python3 via subprocess, captures stdout + stderr, then deletes the temp file. 30-second timeout. calculate() uses Python\'s eval() with a safe math-only sandbox.',
    example: 'You: "How many days until my deadline on June 30?"\nAgent calls run_python() with a datetime script → prints the exact day count.',
  },
  {
    title: 'Files & Notes', icon: '📁',
    items: [
      { name: 'Read File',       desc: 'Read the contents of any file on your Mac.' },
      { name: 'Write File',      desc: 'Create or overwrite files anywhere on your system. Missing folders are created automatically.' },
      { name: 'List Directory',  desc: 'Browse the contents of any folder — shows file names, sizes, and subdirectories.' },
      { name: 'Save Note',       desc: 'Save a titled markdown note to ~/Desktop/agent-notes/ for easy access.' },
    ],
    how: 'All file operations use Python\'s pathlib. read_file() reads up to 15,000 characters. write_file() calls Path.mkdir(parents=True) so missing folders are never a problem. Notes are saved as timestamped .md files in ~/Desktop/agent-notes/.',
    example: 'You: "Save a note with my project ideas"\nAgent calls save_note("Project Ideas", "1. SaaS tool\\n2. Template pack") → markdown file created on your Desktop.',
  },
  {
    title: 'Mac Control', icon: '🖥️',
    items: [
      { name: 'Open App',        desc: 'Launch any Mac application by name — Safari, Spotify, Finder, VS Code, etc.' },
      { name: 'Take Screenshot', desc: 'Capture a screenshot of your current screen and save it to the Desktop.' },
    ],
    how: 'open_app() runs the macOS shell command open -a AppName via subprocess. take_screenshot() calls the built-in screencapture -x command (silent, no shutter sound) and saves a timestamped PNG directly to ~/Desktop.',
    example: 'You: "Open Spotify and take a screenshot"\nAgent calls open_app("Spotify"), waits, then calls take_screenshot() → screenshot_20260518_143201.png saved to Desktop.',
  },
  {
    title: 'Communication', icon: '✉️',
    items: [
      { name: 'Send Email', desc: 'Send emails via Gmail. Requires GMAIL_ADDRESS and GMAIL_APP_PASSWORD in your .env file.' },
    ],
    how: 'send_email() connects to Gmail\'s SMTP server over SSL on port 465 using Python\'s smtplib. It reads your GMAIL_ADDRESS and GMAIL_APP_PASSWORD from the .env file — your password is never hardcoded. Sends as plain text.',
    example: 'You: "Email my client that the project is done"\nAgent calls send_email("client@co.com", "Project Complete", "Hi — everything is finished and ready for review.")',
  },
  {
    title: 'Utilities', icon: '🕒',
    items: [
      { name: 'Date & Time', desc: 'Always knows the current date and time. Automatically injected into every conversation.' },
    ],
    how: 'get_datetime() calls Python\'s datetime.now() and formats it as a human-readable string. It runs automatically at the start of every request and is appended to the system prompt — so the agent never has to guess or ask what time it is.',
    example: 'Every message the agent receives includes:\n"Current date and time: Monday, May 18, 2026 — 03:45 PM"',
  },
  {
    title: 'Browser & Shopping', icon: '🛒',
    items: [
      { name: 'Add to Amazon Cart', desc: 'Tell the agent any item and it searches Amazon, finds the best result, and adds it to your cart automatically.' },
      { name: 'Multi-item shopping', desc: 'Ask for a recipe or list — the agent adds every ingredient to your cart one by one.' },
      { name: 'Browser Control',    desc: 'For general browsing: open any site, click buttons, fill forms, read pages, take screenshots.' },
    ],
    how: 'add_to_amazon_cart() uses Playwright to control a real Chromium browser. It opens Amazon, types the item in the search box, clicks the first result, then clicks "Add to Cart" — all in one tool call. Your login session is saved in ~/.nevas_agent_browser so you only log in once ever.',
    example: 'You: "Add a pink cat collar and cat litter to my cart"\nAgent calls add_to_amazon_cart("pink cat collar") then add_to_amazon_cart("cat litter") — both added automatically.',
  },
]

export default function InfoTab() {
  const [flipped, setFlipped] = useState(new Set())

  const toggle = title => {
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
