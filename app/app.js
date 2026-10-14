const READ_KEY = "mail-read-ids";
const PENDING_KEY = "pendingDelete";
const FONT = "Inter, -apple-system, system-ui, sans-serif";

const inboxAddr = document.getElementById("inbox-addr");
const listEl = document.getElementById("list");
const readerEl = document.getElementById("reader");
const searchEl = document.getElementById("search");
const countInbox = document.getElementById("count-inbox");
const countSent = document.getElementById("count-sent");

const state = {
  inbox: "",
  messages: [],
  folder: "inbox",
  query: "",
  selectedId: null,
  error: "",
};

let readIds = loadReadIds();
let pendingIds = loadPendingIds();

const ICONS = {
  reply: '<polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
  back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  paperclip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
};

function icon(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
}

function loadReadIds() {
  try {
    const ids = JSON.parse(localStorage.getItem(READ_KEY) || "[]");
    return new Set(Array.isArray(ids) ? ids.map(String) : []);
  } catch {
    return new Set();
  }
}

function persistRead() {
  localStorage.setItem(READ_KEY, JSON.stringify([...readIds]));
}

function loadPendingIds() {
  try {
    const ids = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
    return new Set(Array.isArray(ids) ? ids.map(String) : []);
  } catch {
    return new Set();
  }
}

function persistPending() {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify([...pendingIds]));
  } catch { /* storage unavailable */ }
}

function isPending(id) {
  return pendingIds.has(String(id));
}

function isUnread(msg) {
  return Boolean(msg.unread) && !readIds.has(String(msg.id));
}

function markRead(id) {
  const key = String(id);
  if (!key || readIds.has(key)) return;
  readIds.add(key);
  persistRead();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function formatSize(size) {
  if (size == null || size === "") return "";
  const n = Number(size);
  if (!Number.isFinite(n)) return String(size);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentHref(path) {
  return String(path).split("/").map((seg) => encodeURIComponent(seg)).join("/");
}

function isImageMime(mime) {
  return /^image\//i.test(String(mime || ""));
}

function shortDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  const opts = { month: "short", day: "numeric" };
  if (d.getFullYear() !== now.getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString([], opts);
}

function parseHash() {
  const match = /^#msg=(.+)$/.exec(location.hash);
  return match ? decodeURIComponent(match[1]) : "";
}

function visibleMessages() {
  const q = state.query.trim().toLowerCase();
  return state.messages
    .filter((msg) => (msg.folder === "sent" ? "sent" : "inbox") === state.folder)
    .filter((msg) => {
      if (!q) return true;
      const body = `${msg.body_text || ""} ${(msg.body_html || "").replace(/<[^>]+>/g, " ")}`;
      return [msg.from_name, msg.from_email, msg.subject, body].join("\n").toLowerCase().includes(q);
    })
    .sort((a, b) => String(b.date_iso).localeCompare(String(a.date_iso)));
}

function linkify(escaped) {
  return escaped.replace(/https?:\/\/[^\s<]+/g, (raw) => {
    const href = raw.replace(/[.,;:!?)]+$/g, "");
    const trail = raw.slice(href.length);
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${href}</a>${trail}`;
  });
}

function renderBodyText(text) {
  return String(text ?? "").split("\n").map((line) => {
    const h2 = /^##\s+(.*)$/.exec(line);
    const h1 = /^#\s+(.*)$/.exec(line);
    if (h2) return `<div class="md-h2">${linkify(escapeHtml(h2[1]))}</div>`;
    if (h1) return `<div class="md-h1">${linkify(escapeHtml(h1[1]))}</div>`;
    return `<div class="md-p">${linkify(escapeHtml(line)) || "&nbsp;"}</div>`;
  }).join("");
}

function sanitizedHtml(html) {
  if (window.DOMPurify && typeof DOMPurify.sanitize === "function") {
    return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  }
  return `<pre style="white-space:pre-wrap;font:14px/1.55 ${FONT}">${escapeHtml(html)}</pre>`;
}

function themeColors() {
  const dark = document.documentElement.dataset.theme === "dark";
  return dark
    ? { text: "#f3f3f4", bg: "#141416", link: "#d4d4d8" }
    : { text: "#1a1a1c", bg: "#ffffff", link: "#3f3f46" };
}

function srcdocFor(inner) {
  const c = themeColors();
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><base target="_blank"><style>
    body{margin:0;font:14px/1.55 ${FONT};color:${c.text};background:${c.bg};overflow-wrap:anywhere}
    img,video{max-width:100%;height:auto} a{color:${c.link}} pre{white-space:pre-wrap}
  </style></head><body>${inner}</body></html>`;
}

function replySubject(subject) {
  const s = String(subject || "");
  if (/^re:/i.test(s.trim())) return s;
  return `Re: ${s}`;
}

function emptyState(title, detail) {
  return `<div class="empty">${icon("mail")}<h2>${escapeHtml(title)}</h2><p>${escapeHtml(detail)}</p></div>`;
}

function renderAttachments(files) {
  if (!files || !files.length) return "";
  const cards = files.map((file) => {
    const name = file.name || "attachment";
    const size = formatSize(file.size);
    if (file.path == null || file.path === "") {
      return `<div class="attach-card is-disabled">
        <div class="attach-file">
          ${icon("file")}
          <div class="attach-copy">
            <div class="attach-name">${escapeHtml(name)}</div>
            <div class="attach-missing">Not downloaded</div>
          </div>
        </div>
      </div>`;
    }
    const href = attachmentHref(file.path);
    if (isImageMime(file.mime)) {
      return `<div class="attach-card is-image">
        <button type="button" class="thumb" data-lightbox="${escapeHtml(href)}" data-name="${escapeHtml(name)}" aria-label="View ${escapeHtml(name)}">
          <img src="${escapeHtml(href)}" alt="${escapeHtml(name)}" loading="lazy" width="160" height="120">
        </button>
        <div class="attach-caption"><div class="attach-name">${escapeHtml(name)}</div></div>
      </div>`;
    }
    const sizeHtml = size ? `<div class="attach-size">${escapeHtml(size)}</div>` : "";
    return `<div class="attach-card is-file">
      <div class="attach-file">
        ${icon("file")}
        <div class="attach-copy">
          <div class="attach-name">${escapeHtml(name)}</div>
          ${sizeHtml}
        </div>
      </div>
      <div class="attach-links">
        <a href="${escapeHtml(href)}" target="_blank" rel="noopener">Open</a>
        <a href="${escapeHtml(href)}" download="${escapeHtml(name)}">Download</a>
      </div>
    </div>`;
  }).join("");
  return `<div class="attach-block">
    <div class="attach-label">${icon("paperclip")}<span>Attachments</span></div>
    <div class="attach-list">${cards}</div>
  </div>`;
}

function renderList() {
  const rows = visibleMessages();
  const totalInFolder = state.messages.filter((msg) => (msg.folder === "sent" ? "sent" : "inbox") === state.folder).length;
  if (!rows.length) {
    const sentEmpty = state.folder === "sent" && totalInFolder === 0 && !state.query && !state.error;
    listEl.innerHTML = state.error
      ? emptyState("Couldn’t load mail", state.error)
      : sentEmpty
      ? emptyState("No sent mail", "Sent messages will show up here.")
      : emptyState("No messages", state.query ? "Nothing matches your search." : "This folder is empty.");
    return;
  }
  listEl.innerHTML = rows.map((msg) => {
    const unread = isUnread(msg);
    const selected = msg.id === state.selectedId;
    const pending = isPending(msg.id);
    const sender = msg.folder === "sent"
      ? (msg.to && msg.to[0]) || msg.from_name || msg.from_email
      : msg.from_name || msg.from_email;
    const badge = pending ? `<span class="badge">Pending delete</span>` : "";
    return `<button type="button" class="row${unread ? " unread" : ""}${selected ? " selected" : ""}${pending ? " is-pending" : ""}" data-id="${escapeHtml(msg.id)}">
      <span class="from"><span class="from-name">${escapeHtml(sender || "(unknown)")}</span>${badge}</span>
      <span class="date">${escapeHtml(shortDate(msg.date_iso))}</span>
      <span class="subject-line"><span class="subject">${escapeHtml(msg.subject || "(no subject)")}</span> <span class="snippet">${escapeHtml(msg.snippet || "")}</span></span>
    </button>`;
  }).join("");
}

function renderReader() {
  const msg = state.messages.find((item) => item.id === state.selectedId);
  readerEl.replaceChildren();
  if (!msg) {
    const empty = document.createElement("div");
    empty.className = "reader-empty";
    empty.innerHTML = state.error
      ? `${icon("mail")}<h2>Couldn’t load mail</h2><p>${escapeHtml(state.error)}</p>`
      : `${icon("mail")}<p>Select a message to read</p>`;
    readerEl.appendChild(empty);
    return;
  }
  const pending = isPending(msg.id);
  const wrap = document.createElement("div");
  wrap.className = "reader-inner";
  const to = (msg.to || []).join(", ");
  const initial = (msg.from_name || msg.from_email || "?").trim().charAt(0).toUpperCase();
  wrap.innerHTML = `
    <div class="reader-toolbar">
      <button type="button" class="btn back-btn" id="back">${icon("back")}<span>Back</span></button>
      <div class="toolbar-actions">
        <button type="button" class="btn reply-btn" id="reply">${icon("reply")}<span>Reply</span></button>
        <button type="button" class="btn delete-btn" id="delete-msg"${pending ? " disabled" : ""}>${icon("trash")}<span>Delete</span></button>
      </div>
    </div>
    ${pending ? `<div class="banner" role="status">Pending delete</div>` : ""}
    <h2 class="subject">${escapeHtml(msg.subject || "(no subject)")}</h2>
    <div class="meta">
      <div class="avatar">${escapeHtml(initial)}</div>
      <div class="meta-main">
        <div class="from-line"><strong>${escapeHtml(msg.from_name || "")}</strong> <span class="email">&lt;${escapeHtml(msg.from_email || "")}&gt;</span></div>
        <div class="to">to ${escapeHtml(to || "—")}</div>
      </div>
      <div class="full-date">${escapeHtml(msg.date_ist || "")}</div>
    </div>
    ${renderAttachments(msg.attachments)}`;
  if (msg.body_html) {
    const frame = document.createElement("iframe");
    frame.className = "body-frame";
    frame.setAttribute("sandbox", "allow-popups allow-popups-to-escape-sandbox");
    frame.referrerPolicy = "no-referrer";
    frame.title = "Message body";
    frame.srcdoc = srcdocFor(sanitizedHtml(msg.body_html));
    wrap.appendChild(frame);
  } else {
    const body = document.createElement("div");
    body.className = "body-text";
    body.innerHTML = renderBodyText(msg.body_text || "");
    wrap.appendChild(body);
  }
  readerEl.appendChild(wrap);
}

function render() {
  document.querySelector(".layout").classList.toggle("has-message", Boolean(state.selectedId));
  inboxAddr.textContent = state.inbox || (state.error ? "Unavailable" : "—");
  const inboxN = state.messages.filter((msg) => msg.folder !== "sent").length;
  const sentN = state.messages.filter((msg) => msg.folder === "sent").length;
  countInbox.textContent = String(inboxN);
  countSent.textContent = String(sentN);
  document.querySelectorAll(".folder").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.folder === state.folder);
  });
  renderList();
  renderReader();
}

function openMessage(id, updateHash) {
  const msg = state.messages.find((item) => item.id === id);
  if (!msg) return;
  state.folder = msg.folder === "sent" ? "sent" : "inbox";
  state.selectedId = msg.id;
  markRead(msg.id);
  if (updateHash && parseHash() !== msg.id) {
    location.hash = `msg=${encodeURIComponent(msg.id)}`;
  }
  render();
}

async function loadMail() {
  state.error = "";
  inboxAddr.textContent = "Loading…";
  try {
    const res = await fetch(`data/emails.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    const data = await res.json();
    state.inbox = data.inbox || "";
    state.messages = Array.isArray(data.messages) ? data.messages : [];
    const hashId = parseHash();
    const hashed = hashId && state.messages.find((msg) => msg.id === hashId);
    if (hashed) {
      state.folder = hashed.folder === "sent" ? "sent" : "inbox";
      state.selectedId = hashed.id;
      markRead(hashed.id);
    } else if (state.selectedId && !state.messages.some((msg) => msg.id === state.selectedId)) {
      state.selectedId = null;
    }
    render();
  } catch (err) {
    state.error = err.message || "Could not load mail";
    state.messages = [];
    render();
  }
}

document.querySelectorAll(".folder").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.folder = btn.dataset.folder;
    const selected = state.messages.find((msg) => msg.id === state.selectedId);
    if (selected && (selected.folder === "sent" ? "sent" : "inbox") !== state.folder) {
      state.selectedId = null;
      if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    }
    render();
  });
});

listEl.addEventListener("click", (event) => {
  const row = event.target.closest(".row");
  if (!row) return;
  openMessage(row.dataset.id, true);
});

searchEl.addEventListener("input", () => {
  state.query = searchEl.value;
  renderList();
});

function closeMessage() {
  state.selectedId = null;
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  render();
}

const composeModal = document.getElementById("compose-modal");
const composeForm = document.getElementById("compose-form");
const composeStatus = document.getElementById("compose-status");
const composeTitle = document.getElementById("compose-title");
const composeSubmit = document.getElementById("compose-submit");
let replyToMessageId = null;

function openCompose(msg) {
  replyToMessageId = msg ? msg.id : null;
  composeTitle.textContent = msg ? "Reply" : "Compose";
  composeForm.elements.to.value = msg ? (msg.from_email || "") : "";
  composeForm.elements.cc.value = "";
  composeForm.elements.subject.value = msg ? replySubject(msg.subject || "") : "";
  composeForm.elements.body.value = "";
  composeStatus.textContent = "";
  composeStatus.className = "form-status";
  composeSubmit.disabled = false;
  composeModal.hidden = false;
  composeForm.elements.to.focus();
}

function closeCompose() {
  composeModal.hidden = true;
  replyToMessageId = null;
}

composeModal.addEventListener("click", (event) => {
  if (event.target.closest("[data-close]") || event.target.closest("#compose-close")) closeCompose();
});
document.getElementById("compose-cancel").addEventListener("click", closeCompose);

composeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  composeStatus.textContent = "";
  composeStatus.className = "form-status";
  composeSubmit.disabled = true;
  const payload = {
    action: "compose",
    to: composeForm.elements.to.value,
    cc: composeForm.elements.cc.value,
    subject: composeForm.elements.subject.value,
    body: composeForm.elements.body.value,
    reply_to_message_id: replyToMessageId,
  };
  try {
    const res = await fetch("/api/compose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    let message = "";
    try {
      const data = await res.json();
      if (data && typeof data.message === "string") message = data.message;
    } catch { /* non-JSON error body */ }
    if (res.ok) {
      composeStatus.textContent = 'Queued. Tell Grok Bot "check outbox" to approve it in chat.';
      composeStatus.className = "form-status ok";
    } else {
      composeStatus.textContent = message || "Could not send the message.";
      composeStatus.className = "form-status err";
    }
  } catch {
    composeStatus.textContent = "Could not send the message.";
    composeStatus.className = "form-status err";
  } finally {
    composeSubmit.disabled = false;
  }
});

document.getElementById("compose").addEventListener("click", () => openCompose(null));

const deleteModal = document.getElementById("delete-modal");
const deleteSubject = document.getElementById("delete-subject");
const deleteStatus = document.getElementById("delete-status");
const deleteConfirm = document.getElementById("delete-confirm");
let deleteTarget = null;

function openDelete(msg) {
  if (!msg || isPending(msg.id)) return;
  deleteTarget = msg;
  deleteSubject.textContent = msg.subject || "(no subject)";
  deleteStatus.textContent = "";
  deleteStatus.className = "form-status";
  deleteConfirm.disabled = false;
  deleteModal.hidden = false;
  document.getElementById("delete-cancel").focus();
}

function closeDelete() {
  deleteModal.hidden = true;
  deleteTarget = null;
}

deleteModal.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-delete]") || event.target.closest("#delete-close")) closeDelete();
});
document.getElementById("delete-cancel").addEventListener("click", closeDelete);

deleteConfirm.addEventListener("click", async () => {
  const msg = deleteTarget;
  if (!msg || deleteConfirm.disabled) return;
  deleteStatus.textContent = "";
  deleteStatus.className = "form-status";
  deleteConfirm.disabled = true;
  try {
    const res = await fetch("/api/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message_id: msg.id,
        thread_id: msg.thread_id,
        subject: msg.subject || "",
        from: msg.from_email || "",
      }),
    });
    if (res.ok) {
      pendingIds.add(String(msg.id));
      persistPending();
      deleteStatus.textContent = 'Queued. Tell Grok Bot "check outbox" to confirm.';
      deleteStatus.className = "form-status ok";
      render();
      return;
    }
    let message = "";
    try {
      const data = await res.json();
      if (data && typeof data.message === "string") message = data.message;
    } catch { /* non-JSON error body */ }
    deleteStatus.textContent = message || "Could not delete the message.";
    deleteStatus.className = "form-status err";
    deleteConfirm.disabled = false;
  } catch {
    deleteStatus.textContent = "Could not delete the message.";
    deleteStatus.className = "form-status err";
    deleteConfirm.disabled = false;
  }
});

const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightbox-img");
const lightboxOpen = document.getElementById("lightbox-open");

function openLightbox(href, name) {
  lightboxImg.src = href;
  lightboxImg.alt = name || "Attachment";
  lightboxOpen.href = href;
  lightbox.hidden = false;
  document.getElementById("lightbox-close").focus();
}

function closeLightbox() {
  lightbox.hidden = true;
  lightboxImg.removeAttribute("src");
  lightboxOpen.href = "";
}

document.getElementById("lightbox-close").addEventListener("click", (event) => {
  event.stopPropagation();
  closeLightbox();
});
lightbox.addEventListener("click", (event) => {
  if (event.target.closest("a")) return;
  closeLightbox();
});

readerEl.addEventListener("click", (event) => {
  if (event.target.closest("#back")) {
    closeMessage();
    return;
  }
  if (event.target.closest("#reply")) {
    const msg = state.messages.find((item) => item.id === state.selectedId);
    if (msg) openCompose(msg);
    return;
  }
  if (event.target.closest("#delete-msg")) {
    const msg = state.messages.find((item) => item.id === state.selectedId);
    if (msg) openDelete(msg);
    return;
  }
  const thumb = event.target.closest("[data-lightbox]");
  if (thumb) openLightbox(thumb.dataset.lightbox, thumb.dataset.name || "");
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!lightbox.hidden) {
    closeLightbox();
    return;
  }
  if (!deleteModal.hidden) {
    closeDelete();
    return;
  }
  if (!composeModal.hidden) closeCompose();
});

function syncThemeButton() {
  const dark = document.documentElement.dataset.theme === "dark";
  document.getElementById("theme-toggle").setAttribute(
    "aria-label",
    dark ? "Switch to light mode" : "Switch to dark mode",
  );
}

document.getElementById("theme-toggle").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
  syncThemeButton();
  renderReader();
});
syncThemeButton();

document.getElementById("refresh").addEventListener("click", loadMail);
window.addEventListener("hashchange", () => {
  const id = parseHash();
  if (!id) {
    state.selectedId = null;
    render();
    return;
  }
  openMessage(id, false);
});

loadMail();
