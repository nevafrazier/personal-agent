import json
import os
import asyncio
import uuid
from typing import AsyncIterator

import anthropic
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

_client: anthropic.AsyncAnthropic | None = None

def get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        key = os.getenv("ANTHROPIC_API_KEY")
        if not key:
            raise RuntimeError("ANTHROPIC_API_KEY not set in .env")
        _client = anthropic.AsyncAnthropic(api_key=key)
    return _client

MODEL = "claude-sonnet-4-6"


TOOLS_SCHEMA = [
    {
        "name": "web_search",
        "description": "Search the web for current information, news, prices, or tutorials.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "max_results": {"type": "integer"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "fetch_url",
        "description": "Fetch and read the full content of any webpage or URL.",
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string"},
            },
            "required": ["url"],
        },
    },
    {
        "name": "remember",
        "description": "Save a fact or piece of information to persistent memory across all future conversations.",
        "input_schema": {
            "type": "object",
            "properties": {
                "key": {"type": "string"},
                "value": {"type": "string"},
            },
            "required": ["key", "value"],
        },
    },
    {
        "name": "recall",
        "description": "Search persistent memory for previously saved facts.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "run_python",
        "description": "Execute Python code and return the output.",
        "input_schema": {
            "type": "object",
            "properties": {
                "code": {"type": "string"},
            },
            "required": ["code"],
        },
    },
    {
        "name": "read_file",
        "description": "Read the contents of a file.",
        "input_schema": {
            "type": "object",
            "properties": {"path": {"type": "string"}},
            "required": ["path"],
        },
    },
    {
        "name": "write_file",
        "description": "Write content to a file. Creates missing directories automatically.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string"},
                "content": {"type": "string"},
            },
            "required": ["path", "content"],
        },
    },
    {
        "name": "list_directory",
        "description": "List files and folders in a directory.",
        "input_schema": {
            "type": "object",
            "properties": {"path": {"type": "string"}},
            "required": ["path"],
        },
    },
    {
        "name": "save_note",
        "description": "Save a note to ~/Desktop/agent-notes/ as a markdown file.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "content": {"type": "string"},
            },
            "required": ["title", "content"],
        },
    },
    {
        "name": "get_datetime",
        "description": "Get the current date and time.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "calculate",
        "description": "Evaluate a math expression.",
        "input_schema": {
            "type": "object",
            "properties": {"expression": {"type": "string"}},
            "required": ["expression"],
        },
    },
    {
        "name": "take_screenshot",
        "description": "Take a screenshot of the current screen and save it to the Desktop.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "open_app",
        "description": "Open an application on the Mac.",
        "input_schema": {
            "type": "object",
            "properties": {
                "app_name": {"type": "string"},
            },
            "required": ["app_name"],
        },
    },
    {
        "name": "add_to_amazon_cart",
        "description": "Search Amazon for an item and automatically add the best result to the cart. Use this for ALL shopping requests.",
        "input_schema": {
            "type": "object",
            "properties": {
                "item": {"type": "string"},
            },
            "required": ["item"],
        },
    },
    {
        "name": "browser_open",
        "description": "Open a URL in a real visible browser window. Use for general browsing, NOT for shopping.",
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string"},
            },
            "required": ["url"],
        },
    },
    {
        "name": "browser_read",
        "description": "Read the visible text content of the current browser page.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "browser_click",
        "description": "Click an element on the current browser page by its visible text or a CSS selector.",
        "input_schema": {
            "type": "object",
            "properties": {
                "text": {"type": "string"},
            },
            "required": ["text"],
        },
    },
    {
        "name": "browser_type",
        "description": "Type text into an input field on the current page.",
        "input_schema": {
            "type": "object",
            "properties": {
                "field": {"type": "string"},
                "text": {"type": "string"},
            },
            "required": ["field", "text"],
        },
    },
    {
        "name": "browser_press",
        "description": "Press a keyboard key in the browser (e.g. Enter, Tab, Escape).",
        "input_schema": {
            "type": "object",
            "properties": {
                "key": {"type": "string"},
            },
            "required": ["key"],
        },
    },
    {
        "name": "browser_screenshot",
        "description": "Take a screenshot of the current browser state and save it to the Desktop.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "browser_close",
        "description": "Close the browser window when done.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "send_email",
        "description": "Stage an email for Neva to review before sending. The body must be the COMPLETE formatted email.",
        "input_schema": {
            "type": "object",
            "properties": {
                "to": {"type": "string"},
                "subject": {"type": "string"},
                "body": {"type": "string"},
            },
            "required": ["to", "subject", "body"],
        },
    },
]


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
- send_email: stages an email preview card in the UI — Neva clicks Send to confirm.
- get_datetime / calculate: utilities
- add_to_amazon_cart: the ONLY tool for shopping. Call it once per item.
- browser_open / browser_read / browser_click / browser_type / browser_press / browser_screenshot / browser_close: general web browsing only.

Be direct and concise. Format with markdown when helpful.

GREETING RULE: If Neva's entire message is just a greeting (hi, hello, hey) with no task — respond only with "Hello Neva, how can I assist you today?" Nothing else.

TASK COMPLETION: After finishing a task, give a short 1-2 sentence summary of what was done.

BROWSER EFFICIENCY: Never call browser_open() more than once for the same URL in a single task.

EMAIL RULES:
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


def _stage_email(to: str, subject: str, body: str) -> str:
    email_id = uuid.uuid4().hex[:10]
    pending_emails[email_id] = {"to": to, "subject": subject, "body": body}
    return f"__EMAIL_PREVIEW__:{email_id}"


async def _run_tool(name: str, args: dict) -> str:
    blocking = {
        "web_search":         lambda: web_search(args.get("query", ""), args.get("max_results", 5)),
        "fetch_url":          lambda: fetch_url(args.get("url", "")),
        "remember":           lambda: remember(args.get("key", ""), args.get("value", "")),
        "recall":             lambda: recall(args.get("query", "")),
        "run_python":         lambda: run_python(args.get("code", "")),
        "read_file":          lambda: read_file(args.get("path", "")),
        "write_file":         lambda: write_file(args.get("path", ""), args.get("content", "")),
        "list_directory":     lambda: list_directory(args.get("path", "")),
        "save_note":          lambda: save_note(args.get("title", ""), args.get("content", "")),
        "take_screenshot":    take_screenshot,
        "open_app":           lambda: open_app(args.get("app_name", "")),
        "send_email":         lambda: _stage_email(args.get("to", ""), args.get("subject", ""), args.get("body", "")),
        "add_to_amazon_cart": lambda: add_to_amazon_cart(args.get("item", "")),
        "browser_open":       lambda: browser_open(args.get("url", "")),
        "browser_read":       browser_read,
        "browser_click":      lambda: browser_click(args.get("text", "")),
        "browser_type":       lambda: browser_type(args.get("field", ""), args.get("text", "")),
        "browser_press":      lambda: browser_press(args.get("key", "")),
        "browser_screenshot": browser_screenshot,
        "browser_close":      browser_close,
    }

    if name in blocking:
        return await asyncio.to_thread(blocking[name])

    if name == "get_datetime":
        return get_datetime()
    if name == "calculate":
        return calculate(args.get("expression", ""))

    return f"Unknown tool: {name}"


async def run_agent_stream(conversation: list[dict]) -> AsyncIterator[str]:
    memory_context = await asyncio.to_thread(recall, "")
    if memory_context and "No memories" not in memory_context and "empty" not in memory_context.lower():
        system = SYSTEM_PROMPT + f"\n\n---\nWhat you already know about Neva:\n{memory_context}"
    else:
        system = SYSTEM_PROMPT

    system = system + f"\n\nCurrent date and time: {get_datetime()}"

    messages = [m for m in conversation if m.get("role") != "system"]

    def sse(data: dict) -> str:
        return f"data: {json.dumps(data)}\n\n"

    iterations = 0
    MAX_ITERATIONS = 8

    while iterations < MAX_ITERATIONS:
        tool_uses: list[dict] = []
        text_buf = ""
        stop_reason = None

        try:
            async with get_client().messages.stream(
                model=MODEL,
                max_tokens=4096,
                system=system,
                messages=messages,
                tools=TOOLS_SCHEMA,
            ) as stream:
                async for event in stream:
                    if event.type == "content_block_start":
                        if event.content_block.type == "tool_use":
                            tool_uses.append({
                                "id": event.content_block.id,
                                "name": event.content_block.name,
                                "input": "",
                            })
                            yield sse({"type": "tool_start", "id": event.content_block.id, "name": event.content_block.name})

                    elif event.type == "content_block_delta":
                        if event.delta.type == "text_delta":
                            text_buf += event.delta.text
                            yield sse({"type": "text", "text": event.delta.text})
                        elif event.delta.type == "input_json_delta":
                            if tool_uses:
                                tool_uses[-1]["input"] += event.delta.partial_json

                    elif event.type == "message_delta":
                        stop_reason = event.delta.stop_reason

        except Exception as e:
            err_str = str(e).lower()
            if "rate_limit" in err_str or "429" in err_str or "overloaded" in err_str:
                yield sse({"type": "text", "text": "Rate limit hit — wait a moment and try again."})
            else:
                yield sse({"type": "text", "text": f"Error: {e}"})
            yield sse({"type": "done"})
            return

        assistant_content = []
        if text_buf:
            assistant_content.append({"type": "text", "text": text_buf})
        for tu in tool_uses:
            try:
                input_data = json.loads(tu["input"]) if tu["input"] else {}
            except json.JSONDecodeError:
                input_data = {}
            tu["parsed_input"] = input_data
            assistant_content.append({
                "type": "tool_use",
                "id": tu["id"],
                "name": tu["name"],
                "input": input_data,
            })
        messages.append({"role": "assistant", "content": assistant_content})

        if stop_reason == "tool_use" and tool_uses:
            iterations += 1
            tool_results = []

            for tu in tool_uses:
                args = tu.get("parsed_input", {})
                result = await _run_tool(tu["name"], args)

                if isinstance(result, str) and result.startswith("__EMAIL_PREVIEW__:"):
                    email_id = result.split(":", 1)[1]
                    email_data = pending_emails.get(email_id, {})
                    yield sse({"type": "email_preview", "id": email_id, **email_data})
                    agent_result = "Email draft shown to Neva for review. She must click Send to confirm."
                else:
                    agent_result = result

                yield sse({"type": "tool_end", "id": tu["id"], "name": tu["name"], "input": args, "result": agent_result[:3000]})
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tu["id"],
                    "content": agent_result,
                })

            messages.append({"role": "user", "content": tool_results})
            continue

        yield sse({"type": "done"})
        return

    yield sse({"type": "text", "text": "\n\nDone! All tasks completed."})
    yield sse({"type": "done"})
