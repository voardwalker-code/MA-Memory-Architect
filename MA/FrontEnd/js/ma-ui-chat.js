// ── FrontEnd · Chat panel & talking to MA ────────────────────────────────────
//
// HOW CHAT WORKS:
// The right side of the screen is a text thread with MA (the AI). We keep a
// JavaScript array (`history`) that mirrors what you see — like a notebook
// copy of the bubbles. When you send, we POST to the server. The fancy route
// streams progress with Server-Sent Events (little updates as MA "thinks"),
// so you can see steps like a progress bar in the thread.
//
// Think of it like texting a friend who replies in chunks: sometimes they send
// one big message, sometimes a stream of "still working…" updates. We also
// nudge the Session sidebar when the server says the worklog changed.
//
// WHAT USES THIS:
//   MA-index.html — Send button, session dropdown, and related handlers.
//   ma-ui-input.js — wraps handleKey and calls send().
//
// WHAT IT NEEDS FIRST:
//   ma-ui.js, ma-ui-dom.js (escHtml), ma-ui-api.js (apiPostJson).
//
// GLOBAL API (high level):
//   send(), addMsg(), addSystem(), saveSession(), loadSessionList(), …
//   Session helpers and streaming chat logic used by the composer.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

// ── Session state (which conversation is open) ──────────────────────────────
let activeSessionId = null; // null = new session (not yet saved)
let allSessions = [];       // cached session list from server

// ── Long-request timeout popup ────────────────────────────────────────────
const LONG_REQUEST_THRESHOLD = 30000; // 30s before showing popup
const AUTOPILOT_KEY = 'ma-autopilot-v1';
let _lrTimer = null;
let _lrStartTime = 0;
let _lrAbortController = null;
let _lrDismissed = false;

function isAutoPilot() { return localStorage.getItem(AUTOPILOT_KEY) === '1'; }
function setAutoPilot(on) { localStorage.setItem(AUTOPILOT_KEY, on ? '1' : '0'); }

function _startLongRequestTimer() {
  _lrStartTime = Date.now();
  _lrDismissed = false;
  _clearLongRequestTimer();
  if (isAutoPilot()) return; // no popups in auto pilot
  _lrTimer = setTimeout(_showLongRequestPopup, LONG_REQUEST_THRESHOLD);
}

function _resetLongRequestTimer() {
  // Reset on any progress event (SSE activity/step)
  if (_lrDismissed || isAutoPilot()) return;
  _clearLongRequestTimer();
  _lrTimer = setTimeout(_showLongRequestPopup, LONG_REQUEST_THRESHOLD);
}

function _clearLongRequestTimer() {
  if (_lrTimer) { clearTimeout(_lrTimer); _lrTimer = null; }
}

function _showLongRequestPopup() {
  const overlay = document.getElementById('long-request-overlay');
  const elapsedEl = document.getElementById('lr-elapsed');
  if (!overlay) return;
  const elapsed = Math.round((Date.now() - _lrStartTime) / 1000);
  if (elapsedEl) elapsedEl.textContent = elapsed;
  overlay.classList.remove('hidden');
}

function dismissLongRequest() {
  const overlay = document.getElementById('long-request-overlay');
  if (overlay) overlay.classList.add('hidden');
  _lrDismissed = true;
  _clearLongRequestTimer();
}

function cancelLongRequest() {
  const overlay = document.getElementById('long-request-overlay');
  if (overlay) overlay.classList.add('hidden');
  _clearLongRequestTimer();
  if (_lrAbortController) { _lrAbortController.abort(); _lrAbortController = null; }
  hideTyping();
  addSystem('Request cancelled.');
  sending = false;
  sendBtn.disabled = false;
  inputEl.focus();
}

function toggleAutoPilotFromPopup(checked) {
  setAutoPilot(checked);
  if (checked) dismissLongRequest();
}

// ── Session picker ────────────────────────────────────────────────────────
async function loadSessionList() {
  try {
    const r = await fetch('/api/chat/sessions');
    const d = await r.json();
    allSessions = d.sessions || [];
  } catch (_) { allSessions = []; }
  renderSessionPicker();
}

function renderSessionPicker() {
  const dd = document.getElementById('session-dropdown');
  if (dd && !dd.classList.contains('hidden')) renderSessionDropdown();
}

function toggleSessionDropdown() {
  const dd = document.getElementById('session-dropdown');
  if (!dd) return;
  dd.classList.toggle('hidden');
  if (!dd.classList.contains('hidden')) renderSessionDropdown();
}

function renderSessionDropdown() {
  const dd = document.getElementById('session-dropdown');
  if (!dd) return;
  dd.innerHTML = '';
  if (!allSessions.length) {
    dd.innerHTML = '<div class="sp-dd-empty">No sessions yet</div>';
    return;
  }
  // Group by date
  const groups = {};
  for (const s of allSessions) {
    const day = (s.updatedAt || s.createdAt || '').slice(0, 10);
    if (!groups[day]) groups[day] = [];
    groups[day].push(s);
  }
  for (const [day, items] of Object.entries(groups)) {
    const label = document.createElement('div');
    label.className = 'sp-dd-date';
    label.textContent = day;
    dd.appendChild(label);
    for (const s of items) {
      const row = document.createElement('button');
      row.className = 'sp-dd-item' + (s.id === activeSessionId ? ' active' : '');
      row.textContent = s.preview || 'Session';
      row.onclick = () => { loadSession(s.id); dd.classList.add('hidden'); };
      dd.appendChild(row);
    }
  }
}

async function loadSession(id) {
  try {
    const r = await fetch('/api/chat/session/' + encodeURIComponent(id));
    if (!r.ok) { addSystem('Could not load session.'); return; }
    const d = await r.json();
    activeSessionId = d.id;
    history = d.messages || [];
    chatEl.innerHTML = '';
    for (const msg of history) {
      if (msg.role === 'user') addMsg('user', msg.content);
      else if (msg.role === 'assistant') addMsg('ma', msg.content);
    }
    renderSessionPicker();
  } catch (_) { addSystem('Failed to load session.'); }
}

function startNewSession() {
  activeSessionId = null;
  history = [];
  chatEl.innerHTML = '';
  renderSessionPicker();
}

async function saveSession() {
  if (!history.length) return;
  try {
    const r = await apiPostJson('/api/chat/session', { id: activeSessionId, messages: history });
    const d = await r.json();
    if (d.id) activeSessionId = d.id;
    loadSessionList(); // refresh picker
    if (typeof loadConversationHistory === 'function') loadConversationHistory(); // refresh explorer
  } catch (_) { /* silent */ }
}

// Close dropdown on outside click
document.addEventListener('click', (e) => {
  const wrap = document.getElementById('session-dropdown-wrap');
  const dd = document.getElementById('session-dropdown');
  if (dd && wrap && !wrap.contains(e.target)) dd.classList.add('hidden');
});

// ── Chat ──────────────────────────────────────────────────────────────────
function addMsg(role, text) {
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  if (role === 'ma') {
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    // Render MA messages with markdown formatting
    if (typeof renderMarkdown === 'function') {
      bubble.innerHTML = '<div class="md-preview">' + renderMarkdown(text) + '</div>';
    } else {
      bubble.textContent = text;
    }
    div.appendChild(bubble);
  } else {
    div.textContent = text;
  }
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
  return div;
}

function addSystem(text) {
  const div = document.createElement('div');
  div.className = 'msg system';
  div.textContent = text;
  chatEl.appendChild(div);
}

function showTyping() {
  const div = document.createElement('div');
  div.className = 'typing';
  div.id = 'typing';
  div.textContent = 'MA is thinking...';
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function hideTyping() {
  const el = document.getElementById('typing');
  if (el) el.remove();
}

// ── Task progress widget ────────────────────────────────────────────
function createProgressWidget() {
  const widget = document.createElement('div');
  widget.className = 'task-progress';
  widget.id = 'task-progress';
  widget.innerHTML = '<div class="tp-header"><div class="tp-spinner"></div><span>Working...</span></div>' +
    '<div class="tp-bar"><div class="tp-fill" style="width:0%"></div></div>' +
    '<div class="tp-steps"></div>';
  chatEl.appendChild(widget);
  chatEl.scrollTop = chatEl.scrollHeight;
  return widget;
}

function updateProgress(widget, stepInfo) {
  const pct = Math.round(((stepInfo.stepIndex + 1) / stepInfo.stepTotal) * 100);
  const fill = widget.querySelector('.tp-fill');
  const header = widget.querySelector('.tp-header span');
  const steps = widget.querySelector('.tp-steps');

  fill.style.width = pct + '%';
  header.textContent = `Step ${stepInfo.stepIndex + 1} of ${stepInfo.stepTotal}`;

  // Mark previous steps as done
  const existing = steps.querySelectorAll('.tp-step.active');
  existing.forEach(el => { el.classList.remove('active'); el.classList.add('done'); el.querySelector('.tp-icon').textContent = '✓'; });

  // Add current step
  const stepEl = document.createElement('div');
  stepEl.className = 'tp-step active';
  stepEl.innerHTML = '<span class="tp-icon">►</span><span>' + escHtml(stepInfo.description) + '</span>';
  steps.appendChild(stepEl);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function finalizeProgress(widget) {
  const spinner = widget.querySelector('.tp-spinner');
  if (spinner) spinner.remove();
  const header = widget.querySelector('.tp-header span');
  header.textContent = 'Complete';
  const active = widget.querySelectorAll('.tp-step.active');
  active.forEach(el => { el.classList.remove('active'); el.classList.add('done'); el.querySelector('.tp-icon').textContent = '✓'; });
  const fill = widget.querySelector('.tp-fill');
  fill.style.width = '100%';
}

// ─────────────────────────────────────────────────────────────────────────────
// send()
//
// Sends the user's message (and any attached files) to MA.
//
// Think of it like dropping a letter in two possible mail slots:
//   • First we try the "streaming" slot (/api/chat/stream). The server can send
//     many small updates (Server-Sent Events) — step progress, activity pings,
//     then a final answer. Like watching pizza tracking: "making dough", "in oven", "done".
//   • If that slot is broken (HTTP error), we use the plain slot (/api/chat) for
//     one big JSON response instead.
//
// Along the way we: show "typing…", start a long-request timer (popup if stuck),
// parse event: / data: lines from the stream, refresh the Session pane when the
// server says plan/worklog changed, and call handleChatResult() when the reply arrives.
//
// Uses globals: inputEl, pendingFiles, history, sending, sendBtn, _lrAbortController, …
// ─────────────────────────────────────────────────────────────────────────────
async function send() {
  const text = inputEl.value.trim();
  if (!text && !pendingFiles.length) return;
  if (sending) return;

  sending = true;
  sendBtn.disabled = true;

  // Build display text: message + filenames
  const fileNames = pendingFiles.map(f => f.name);
  const imageFiles = pendingFiles.filter(f => f.type === 'image');
  const displayText = fileNames.length
    ? (text ? text + '\n📎 ' + fileNames.join(', ') : '📎 ' + fileNames.join(', '))
    : text;
  addMsg('user', displayText);
  // Show image thumbnails inline in the chat
  if (imageFiles.length) {
    const lastMsg = chatEl.querySelector('.msg:last-child');
    if (lastMsg) {
      for (const img of imageFiles) {
        const el = document.createElement('img');
        el.src = img.content; el.className = 'chat-img'; el.alt = img.name;
        lastMsg.appendChild(el);
      }
    }
  }
  inputEl.value = '';
  inputEl.style.height = 'auto';

  const msgText = text || ('I attached these files: ' + fileNames.join(', '));
  history.push({ role: 'user', content: msgText });
  showTyping();

  // Capture attachments — keep chips visible until user removes them via ✕
  const attachments = pendingFiles.slice();

  const payload = JSON.stringify({
    message: msgText,
    history: history.slice(-10),
    attachments: attachments.length ? attachments : undefined,
    autoPilot: isAutoPilot()
  });

  try {
    // Use SSE streaming endpoint for step progress
    _lrAbortController = new AbortController();
    _startLongRequestTimer();
    const r = await apiPostJson('/api/chat/stream', payload, { signal: _lrAbortController.signal });

    if (!r.ok) {
      // Fallback: try regular endpoint
      _clearLongRequestTimer();
      hideTyping();
      const r2 = await apiPostJson('/api/chat', payload);
      const d = await r2.json();
      if (d.error) { addSystem('Error: ' + d.error); }
      else { handleChatResult(d); }
      sending = false; sendBtn.disabled = false; inputEl.focus(); return;
    }

    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let progressWidget = null;
    let gotSteps = false;
    let eventType = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events from buffer
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // keep incomplete line in buffer
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith('data: ') && eventType) {
          _resetLongRequestTimer(); // got data — reset timeout popup
          try {
            const data = JSON.parse(line.slice(6));
            if (eventType === 'activity') {
              // Plan/worklog SSE events refresh the Session explorer task editor.
              if (data.category === 'plan' || data.category === 'worklog') loadWorklog();
              // Show self-review phase in typing indicator
              if (data.category === 'self_review') {
                const tyEl = document.getElementById('typing');
                if (tyEl) tyEl.textContent = '🔍 ' + (data.detail || 'MA is reviewing her response...');
              }
            } else if (eventType === 'step') {
              if (!gotSteps) {
                hideTyping();
                progressWidget = createProgressWidget();
                gotSteps = true;
              }
              updateProgress(progressWidget, data);
            } else if (eventType === 'done') {
              _clearLongRequestTimer();
              hideTyping();
              if (progressWidget) finalizeProgress(progressWidget);
              handleChatResult(data);
            } else if (eventType === 'error') {
              _clearLongRequestTimer();
              hideTyping();
              if (progressWidget) finalizeProgress(progressWidget);
              addSystem('Error: ' + (data.error || 'Unknown error'));
            }
          } catch (_) { /* skip parse errors */ }
          eventType = null;
        } else if (line === '') {
          eventType = null; // reset on blank line
        }
      }
    }

    _clearLongRequestTimer();
    // If no events came through at all, handle gracefully
    if (!gotSteps) hideTyping();

  } catch (e) {
    _clearLongRequestTimer();
    dismissLongRequest();
    hideTyping();
    if (e.name !== 'AbortError') addSystem('Network error: ' + e.message);
  }

  sending = false;
  sendBtn.disabled = false;
  inputEl.focus();
}

// ─────────────────────────────────────────────────────────────────────────────
// handleChatResult(d)
//
// Takes the server's answer object after MA finishes one turn. We already showed
// the user's message in send(); now we paint MA's reply and all the extras.
//
// Think of `d` as a gift box from the server:
//   • reply — the main text we show as a chat bubble (may include markdown).
//   • thinking — optional long "scratch work" shown in a collapsible block.
//   • selfReview — short badge if MA self-checked her answer.
//   • filesChanged + fileSnapshots — list of edited files with Keep / Reject
//     so you can undo a bad edit (Reject writes the old snapshot back).
//   • continuationPoint — if MA paused mid-job, we show a Continue button.
//   • contextUsage — feeds the token meter; taskType/steps — small status line.
//
// We also refresh worklog/projects, save the chat session, and sometimes show
// book-ingestion choice buttons if the reply looks like a character picker.
//
//   d — parsed JSON from /api/chat or the stream's final "done" event
// ─────────────────────────────────────────────────────────────────────────────
function handleChatResult(d) {
  const reply = d.reply || '(empty response)';
  const msgDiv = addMsg('ma', reply);
  history.push({ role: 'assistant', content: reply });

  // ── Render thinking block (collapsible) above the reply ─────────
  if (d.thinking) {
    const bubble = msgDiv.querySelector('.bubble');
    if (bubble) {
      const thinkBlock = document.createElement('details');
      thinkBlock.className = 'thinking-block';
      thinkBlock.innerHTML =
        '<summary class="thinking-toggle">💭 View MA\'s Thinking</summary>' +
        '<div class="thinking-content">' +
          (typeof renderMarkdown === 'function' ? renderMarkdown(d.thinking) : escHtml(d.thinking)) +
        '</div>';
      bubble.insertBefore(thinkBlock, bubble.firstChild);
    }
  }

  // ── Self-review badge ───────────────────────────────────────────
  if (d.selfReview) {
    const bubble = msgDiv.querySelector('.bubble');
    if (bubble) {
      const badge = document.createElement('div');
      badge.className = 'self-review-badge';
      badge.textContent = '✓ ' + d.selfReview;
      bubble.appendChild(badge);
    }
  }

  // Render clickable file links for created/modified files with Keep/Reject
  if (d.filesChanged && d.filesChanged.length > 0) {
    const container = msgDiv.querySelector('.bubble') || msgDiv;
    const linksDiv = document.createElement('div');
    linksDiv.className = 'file-links';
    const extIcons = { '.js': '\u{1F4DC}', '.ts': '\u{1F4DC}', '.json': '\u{1F4CB}', '.md': '\u{1F4D6}', '.html': '\u{1F310}', '.css': '\u{1F3A8}', '.py': '\u{1F40D}', '.rs': '\u2699', '.txt': '\u{1F4C4}' };
    const snapshots = d.fileSnapshots || {};
    for (const fp of d.filesChanged) {
      const ext = '.' + fp.split('.').pop().toLowerCase();
      const icon = extIcons[ext] || '\u{1F4C4}';
      const name = fp.split('/').pop();

      const row = document.createElement('div');
      row.className = 'file-change-row';

      const a = document.createElement('a');
      a.className = 'file-link';
      a.href = '#';
      a.title = fp;
      a.onclick = function(e) { e.preventDefault(); openFileInEditor(fp); };
      a.innerHTML = '<span class="fl-icon">' + icon + '</span><span class="fl-name">' + escHtml(name) + '</span>';
      row.appendChild(a);

      // Keep / Reject buttons
      const btnWrap = document.createElement('span');
      btnWrap.className = 'file-change-actions';

      const keepBtn = document.createElement('button');
      keepBtn.className = 'fc-btn fc-keep';
      keepBtn.textContent = '✓ Keep';
      keepBtn.onclick = function() {
        btnWrap.innerHTML = '<span class="fc-accepted">Kept</span>';
        // Refresh the tab if open
        const tab = openTabs.find(t => t.path === fp);
        if (tab) {
          fetch('/api/workspace/read?path=' + encodeURIComponent(fp))
            .then(r => r.json())
            .then(d => { if (!d.error) { tab.content = d.content; tab.originalContent = d.content; tab.dirty = false; if (activeTabId === tab.id) renderEditorContent(); } });
        }
      };

      const rejectBtn = document.createElement('button');
      rejectBtn.className = 'fc-btn fc-reject';
      rejectBtn.textContent = '✕ Reject';
      rejectBtn.onclick = function() {
        const prevContent = snapshots[fp];
        if (prevContent !== undefined) {
          // Restore original content
          apiPostJson('/api/workspace/save', { path: fp, content: prevContent }).then(r => r.json()).then(d => {
            if (d.ok) {
              btnWrap.innerHTML = '<span class="fc-rejected">Reverted</span>';
              addSystem('Reverted ' + fp);
              // Update tab if open
              const tab = openTabs.find(t => t.path === fp);
              if (tab) { tab.content = prevContent; tab.originalContent = prevContent; tab.dirty = false; if (activeTabId === tab.id) renderEditorContent(); }
              if (currentInspector === 'workspace') loadWorkspaceTree();
            }
          });
        } else {
          btnWrap.innerHTML = '<span class="fc-rejected">No previous version</span>';
        }
      };

      btnWrap.appendChild(keepBtn);
      btnWrap.appendChild(rejectBtn);
      row.appendChild(btnWrap);
      linksDiv.appendChild(row);
    }
    container.appendChild(linksDiv);
  }

  if (d.taskType) addSystem('Task: ' + d.taskType + ' (' + (d.steps || 0) + ' steps)');
  if (d.contextUsage) updateTokenBar(d.contextUsage);
  if (d.continuationPoint) {
    lastContinuation = d.continuationPoint;
    showContinueButton(d.continuationPoint);
  } else {
    lastContinuation = null;
  }

  // Book ingestion: render character selection UI when MA presents the list
  if (reply.includes('Selection options') || reply.includes('Which would you like')) {
    _renderCharacterSelectionButtons(msgDiv);
  }

  loadWorklog();
  if (currentInspector === 'projects') loadProjects();
  saveSession();
}

// ─────────────────────────────────────────────────────────────────────────────
// _renderCharacterSelectionButtons(msgDiv)
//
// Book-ingestion helper. When MA's message looks like "pick main vs all characters",
// we add three big buttons under the bubble so you do not have to type the magic
// command by hand. Clicking fills the composer and calls send() again.
//
// Think of it like a multiple-choice worksheet — tap an answer instead of writing it.
//
//   msgDiv — the DOM node for MA's message (we attach a bar inside its bubble)
// ─────────────────────────────────────────────────────────────────────────────
function _renderCharacterSelectionButtons(msgDiv) {
  const container = msgDiv.querySelector('.bubble') || msgDiv;
  const bar = document.createElement('div');
  bar.className = 'book-selection-bar';

  const modes = [
    { label: '★ Main Characters Only', value: 'main' },
    { label: '● All Characters', value: 'all' },
    { label: '✎ Select Specific...', value: 'specific' }
  ];

  for (const mode of modes) {
    const btn = document.createElement('button');
    btn.className = 'book-select-btn';
    btn.textContent = mode.label;
    btn.onclick = function () {
      bar.querySelectorAll('.book-select-btn').forEach(b => b.disabled = true);
      if (mode.value === 'specific') {
        // Show text input for character names
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'book-char-input';
        inp.placeholder = 'Character names (comma-separated)...';
        inp.onkeydown = function (e) {
          if (e.key === 'Enter' && inp.value.trim()) {
            const names = inp.value.trim();
            inputEl.value = '[BOOK_SELECTION] mode=specific selected=' + names;
            send();
            inp.disabled = true;
          }
        };
        const go = document.createElement('button');
        go.className = 'book-select-btn';
        go.textContent = 'Extract';
        go.onclick = function () {
          if (inp.value.trim()) {
            inputEl.value = '[BOOK_SELECTION] mode=specific selected=' + inp.value.trim();
            send();
            inp.disabled = true;
            go.disabled = true;
          }
        };
        bar.appendChild(inp);
        bar.appendChild(go);
      } else {
        inputEl.value = '[BOOK_SELECTION] mode=' + mode.value;
        send();
      }
    };
    bar.appendChild(btn);
  }

  container.appendChild(bar);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  // Auto-resize
  setTimeout(() => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
  }, 0);
}

if (window.MA && window.MA.chat) {
  Object.assign(window.MA.chat, {
    send,
    startNewSession,
    toggleSessionDropdown,
    cancelLongRequest,
    dismissLongRequest,
    toggleAutoPilotFromPopup,
    handleKey
  });
}
