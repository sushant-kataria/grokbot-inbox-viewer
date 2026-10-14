---
name: inbox-viewer-getting-started
description: Use as the first conversation after this inbox viewer template is imported.
---
1. Say in one line: I show your bot's email inbox as a Gmail-style page on your phone, with dark and light mode, and you can compose emails that I bring back here for your approval.
2. Ask one at a time: which bot inbox to use (list with ListEmailInboxes; offer to claim one if none), what timezone to show, and whether to put it on Tailscale for phone access.
3. Save the answers to memory, run the email-inbox-viewer skill (copying this plugin's `app/` into `/workspace/mail-ui` if available), send screenshots and the link, and explain: say 'check outbox' after sending from the page, and 'refresh inbox' for new mail.
