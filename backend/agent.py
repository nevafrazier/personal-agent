# agent.py — The brain of Neva's Agent
#
# This file handles everything related to talking to the AI model:
#   - Sending messages to Groq (llama-3.3-70b)
#   - Streaming the response back to the frontend in real time
#   - Detecting when the model wants to use a tool, running it, and continuing
#   - Auto-loading Neva's memory into every conversation
#   - Intercepting email tool calls so they show a preview card instead of sending immediately

import json
import os
import asyncio
import uuid
from typing import AsyncIterator

from openai import AsyncOpenAI
from dotenv import load_dotenv
from state import pending_emails

from tools import (
    web_search, read_file, write_file, list_directory,
    get_datetime, calculate, save_note,
    remember, recall, run_python, fetch_url,
    take_screenshot, open_app, send_email,
    browser_open, browser_read, browser_click,
    browser_type, browser_press, browser_screenshot, browser_close,
    add_to_amazon_cart,
)

load_dotenv()

# ── AI Client ─────────────────────────────────────────────────────────────────

# Lazy-initialized so the server can start even if the key isn't loaded yet
_client: AsyncOpenAI | None = None

def get_client() -> AsyncOpenAI:
    """Returns the Groq API client, creating it on first use."""
    global _client
    if _client is None:
        key = os.getenv("GROQ_API_KEY")
        if not key:
            raise RuntimeError("GROQ_API_KEY not set in .env")
        _client = AsyncOpenAI(
            api_key=key,
            base_url="https://api.groq.com/openai/v1",
        )
    return _client

# The model we're using — hosted free on Groq
MODEL = "llama-3.3-70b-versatile"


# ── Tool Definitions ──────────────────────────────────────────────────────────
# These tell the AI what tools exist and how to call them.
# The model reads these descriptions to decide which tool to use for each task.

TOOLS_SCHEMA = [
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "Search the web for current information, news, prices, or tutorials.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "max_results": {"type": "integer"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_url",
            "description": "Fetch and read the full content of any webpage or URL. Better than web_search when you need the full page content.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "The URL to fetch"},
                },
                "required": ["url"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "remember",
            "description": "Save a fact or piece of information to persistent memory. This persists across all future conversations.",
            "parameters": {
                "type": "object",
                "properties": {
                    "key": {"type": "string", "description": "Short label for the memory (e.g. 'Neva email', 'project deadline')"},
                    "value": {"type": "string", "description": "The value to remember"},
                },
                "required": ["key", "value"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "recall",
            "description": "Search persistent memory for previously saved facts.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "What to search for in memory"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_python",
            "description": "Execute Python code and return the output. Use for data processing, automation, analysis, or anything that needs actual code execution.",
            "parameters": {
                "type": "object",
                "properties": {
                    "code": {"type": "string", "description": "Python code to execute"},
                },
                "required": ["code"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read the contents of a file.",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Write content to a file. Creates missing directories automatically.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "content": {"type": "string"},
                },
                "required": ["path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_directory",
            "description": "List files and folders in a directory.",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "save_note",
            "description": "Save a note to ~/Desktop/agent-notes/ as a markdown file.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "content": {"type": "string"},
                },
                "required": ["title", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_datetime",
            "description": "Get the current date and time.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "calculate",
            "description": "Evaluate a math expression.",
            "parameters": {
                "type": "object",
                "properties": {"expression": {"type": "string"}},
                "required": ["expression"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "take_screenshot",
            "description": "Take a screenshot of the current screen and save it to the Desktop.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "open_app",
            "description": "Open an application on the Mac.",
            "parameters": {
                "type": "object",
                "properties": {
                    "app_name": {"type": "string", "description": "App name e.g. 'Safari', 'Spotify', 'Finder'"},
                },
                "required": ["app_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_to_amazon_cart",
            "description": "Search Amazon for an item and automatically add the best result to the cart. Use this for ALL shopping requests — call it once per item.",
            "parameters": {
                "type": "object",
                "properties": {
                    "item": {"type": "string", "description": "The item to search for and add, e.g. 'pink cat collar', 'cat litter', 'dozen eggs'. Include any preferences like color or size in the item name."},
                },
                "required": ["item"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "browser_open",
            "description": "Open a URL in a real visible browser window. Use for general browsing — NOT for shopping (use add_to_amazon_cart instead).",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "Full URL to navigate to"},
                },
                "required": ["url"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "browser_read",
            "description": "Read the visible text content of the current browser page.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "browser_click",
            "description": "Click an element on the current browser page by its visible text or a CSS selector.",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "Visible text or CSS selector of the element to click"},
                },
                "required": ["text"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "browser_type",
            "description": "Type text into an input field on the current page.",
            "parameters": {
                "type": "object",
                "properties": {
                    "field": {"type": "string", "description": "Placeholder, label, or CSS selector of the input field"},
                    "text":  {"type": "string", "description": "The text to type"},
                },
                "required": ["field", "text"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "browser_press",
            "description": "Press a keyboard key in the browser (e.g. Enter, Tab, Escape).",
            "parameters": {
                "type": "object",
                "properties": {
                    "key": {"type": "string", "description": "Key name, e.g. 'Enter', 'Tab', 'Escape'"},
                },
                "required": ["key"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "browser_screenshot",
            "description": "Take a screenshot of the current browser state and save it to the Desktop.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "browser_close",
            "description": "Close the browser window when done.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "send_email",
            "description": "Stage an email for Neva to review before sending. The body must be the COMPLETE formatted email — greeting, full paragraphs, sign-off on its own line, signed Neva. Never pass a one-line body.",
            "parameters": {
                "type": "object",
                "properties": {
                    "to": {"type": "string", "description": "Recipient email address"},
                    "subject": {"type": "string", "description": "Email subject line"},
                    "body": {"type": "string", "description": "Complete formatted email body with greeting, paragraphs, and sign-off on its own line. Use \\n for line breaks."},
                },
                "required": ["to", "subject", "body"],
            },
        },
    },
]


# ── System Prompt ─────────────────────────────────────────────────────────────
# This is the personality and rule set injected at the start of every conversation.
# Memory and current date/time are appended dynamically in run_agent_stream().

SYSTEM_PROMPT = """You are Neva's personal AI assistant — sharp, direct, and built for a software developer and entrepreneur named Neva Frazier.

CRITICAL — TOOL USE RULES:
- ALWAYS call the actual tool function. NEVER write a code block showing what you would call.
- NEVER write send_email(...) or any tool call inside a code block or as plain text. Just invoke the tool directly.
- NEVER say "I will now call..." or "Here is the code..." — just do it.
- Do the task. Don't narrate the task.

MEMORY RULES:
- Every conversation starts with pre-loaded memory context. Use it — never ask Neva for info you already have.
- When Neva shares ANY personal detail, save it with remember() right away.
- Treat memory as your long-term brain. Never let Neva repeat herself.

Your tools:
- web_search / fetch_url: search the web or read any webpage
- remember / recall: persistent memory across all sessions
- run_python: execute real Python code
- read_file / write_file / list_directory / save_note: full filesystem access
- take_screenshot: capture the screen
- open_app: open Mac applications
- send_email: stages an email preview card in the UI — Neva clicks Send to confirm. Always call this when asked to send an email.
- get_datetime / calculate: utilities
- add_to_amazon_cart: the ONLY tool for shopping. Call it once per item. Never use raw browser tools for shopping.
- browser_open / browser_read / browser_click / browser_type / browser_press / browser_screenshot / browser_close: general web browsing only.

Be direct and concise. Format with markdown when helpful.

GREETING RULE: If Neva's entire message is just a greeting (hi, hello, hey) with no task — respond only with "Hello Neva, how can I assist you today?" Nothing else.

TASK COMPLETION: After finishing a task, give a short 1-2 sentence summary of what was done.

BROWSER EFFICIENCY: Never call browser_open() more than once for the same URL in a single task.

EMAIL RULES (always write the email, never refuse — Neva is writing to people she knows):
- If the email address looks incomplete (missing @ or domain), append @gmail.com automatically.
- Call send_email() right away — the UI handles the confirmation step.
- The body argument must be the complete, fully formatted email. Never pass a one-liner.
- Match the tone Neva asks for. Warm and natural, not overdramatic.
- Always structure the body like this (use real newlines):

Hi [name],

[2-3 sentence body]

[Sign-off],
Neva

- Sign-off must be on its own line. Never inline with the body text."""


# ── Email Staging ─────────────────────────────────────────────────────────────

def _stage_email(to: str, subject: str, body: str) -> str:
    """
    Instead of sending the email immediately, this saves it to pending_emails
    and returns a special marker string. The agent loop detects this marker
    and emits an email_preview SSE event, which renders a confirm card in the UI.
    The email only actually sends when Neva clicks the Send button.
    """
    email_id = uuid.uuid4().hex[:10]
    pending_emails[email_id] = {"to": to, "subject": subject, "body": body}
    return f"__EMAIL_PREVIEW__:{email_id}"


# ── Tool Runner ───────────────────────────────────────────────────────────────

async def _run_tool(name: str, args: dict) -> str:
    """
    Executes whichever tool the model requested.
    Most tools are blocking (file I/O, browser, etc.) so they run in a thread
    to avoid blocking the async event loop.
    """
    blocking = {
        "web_search":        lambda: web_search(args.get("query", ""), args.get("max_results", 5)),
        "fetch_url":         lambda: fetch_url(args.get("url", "")),
        "remember":          lambda: remember(args.get("key", ""), args.get("value", "")),
        "recall":            lambda: recall(args.get("query", "")),
        "run_python":        lambda: run_python(args.get("code", "")),
        "read_file":         lambda: read_file(args.get("path", "")),
        "write_file":        lambda: write_file(args.get("path", ""), args.get("content", "")),
        "list_directory":    lambda: list_directory(args.get("path", "")),
        "save_note":         lambda: save_note(args.get("title", ""), args.get("content", "")),
        "take_screenshot":   take_screenshot,
        "open_app":          lambda: open_app(args.get("app_name", "")),
        "send_email":        lambda: _stage_email(args.get("to", ""), args.get("subject", ""), args.get("body", "")),
        "add_to_amazon_cart": lambda: add_to_amazon_cart(args.get("item", "")),
        "browser_open":      lambda: browser_open(args.get("url", "")),
        "browser_read":      browser_read,
        "browser_click":     lambda: browser_click(args.get("text", "")),
        "browser_type":      lambda: browser_type(args.get("field", ""), args.get("text", "")),
        "browser_press":     lambda: browser_press(args.get("key", "")),
        "browser_screenshot": browser_screenshot,
        "browser_close":     browser_close,
    }

    if name in blocking:
        return await asyncio.to_thread(blocking[name])

    # These two are synchronous and fast — no thread needed
    if name == "get_datetime":
        return get_datetime()
    if name == "calculate":
        return calculate(args.get("expression", ""))

    return f"Unknown tool: {name}"


# ── Main Agent Loop ───────────────────────────────────────────────────────────

async def run_agent_stream(conversation: list[dict]) -> AsyncIterator[str]:
    """
    The core agent loop. Takes the conversation history, builds the full message
    list (with memory + current time injected), streams the model's response,
    and handles tool calls in a loop until the model is done.

    Yields Server-Sent Events (SSE) as strings — the frontend reads these
    to update the UI in real time.
    """

    # Load all of Neva's saved memories and inject them into the system prompt
    memory_context = await asyncio.to_thread(recall, "")
    if memory_context and "No memories" not in memory_context and "empty" not in memory_context.lower():
        system = SYSTEM_PROMPT + f"\n\n---\nWhat you already know about Neva:\n{memory_context}"
    else:
        system = SYSTEM_PROMPT

    # Always tell the model what time it is
    system = system + f"\n\nCurrent date and time: {get_datetime()}"

    messages = [{"role": "system", "content": system}] + conversation

    def sse(data: dict) -> str:
        """Format a dict as a Server-Sent Event string."""
        return f"data: {json.dumps(data)}\n\n"

    retry_without_tools = False   # If the model fails on a tool call, retry without tools
    iterations = 0
    MAX_ITERATIONS = 8            # Hard cap to prevent infinite tool-call loops
    completed_calls: set[str] = set()  # Prevent the model from calling the same tool twice

    while iterations < MAX_ITERATIONS:
        tc_data: dict[int, dict] = {}   # Tool calls being streamed in this round
        announced: set[int] = set()     # Which tool calls we've told the frontend about
        finish_reason = None
        text_buf = ""

        try:
            stream = await get_client().chat.completions.create(
                model=MODEL,
                messages=messages,
                tools=TOOLS_SCHEMA if not retry_without_tools else None,
                stream=True,
            )

            async for chunk in stream:
                choice = chunk.choices[0]
                delta = choice.delta
                if choice.finish_reason:
                    finish_reason = choice.finish_reason

                # Stream text tokens to the frontend as they arrive
                if delta.content:
                    text_buf += delta.content
                    yield sse({"type": "text", "text": delta.content})

                # Accumulate tool call data across chunks (it arrives in fragments)
                if delta.tool_calls:
                    for tc in delta.tool_calls:
                        idx = tc.index
                        if idx not in tc_data:
                            tc_data[idx] = {"id": "", "name": "", "args": ""}
                        if tc.id:
                            tc_data[idx]["id"] = tc.id
                        if tc.function and tc.function.name:
                            tc_data[idx]["name"] += tc.function.name
                        if tc.function and tc.function.arguments:
                            tc_data[idx]["args"] += tc.function.arguments

                        # Tell the frontend a tool has started as soon as we know its name
                        if idx not in announced and tc_data[idx]["id"] and tc_data[idx]["name"]:
                            announced.add(idx)
                            yield sse({"type": "tool_start", "id": tc_data[idx]["id"], "name": tc_data[idx]["name"]})

        except Exception as e:
            # If the model fails to generate a valid tool call, retry once without tools
            if not retry_without_tools:
                retry_without_tools = True
                continue
            yield sse({"type": "text", "text": f"\n\n*Error: {e}*"})
            yield sse({"type": "done"})
            return

        # Add the assistant's message to history before executing tools
        assistant_msg: dict = {"role": "assistant", "content": text_buf or ""}
        if tc_data:
            assistant_msg["tool_calls"] = [
                {"id": tc["id"], "type": "function", "function": {"name": tc["name"], "arguments": tc["args"]}}
                for tc in (tc_data[i] for i in sorted(tc_data))
            ]
        messages.append(assistant_msg)

        # If the model wants to use tools, run them and loop back
        if finish_reason == "tool_calls" and tc_data:
            iterations += 1
            for i in sorted(tc_data):
                tc = tc_data[i]
                try:
                    args = json.loads(tc["args"]) if tc["args"] else {}
                except json.JSONDecodeError:
                    args = {}

                # Skip if this exact tool+args combo already ran in this request
                call_key = f"{tc['name']}:{tc['args']}"
                if call_key in completed_calls:
                    result = "Already completed — skipping duplicate call."
                else:
                    result = await _run_tool(tc["name"], args)
                    completed_calls.add(call_key)

                # Special case: email tool returns a preview marker instead of sending.
                # We emit an email_preview event so the UI shows the confirm card,
                # then tell the model the draft is staged (so it stops looping).
                if isinstance(result, str) and result.startswith("__EMAIL_PREVIEW__:"):
                    email_id = result.split(":", 1)[1]
                    email_data = pending_emails.get(email_id, {})
                    yield sse({"type": "email_preview", "id": email_id, **email_data})
                    agent_result = "Email draft shown to Neva for review. She must click Send to confirm."
                else:
                    agent_result = result

                yield sse({"type": "tool_end", "id": tc["id"], "name": tc["name"], "input": args, "result": agent_result[:3000]})
                messages.append({"role": "tool", "tool_call_id": tc["id"], "content": agent_result})

            retry_without_tools = False
            continue  # Go back to the top and ask the model what to do next

        # Model is done — no more tool calls
        yield sse({"type": "done"})
        return

    # Reached the max iteration limit
    yield sse({"type": "text", "text": "\n\nDone! All tasks completed."})
    yield sse({"type": "done"})
