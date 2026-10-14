#!/usr/bin/env python3
"""Regenerate data/emails.json from data/manifest.json + data/raw/<message_id>.txt.

The bot's email inbox has no public API reachable from this box;
it is read by the Grok Bot agent via SearchEmailThreads / ReadEmailThread. To refresh:
  1. Ask Grok Bot to re-fetch the inbox: it updates manifest.json (metadata) and raw/*.txt (bodies).
  Attachments are saved by ReadEmailAttachment into data/attachments/<message_id>/<filename>
  and their relative path is recorded in manifest.json ("path").
  2. Run: python3 sync.py   (converts UTC -> IST, builds snippets, writes emails.json)
"""
import json, re, pathlib
from datetime import datetime, timezone, timedelta
D = pathlib.Path(__file__).parent / "data"
import os
_off = float(os.environ.get("INBOX_TZ_OFFSET_HOURS", "5.5"))  # set to your UTC offset
IST = timezone(timedelta(hours=_off))
man = json.loads((D / "manifest.json").read_text())
out = []
for m in man["messages"]:
    body = (D / "raw" / f"{m['id']}.txt").read_text().strip()
    dt = datetime.fromisoformat(m["date_utc"].replace("Z", "+00:00")).astimezone(IST)
    out.append({
        "id": m["id"], "thread_id": m["thread_id"], "folder": m.get("folder", "inbox"),
        "from_name": m["from_name"], "from_email": m["from_email"], "to": m.get("to", [man["inbox"]]),
        "subject": m["subject"], "date_iso": dt.isoformat(),
        "date_ist": dt.strftime("%d %b %Y, %I:%M %p IST"),
        "snippet": re.sub(r"\s+", " ", body)[:160], "body_text": body, "body_html": None,
        "attachments": [dict(a, path=a.get("path") if a.get("path") and (D.parent / a["path"]).is_file() else None) for a in m["attachments"]], "unread": m.get("unread", True)})
out.sort(key=lambda x: x["date_iso"], reverse=True)
res = {"inbox": man["inbox"], "synced_at_ist": datetime.now(IST).strftime("%d %b %Y, %I:%M %p IST"), "messages": out}
_h=set(json.loads((D/"hidden.json").read_text())) if (D/"hidden.json").exists() else set()
res["messages"]=[m for m in res["messages"] if str(m["id"]) not in _h]
(D / "emails.json").write_text(json.dumps(res, indent=2, ensure_ascii=False))
print(f"wrote {len(out)} messages to {D/'emails.json'}")
