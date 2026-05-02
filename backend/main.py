# main.py — FastAPI server
# Handles all HTTP routes: chat streaming, memory management, and email confirmation.

import asyncio
import json
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv

from agent import run_agent_stream
from state import pending_emails
from tools import send_email as _send_email

load_dotenv()

# Where Neva's persistent memory lives on disk
MEMORY_FILE = Path.home() / ".nevas_agent_memory.json"

app = FastAPI(title="Neva's Agent")

# Allow the React frontend (localhost:5173) to talk to this backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://personalagent.local:5173"],
    allow_methods=["POST", "GET", "DELETE"],
    allow_headers=["*"],
)


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[Message]


# ── Chat ──────────────────────────────────────────────────────────────────────

@app.post("/api/chat")
async def chat(req: ChatRequest):
    """
    Main chat endpoint. Streams the agent's response back to the frontend
    as Server-Sent Events (SSE) so text and tool results appear in real time.
    """
    messages = [{"role": m.role, "content": m.content} for m in req.messages]
    return StreamingResponse(
        run_agent_stream(messages),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ── Memory ────────────────────────────────────────────────────────────────────

@app.get("/api/memory")
def get_memory():
    """Return all saved memories so the Memory tab can display them."""
    if not MEMORY_FILE.exists():
        return {}
    return json.loads(MEMORY_FILE.read_text())


@app.delete("/api/memory/{key}")
def delete_memory(key: str):
    """Delete a single memory entry by key (triggered by the trash button in the UI)."""
    if not MEMORY_FILE.exists():
        return {"ok": True}
    memory = json.loads(MEMORY_FILE.read_text())
    if key not in memory:
        raise HTTPException(status_code=404, detail="Key not found")
    del memory[key]
    MEMORY_FILE.write_text(json.dumps(memory, indent=2))
    return {"ok": True}


# ── Email confirmation ────────────────────────────────────────────────────────

@app.post("/api/send_email/{email_id}")
async def confirm_send_email(email_id: str):
    """
    Called when Neva clicks the Send button on an email preview card.
    Looks up the staged email by ID and actually sends it via Gmail.
    """
    email = pending_emails.pop(email_id, None)
    if not email:
        raise HTTPException(status_code=404, detail="Email not found or already sent")
    result = await asyncio.to_thread(
        lambda: _send_email(email["to"], email["subject"], email["body"])
    )
    return {"status": "sent", "result": result}


@app.delete("/api/send_email/{email_id}")
def cancel_email(email_id: str):
    """Called when Neva clicks Cancel on an email preview card. Discards the draft."""
    pending_emails.pop(email_id, None)
    return {"status": "cancelled"}


# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}
