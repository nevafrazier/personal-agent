# Neva's Agent

A personal AI assistant with a React frontend and Python backend. It can search the web, remember things across sessions, run code, control a browser, shop on Amazon, send emails, open Mac apps, and more.

---

## Requirements

Make sure you have these installed before starting:

- **Python 3.10+** — [python.org/downloads](https://www.python.org/downloads/)
- **Node.js 18+** — [nodejs.org](https://nodejs.org/)
- **npm** — comes with Node.js

---

## Setup

### 1. Clone or download the project

```bash
git clone https://github.com/your-username/personal-agent.git
cd personal-agent
```

---

### 2. Set up the backend

```bash
cd backend
pip3 install -r requirements.txt
python3 -m playwright install chromium
```

---

### 3. Set up the frontend

```bash
cd ../frontend
npm install
```

---

### 4. Create your `.env` file

Inside the `backend/` folder, create a file called `.env` and add the following:

```
GROQ_API_KEY=your_groq_api_key
GMAIL_ADDRESS=your_email@gmail.com
GMAIL_APP_PASSWORD=your_app_password
```

**Getting each value:**

#### `GROQ_API_KEY` (required)
1. Go to [console.groq.com](https://console.groq.com)
2. Sign up for a free account
3. Go to **API Keys** and click **Create API Key**
4. Copy and paste it into your `.env`

#### `GMAIL_ADDRESS` + `GMAIL_APP_PASSWORD` (optional — only needed for email sending)
1. Make sure **2-Step Verification** is enabled on your Google account at [myaccount.google.com/security](https://myaccount.google.com/security)
2. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
3. Type any name (e.g. "My Agent") and click **Create**
4. Copy the 16-character password shown — this is your `GMAIL_APP_PASSWORD`
5. Use your normal Gmail address for `GMAIL_ADDRESS`

> If you skip the Gmail setup, everything still works — the agent just won't be able to send emails.

---

### 5. Run the agent

From the root `personal-agent/` folder:

```bash
bash start.sh
```

Then open **http://localhost:5173** in your browser.

To stop it, press `Ctrl+C` in the terminal.

---

## Features

| Feature | How to use it |
|---|---|
| Web search | "Search for..." or "What is..." |
| Remember things | "Remember that my email is..." |
| Run Python code | "Write a script that..." |
| Read/write files | "Read the file at..." / "Create a file..." |
| Add to Amazon cart | "Add [item] to my Amazon cart" |
| Shopping from a recipe | "Give me a recipe for X, then add everything to my cart" |
| Send an email | "Email [person] and tell them..." |
| Open a Mac app | "Open Spotify" |
| Take a screenshot | "Take a screenshot" |

---

## Amazon Shopping Setup

The first time you ask the agent to add something to your Amazon cart, a Chrome browser window will open. Log into your Amazon account in that window. Your session is saved automatically — you only have to log in once.

---

## Notes

- Memory is stored in `~/.nevas_agent_memory.json` on your computer
- Amazon browser sessions are saved in `~/.nevas_agent_browser/`
- Agent notes are saved to `~/Desktop/agent-notes/`
