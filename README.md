# Grok Bot Inbox Viewer

A Cursor plugin that gives a **Grok Bot** agent a Gmail-style web page for its own email inbox. You can read, search and open attachments on your phone or laptop. Compose and delete requests are only queued. The bot carries them out after you approve each one in chat.

## Requirements
This plugin is built for **Grok Bot**. It relies on the bot's built-in email inbox tools (ListEmailInboxes, SearchEmailThreads, ReadEmailThread, ReadEmailAttachment) and on its in-chat approval cards (DraftExternalMessage) for sending. Other agents can still run the web app, but syncing and sending will not work without those tools.

The web app needs only Python 3 (stdlib) and a modern browser.

## Features
- Inbox and Sent folders, unread in bold, reading pane, search, Refresh
- Light and dark themes (sun/moon toggle that follows the system and remembers your choice), neutral design, one consistent outline icon set
- Attachments: image thumbnails with a full-size overlay, other files as Open/Download cards
- Compose and Reply (fills in To, "Re:" and the thread) go into a local queue (`data/outbox.jsonl`)
- Delete with a confirm step. The message shows a "Pending delete" badge until the bot handles it
- Mobile layout (390px wide): stacked list and message view with a Back button
- HTML bodies are sanitized. The server refuses to serve `server.py` and the outbox

## What's included
```
.cursor-plugin/plugin.json      plugin manifest
skills/email-inbox-viewer/      main skill: sync, serve, Tailscale, "check outbox", refresh
skills/inbox-viewer-getting-started/   first-run onboarding
app/                            ready-made web app (index.html, style.css, app.js, server.py, sync.py)
app/data/emails.json            two fake sample messages
assets/logo.svg
```

## Install
1. Install the plugin from the Cursor Marketplace, or clone this repo and add it as a local plugin.
2. Ask the bot: "set up my inbox viewer". The getting-started skill asks which bot inbox to use (it can claim one), your timezone, and whether you want Tailscale.
3. The bot copies `app/` to `/workspace/mail-ui`, fetches your mail into `data/` and starts the server:
   ```
   cd /workspace/mail-ui && nohup python3 server.py > /tmp/mailui.log 2>&1 &
   ```
   It listens on `0.0.0.0:8787`. Set `INBOX_TZ_OFFSET_HOURS` (for example `-5` or `5.5`) before you run `sync.py` to choose the timezone that dates are shown in.

Day to day:
- **"refresh inbox"**: the bot re-fetches your mail. Then tap Refresh on the page.
- **"check outbox"**: the bot reads queued compose and delete requests and shows an approval card for each one.

## Tailscale (phone or laptop access)
1. Approve the setup in chat. The bot installs Tailscale on its machine and sends you a login link.
2. Sign in with your Tailscale account. Install the Tailscale app on each phone or computer and sign in with the **same** account.
3. The bot checks `tailscale status` and sends you the page link, in the form `http://<tailnet-ip>:8787`.

The page is only reachable inside your private tailnet. It is not on the public internet.

## Privacy
- Nothing sends or deletes without your approval. The page only writes requests to a local queue. Each email goes out only after you approve its card in chat. Deletes need confirmation too, or the message is just hidden from the page.
- Your mail is stored only on the bot's machine under `app/data/`, which is git-ignored. This repo ships no real data.

## License
MIT. See [LICENSE](LICENSE).
