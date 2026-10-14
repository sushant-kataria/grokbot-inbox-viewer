#!/usr/bin/env python3
"""Static server + /api/compose queue (stdlib only). Binds 0.0.0.0:8787.
Valid compose requests are appended to data/outbox.jsonl (status "queued"). Nothing is emailed from here."""
import json, os, re, uuid, threading, mimetypes, urllib.parse
from datetime import datetime, timezone, timedelta
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
ROOT = os.path.dirname(os.path.abspath(__file__))
OUTBOX = os.path.join(ROOT, "data", "outbox.jsonl")
IST = timezone(timedelta(hours=5, minutes=30))
BLOCK = {"/webhook.json", "/server.py", "/data/outbox.jsonl", "/data/outbox.log"}
EMAIL = re.compile(r"^[^@\s,;<>]+@[^@\s,;<>]+\.[A-Za-z]{2,}$")
LIMITS = {"subject": 998, "body": 100_000}
MAX_RCPT = 20
LOCK = threading.Lock()
ATT_DIR = os.path.realpath(os.path.join(ROOT, "data", "attachments"))
INLINE = {"image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf", "text/plain"}

def append(entry):
    with LOCK, open(OUTBOX, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")

def now(): return datetime.now(IST).isoformat(timespec="seconds")

def addrs(v, field, required):
    if v is None or v == "": v = []
    if isinstance(v, str): v = [a.strip() for a in re.split(r"[,;]", v) if a.strip()]
    if not isinstance(v, list) or not all(isinstance(a, str) for a in v): raise ValueError(f"{field} must be a string or list")
    if required and not v: raise ValueError(f"{field} is required")
    if len(v) > MAX_RCPT: raise ValueError(f"too many {field} recipients")
    for a in v:
        if len(a) > 254 or not EMAIL.match(a): raise ValueError(f"invalid {field} address: {a[:80]}")
    return v

class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(self, fmt, *args): pass
    def _json(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def _blocked(self):
        p = os.path.normpath(self.path.split("?")[0].split("#")[0])
        return p in BLOCK or p.startswith("/data/outbox")
    def _attachment(self):
        raw = urllib.parse.unquote(self.path.split("?")[0].split("#")[0])
        rel = raw[len("/data/attachments/"):]
        parts = rel.split("/")
        if len(parts) != 2 or any(p in ("", ".", "..") or "\\" in p or "\0" in p for p in parts):
            return self._json(404, {"message": "Not found"})
        full = os.path.realpath(os.path.join(ATT_DIR, *parts))
        if not full.startswith(ATT_DIR + os.sep) or not os.path.isfile(full):
            return self._json(404, {"message": "Not found"})
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        if ctype not in INLINE and not ctype.startswith("image/"): ctype = "application/octet-stream"
        if ctype == "image/svg+xml": ctype = "application/octet-stream"
        disp = "inline" if ctype in INLINE else "attachment"
        data = open(full, "rb").read()
        self.send_response(200); self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Content-Disposition", f"{disp}; filename*=UTF-8''{urllib.parse.quote(parts[1])}")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'")
        self.send_header("Cache-Control", "private, max-age=3600")
        self.end_headers()
        if self.command != "HEAD": self.wfile.write(data)
    def do_GET(self):
        if self._blocked(): return self._json(404, {"message": "Not found"})
        if self.path.startswith("/data/attachments/"): return self._attachment()
        super().do_GET()
    def do_HEAD(self):
        if self._blocked(): return self._json(404, {"message": "Not found"})
        if self.path.startswith("/data/attachments/"): return self._attachment()
        super().do_HEAD()
    def do_POST(self):
        route = self.path.split("?")[0]
        if route not in ("/api/compose", "/api/delete"): return self._json(404, {"message": "Not found"})
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return self._json(400, {"ok": False, "message": "Bad Content-Length"})
        if n > 200_000: return self._json(413, {"ok": False, "message": "Request too large"})
        if route == "/api/delete": return self._delete(n)
        try:
            p = json.loads(self.rfile.read(n) or b"{}")
            if not isinstance(p, dict): raise ValueError("JSON object expected")
            to = addrs(p.get("to"), "to", True); cc = addrs(p.get("cc"), "cc", False)
            vals = {}
            for f, lim in LIMITS.items():
                v = p.get(f) or ""
                if not isinstance(v, str): raise ValueError(f"{f} must be a string")
                if len(v) > lim: raise ValueError(f"{f} too long (max {lim})")
                vals[f] = v
            if "\n" in vals["subject"] or "\r" in vals["subject"]: raise ValueError("subject must be one line")
            r = p.get("reply_to_message_id")
            if r is not None and not (isinstance(r, (str, int)) and len(str(r)) <= 64): raise ValueError("invalid reply_to_message_id")
        except json.JSONDecodeError:
            return self._json(400, {"ok": False, "message": "Invalid JSON"})
        except ValueError as e:
            return self._json(400, {"ok": False, "message": str(e)})
        entry = {"id": str(uuid.uuid4()), "created_at": now(), "action": "compose",
                 "to": to, "cc": cc, "subject": vals["subject"], "body": vals["body"],
                 "reply_to_message_id": None if r is None else str(r), "status": "queued"}
        append(entry)
        return self._json(200, {"ok": True, "id": entry["id"]})

    def _delete(self, n):
        try:
            p = json.loads(self.rfile.read(n) or b"{}")
            if not isinstance(p, dict): raise ValueError("JSON object expected")
            mid, tid = p.get("message_id"), p.get("thread_id")
            if not (isinstance(mid, (str, int)) and re.fullmatch(r"[A-Za-z0-9_-]{1,64}", str(mid))): raise ValueError("invalid message_id")
            if tid is not None and not (isinstance(tid, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,64}", tid)): raise ValueError("invalid thread_id")
            subj, frm = p.get("subject") or "", p.get("from") or ""
            if not isinstance(subj, str) or len(subj) > 998: raise ValueError("invalid subject")
            if not isinstance(frm, str) or len(frm) > 320: raise ValueError("invalid from")
        except json.JSONDecodeError:
            return self._json(400, {"ok": False, "message": "Invalid JSON"})
        except ValueError as e:
            return self._json(400, {"ok": False, "message": str(e)})
        entry = {"id": str(uuid.uuid4()), "created_at": now(), "action": "delete", "message_id": str(mid),
                 "thread_id": tid, "subject": subj, "from": frm, "status": "queued"}
        append(entry)
        return self._json(200, {"ok": True, "id": entry["id"]})

if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", int(os.environ.get("PORT", "8787"))), H).serve_forever()
