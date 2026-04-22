import json
import math
import os
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path

NOTES_DIR   = Path.home() / "Desktop" / "agent-notes"
MEMORY_FILE = Path.home() / ".nevas_agent_memory.json"


# ── Existing tools ────────────────────────────────────────────────────────────

def web_search(query: str, max_results: int = 5) -> str:
    try:
        from duckduckgo_search import DDGS
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=max_results))
        if not results:
            return "No results found."
        parts = [f"**{r['title']}**\nURL: {r['href']}\n{r['body']}" for r in results]
        return "\n\n---\n\n".join(parts)
    except Exception as e:
        return f"Search failed: {e}"


def read_file(path: str) -> str:
    try:
        p = Path(path).expanduser().resolve()
        if not p.exists():
            return f"File not found: {path}"
        if p.is_dir():
            return "That's a directory — use list_directory to see its contents."
        content = p.read_text(encoding="utf-8", errors="replace")
        if len(content) > 15000:
            content = content[:15000] + "\n\n[... truncated]"
        return content
    except Exception as e:
        return f"Error reading file: {e}"


def write_file(path: str, content: str) -> str:
    try:
        p = Path(path).expanduser().resolve()
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
        return f"Written: {p} ({len(content):,} chars)"
    except Exception as e:
        return f"Error writing file: {e}"


def list_directory(path: str) -> str:
    try:
        p = Path(path).expanduser().resolve()
        if not p.exists():
            return f"Directory not found: {path}"
        if not p.is_dir():
            return "That's a file — use read_file to read it."
        items = sorted(p.iterdir())
        if not items:
            return "Empty directory."
        lines = []
        for item in items:
            if item.is_dir():
                lines.append(f"[dir]  {item.name}/")
            else:
                lines.append(f"[file] {item.name}  ({item.stat().st_size:,} bytes)")
        return "\n".join(lines)
    except Exception as e:
        return f"Error listing directory: {e}"


def get_datetime() -> str:
    return datetime.now().strftime("%A, %B %d, %Y — %I:%M %p")


def calculate(expression: str) -> str:
    try:
        safe_globals = {
            "__builtins__": {},
            "abs": abs, "round": round, "min": min, "max": max,
            "sum": sum, "pow": pow, "int": int, "float": float,
            "sqrt": math.sqrt, "pi": math.pi, "e": math.e,
            "sin": math.sin, "cos": math.cos, "tan": math.tan,
            "log": math.log, "log10": math.log10,
            "ceil": math.ceil, "floor": math.floor,
        }
        result = eval(expression, safe_globals, {})  # noqa: S307
        return str(result)
    except Exception as e:
        return f"Calculation error: {e}"


def save_note(title: str, content: str) -> str:
    try:
        NOTES_DIR.mkdir(parents=True, exist_ok=True)
        safe = "".join(c if c.isalnum() or c in " -_" else "_" for c in title)[:60]
        path = NOTES_DIR / (safe.strip().replace(" ", "_") + ".md")
        ts = datetime.now().strftime("%Y-%m-%d %H:%M")
        path.write_text(f"# {title}\n_Saved: {ts}_\n\n{content}", encoding="utf-8")
        return f"Note saved to {path}"
    except Exception as e:
        return f"Error saving note: {e}"


# ── NEW: Persistent memory ────────────────────────────────────────────────────

def remember(key: str, value: str) -> str:
    """Save a fact to persistent memory across sessions."""
    try:
        memory = {}
        if MEMORY_FILE.exists():
            memory = json.loads(MEMORY_FILE.read_text())
        memory[key] = {"value": value, "saved": datetime.now().isoformat()}
        MEMORY_FILE.write_text(json.dumps(memory, indent=2))
        return f"Remembered: {key} → {value}"
    except Exception as e:
        return f"Error saving memory: {e}"


def recall(query: str) -> str:
    """Search persistent memory for stored facts. Empty query returns everything."""
    try:
        if not MEMORY_FILE.exists():
            return "No memories saved yet."
        memory = json.loads(MEMORY_FILE.read_text())
        if not memory:
            return "Memory is empty."
        if query.strip():
            q = query.lower()
            matches = {k: v for k, v in memory.items()
                       if q in k.lower() or q in v["value"].lower()}
            if not matches:
                matches = memory
        else:
            matches = memory
        lines = [f"{k}: {v['value']}" for k, v in matches.items()]
        return "\n".join(lines)
    except Exception as e:
        return f"Error reading memory: {e}"


# ── NEW: Run Python code ──────────────────────────────────────────────────────

def run_python(code: str) -> str:
    """Execute Python code and return the output."""
    try:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False) as f:
            f.write(code)
            tmp = f.name
        result = subprocess.run(
            ["python3", tmp],
            capture_output=True, text=True, timeout=30
        )
        output = result.stdout + result.stderr
        os.unlink(tmp)
        return output.strip()[:5000] or "(no output)"
    except subprocess.TimeoutExpired:
        return "Code timed out after 30 seconds."
    except Exception as e:
        return f"Error running code: {e}"


# ── NEW: Fetch URL ────────────────────────────────────────────────────────────

def fetch_url(url: str) -> str:
    """Fetch and read the full content of any webpage."""
    try:
        import requests
        from bs4 import BeautifulSoup
        r = requests.get(url, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
            tag.decompose()
        lines = [l.strip() for l in soup.get_text(separator="\n").splitlines() if l.strip()]
        text = "\n".join(lines)
        if len(text) > 12000:
            text = text[:12000] + "\n\n[... truncated]"
        return text
    except Exception as e:
        return f"Error fetching URL: {e}"


# ── NEW: Screenshot ───────────────────────────────────────────────────────────

def take_screenshot() -> str:
    """Take a screenshot and save it to the Desktop."""
    try:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        path = str(Path.home() / "Desktop" / f"screenshot_{ts}.png")
        subprocess.run(["screencapture", "-x", path], check=True)
        return f"Screenshot saved to {path}"
    except Exception as e:
        return f"Error taking screenshot: {e}"


# ── NEW: Open app ─────────────────────────────────────────────────────────────

def open_app(app_name: str) -> str:
    """Open an application on your Mac."""
    try:
        subprocess.run(["open", "-a", app_name], check=True)
        return f"Opened {app_name}"
    except Exception as e:
        return f"Could not open {app_name}: {e}"


# ── NEW: Send email ───────────────────────────────────────────────────────────

# ── Browser automation ────────────────────────────────────────────────────────

BROWSER_DATA_DIR = str(Path.home() / ".nevas_agent_browser")

_pw_instance = None
_bw_context  = None
_bw_page     = None

def _get_page():
    global _pw_instance, _bw_context, _bw_page
    from playwright.sync_api import sync_playwright
    if _bw_page is None:
        if _pw_instance is None:
            _pw_instance = sync_playwright().start()
        _bw_context = _pw_instance.chromium.launch_persistent_context(
            user_data_dir=BROWSER_DATA_DIR,
            headless=False,
            viewport={"width": 1280, "height": 800},
            args=["--start-maximized", "--window-position=0,0"],
        )
        pages = _bw_context.pages
        _bw_page = pages[0] if pages else _bw_context.new_page()
    # Always bring window to front
    try:
        _bw_page.bring_to_front()
    except Exception:
        pass
    return _bw_page


def browser_open(url: str) -> str:
    """Navigate the browser to a URL."""
    try:
        page = _get_page()
        page.goto(url, timeout=30000, wait_until="domcontentloaded")
        return f"Opened: {page.title()} — {page.url}"
    except Exception as e:
        return f"Error opening URL: {e}"


def browser_read() -> str:
    """Return the visible text content of the current page."""
    try:
        page = _get_page()
        page.wait_for_load_state("domcontentloaded")
        text = page.evaluate("() => document.body.innerText")
        lines = [l.strip() for l in text.splitlines() if l.strip()]
        content = "\n".join(lines)
        if len(content) > 8000:
            content = content[:8000] + "\n\n[...truncated]"
        return f"Title: {page.title()}\nURL: {page.url}\n\n{content}"
    except Exception as e:
        return f"Error reading page: {e}"


def browser_click(text: str) -> str:
    """Click a visible element on the page that contains the given text or matches a CSS selector."""
    try:
        page = _get_page()
        # Try CSS selector first (if it looks like one), then visible text
        if text.startswith(("#", ".", "[", "button", "input", "a", "div", "span")):
            page.locator(text).first.click(timeout=7000)
        else:
            page.get_by_text(text, exact=False).first.click(timeout=7000)
        page.wait_for_load_state("domcontentloaded")
        return f"Clicked '{text}' — now on: {page.title()}"
    except Exception as e:
        # fallback: aria-label or placeholder
        try:
            page = _get_page()
            page.locator(f'[aria-label*="{text}"], [title*="{text}"]').first.click(timeout=5000)
            return f"Clicked element with label/title '{text}'"
        except Exception:
            return f"Could not find element to click: {e}"


def browser_type(field: str, text: str) -> str:
    """Type text into an input field identified by its placeholder, label, or CSS selector."""
    try:
        page = _get_page()
        if field.startswith(("#", ".", "[")):
            page.locator(field).first.click()
            page.locator(field).first.fill(text)
        else:
            try:
                page.get_by_placeholder(field, exact=False).first.fill(text)
            except Exception:
                page.get_by_label(field, exact=False).first.fill(text)
        return f"Typed into '{field}': {text}"
    except Exception as e:
        return f"Error typing into '{field}': {e}"


def browser_press(key: str) -> str:
    """Press a keyboard key in the browser (e.g. Enter, Tab, Escape, ArrowDown)."""
    try:
        page = _get_page()
        page.keyboard.press(key)
        page.wait_for_load_state("domcontentloaded")
        return f"Pressed {key}"
    except Exception as e:
        return f"Error pressing key: {e}"


def browser_screenshot() -> str:
    """Take a screenshot of the current browser state and save to Desktop."""
    try:
        page = _get_page()
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        path = str(Path.home() / "Desktop" / f"browser_{ts}.png")
        page.screenshot(path=path, full_page=False)
        return f"Browser screenshot saved: {path}"
    except Exception as e:
        return f"Error taking screenshot: {e}"


def add_to_amazon_cart(item: str) -> str:
    """Search Amazon for an item and add the best result to the cart."""
    try:
        page = _get_page()

        # Force browser window to front on macOS
        subprocess.run(
            ["osascript", "-e",
             'tell application "System Events" to set frontmost of every process whose name contains "Chromium" to true'],
            capture_output=True
        )
        page.bring_to_front()

        # Navigate directly to Amazon search URL
        review_keywords = ["best review", "best-review", "top rated", "top-rated", "highest rated"]
        sort_by_reviews = any(k in item.lower() for k in review_keywords)
        query = item.replace(" ", "+")
        sort = "&s=review-rank" if sort_by_reviews else ""
        url = f"https://www.amazon.com/s?k={query}{sort}"
        page.goto(url, timeout=30000, wait_until="domcontentloaded")
        page.wait_for_timeout(3000)
        page.bring_to_front()

        # Click first product — try multiple selectors
        clicked = False
        for selector in [
            "div.s-result-item[data-asin] h2 a",
            "div[data-component-type='s-search-result'] h2 a",
            "h2 a.a-link-normal.a-text-normal",
            "h2 a.a-link-normal",
            ".s-search-results h2 a",
        ]:
            try:
                loc = page.locator(selector).first
                if loc.is_visible(timeout=4000):
                    loc.click(timeout=5000)
                    clicked = True
                    break
            except Exception:
                continue

        if not clicked:
            return f"Could not find products for '{item}' — Amazon may need login or is showing a CAPTCHA. Check the browser window."

        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(2500)
        page.bring_to_front()
        product_title = page.title()

        # Click Add to Cart
        try:
            add_btn = page.locator("#add-to-cart-button")
            add_btn.wait_for(state="visible", timeout=8000)
            add_btn.click()
            page.wait_for_timeout(1500)
            return f"Added to cart: {product_title}"
        except Exception:
            return f"Found '{product_title}' but could not click Add to Cart — may need a size/color selected first."

    except Exception as e:
        return f"Error adding '{item}' to Amazon cart: {e}"


def browser_close() -> str:
    """Close the browser window."""
    global _pw_instance, _bw_context, _bw_page
    try:
        if _bw_context:
            _bw_context.close()
        if _pw_instance:
            _pw_instance.stop()
        _bw_context = _bw_page = _pw_instance = None
        return "Browser closed."
    except Exception as e:
        return f"Error closing browser: {e}"


def send_email(to: str, subject: str, body: str) -> str:
    """Send an email via Gmail. Requires GMAIL_ADDRESS and GMAIL_APP_PASSWORD in .env"""
    import smtplib
    from email.mime.text import MIMEText
    sender = os.getenv("GMAIL_ADDRESS")
    password = os.getenv("GMAIL_APP_PASSWORD")
    if not sender or not password:
        return (
            "Email not configured. Add GMAIL_ADDRESS and GMAIL_APP_PASSWORD to your .env file.\n"
            "Get an app password at: myaccount.google.com/apppasswords"
        )
    try:
        msg = MIMEText(body)
        msg["Subject"] = subject
        msg["From"] = sender
        msg["To"] = to
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
            smtp.login(sender, password)
            smtp.send_message(msg)
        return f"Email sent to {to} — Subject: {subject}"
    except Exception as e:
        return f"Error sending email: {e}"
