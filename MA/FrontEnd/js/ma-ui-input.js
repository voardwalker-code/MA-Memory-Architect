// ── FrontEnd · Message box superpowers ──────────────────────────────────────
//
// HOW THE COMPOSER WORKS:
// The chat input is not just a box — it suggests slash commands (like /help),
// shows paper-clip chips for attached files, updates the token meter when MA
// replies, and can offer a "Continue" button when MA pauses mid-thought.
// Drag-and-drop drops files into pendingFiles (on ma-ui.js) for the next send.
// You can even drag a file from the workspace tree to attach it.
//
// Think of it as the cockpit dashboard around the steering wheel: same wheel
// (typing a message), but extra gauges and levers wired around it.
//
// WHAT USES THIS:
//   MA-index.html — listens to typing on #msg-input; wraps handleKey.
//
// LOAD ORDER:
//   After ma-ui-chat.js so we can wrap the original handleKey with our version.
//
// WHAT IT NEEDS FIRST:
//   ma-ui.js, ma-ui-chat.js, ma-ui-dom.js, ma-ui-api.js (for /api/slash POST).
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const cmdPopup = document.getElementById('cmd-popup');
const dropOverlay = document.getElementById('drop-overlay');
const fileChips = document.getElementById('file-chips');

let slashCommands = [];
let cmdActiveIdx = -1;
let dragCounter = 0;

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml']);
const MAX_FILE_SIZE = 524288; // 512KB text
const MAX_IMAGE_SIZE = 5242880; // 5MB images

fetch('/api/commands').then(r => r.json()).then(cmds => { slashCommands = cmds; }).catch(() => {});

// ── Slash command popup ─────────────────────────────────────────────────────

function handleInput() {
  if (!cmdPopup || !inputEl) return;
  const val = inputEl.value;
  if (val.startsWith('/')) {
    const filter = val.slice(1).toLowerCase();
    const matches = slashCommands.filter(c =>
      c.cmd.slice(1).toLowerCase().startsWith(filter) || c.usage.toLowerCase().includes(filter));
    if (matches.length > 0) {
      cmdPopup.innerHTML = matches.map((c, i) =>
        `<div class="cmd-item${i === cmdActiveIdx ? ' active' : ''}" data-idx="${i}" onclick="pickCmd('${c.usage}')">`
        + `<span class="cmd-name">${c.usage}</span><span class="cmd-desc">${c.desc}</span></div>`
      ).join('');
      cmdPopup.classList.add('show');
      return;
    }
  }
  cmdPopup.classList.remove('show');
  cmdActiveIdx = -1;
}

function pickCmd(usage) {
  inputEl.value = usage;
  cmdPopup.classList.remove('show');
  cmdActiveIdx = -1;
  inputEl.focus();
}

// ─────────────────────────────────────────────────────────────────────────────
// _highlightCmd(items)
//
// Keeps the highlighted row in sync when the user moves with arrow keys inside
// the slash popup (see handleKey wrapper at the bottom of this file).
// ─────────────────────────────────────────────────────────────────────────────
function _highlightCmd(items) {
  items.forEach((el, i) => el.classList.toggle('active', i === cmdActiveIdx));
  if (items[cmdActiveIdx]) items[cmdActiveIdx].scrollIntoView({ block: 'nearest' });
}

// ─────────────────────────────────────────────────────────────────────────────
// execSlash(command)
//
// Runs a /command through the server without going through the full chat LLM
// path — quick utilities registered in the backend.
// ─────────────────────────────────────────────────────────────────────────────
async function execSlash(command) {
  cmdPopup.classList.remove('show');
  addMsg('user', command);
  inputEl.value = '';
  inputEl.style.height = 'auto';
  try {
    const r = await apiPostJson('/api/slash', { command });
    const d = await r.json();
    addMsg(d.type || 'system', d.text || '(no output)');
  } catch (e) {
    addSystem('Command error: ' + e.message);
  }
}

// ── Token usage bar (filled from handleChatResult) ─────────────────────────

function updateTokenBar(usage) {
  const fill = document.querySelector('#token-bar .fill');
  const info = document.getElementById('token-info');
  if (!usage || !usage.contextBudget || !fill || !info) return;
  const pct = Math.min(100, Math.round((usage.contextTokens / usage.contextBudget) * 100));
  fill.style.width = pct + '%';
  fill.className = 'fill' + (pct >= 85 ? ' crit' : pct >= 65 ? ' warn' : '');
  info.textContent =
    `Context: ~${usage.contextTokens} / ${usage.contextBudget} tokens (${pct}%) · Response reserve: ${usage.responseReserve}`;
}

// ── Long-output continuation ────────────────────────────────────────────────

function showContinueButton(point) {
  const bar = document.createElement('div');
  bar.className = 'continue-bar';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Continue from: ' + String(point || '').slice(0, 60);
  btn.onclick = function() { sendContinue(); };
  bar.appendChild(btn);
  chatEl.appendChild(bar);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function sendContinue() {
  if (!lastContinuation) return;
  inputEl.value = 'Continue from where you left off: ' + lastContinuation;
  lastContinuation = null;
  chatEl.querySelectorAll('.continue-bar').forEach(el => el.remove());
  send();
}

// ── Drag & drop: OS files + explorer tree paths ───────────────────────────

if (dropOverlay) {
  document.addEventListener('dragenter', function(e) {
    e.preventDefault();
    dragCounter++;
    if (e.dataTransfer.types.includes('Files')) dropOverlay.classList.add('show');
  });

  document.addEventListener('dragleave', function(e) {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      dropOverlay.classList.remove('show');
    }
  });

  document.addEventListener('dragover', function(e) { e.preventDefault(); });
}

// ─────────────────────────────────────────────────────────────────────────────
// document drop — workspace tree paths use custom MIME types; OS drops use Files.
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener('drop', function(e) {
  e.preventDefault();
  dragCounter = 0;
  if (dropOverlay) dropOverlay.classList.remove('show');

  const treePath = e.dataTransfer.getData('application/x-ma-tree-path');
  if (treePath) {
    const treeType = e.dataTransfer.getData('application/x-ma-tree-type') || 'file';
    _addTreeFileReference(treePath, treeType);
    return;
  }

  if (!e.dataTransfer.files.length) return;

  for (const file of e.dataTransfer.files) {
    const isImage = IMAGE_TYPES.has(file.type);
    const limit = isImage ? MAX_IMAGE_SIZE : MAX_FILE_SIZE;
    const limitLabel = isImage ? '5MB' : '512KB';
    if (file.size > limit) {
      addSystem('Skipped "' + file.name + '" — too large (max ' + limitLabel + ')');
      continue;
    }
    if (pendingFiles.length >= 5) {
      addSystem('Max 5 files at a time');
      break;
    }
    const reader = new FileReader();
    if (isImage) {
      reader.onload = function() {
        pendingFiles.push({ name: file.name, content: reader.result, type: 'image', mime: file.type });
        renderFileChips();
      };
      reader.readAsDataURL(file);
    } else {
      reader.onload = function() {
        pendingFiles.push({ name: file.name, content: reader.result, type: 'text' });
        renderFileChips();
      };
      reader.readAsText(file);
    }
  }
});

function renderFileChips() {
  if (!fileChips) return;
  fileChips.innerHTML = pendingFiles.map(function(f, i) {
    const refClass = f.workspaceRef ? ' workspace-ref' : '';
    const thumb = f.type === 'image' ? '<img src="' + f.content + '" alt="' + escHtml(f.name) + '">' : '';
    const icon = f.type === 'image' ? '' : '📎 ';
    return '<span class="file-chip' + refClass + '">' + thumb + icon + escHtml(f.name)
      + '<button onclick="MA.input.removeFile(' + i + ')" title="Remove">x</button></span>';
  }).join('');
}

function removeFile(idx) {
  pendingFiles.splice(idx, 1);
  renderFileChips();
}

// ─────────────────────────────────────────────────────────────────────────────
// _addTreeFileReference(path, type)
//
// Drag a file row from the explorer onto the window; we fetch contents so the
// next message sends a normal attachment the backend already understands.
// ─────────────────────────────────────────────────────────────────────────────
async function _addTreeFileReference(filePath, type) {
  if (type === 'directory') {
    addSystem('Folders cannot be attached; pick a file.');
    return;
  }
  if (pendingFiles.length >= 5) {
    addSystem('Max 5 files at a time');
    return;
  }
  try {
    const r = await fetch('/api/workspace/read?path=' + encodeURIComponent(filePath));
    const d = await r.json();
    if (d.error) {
      addSystem(d.error);
      return;
    }
    pendingFiles.push({
      name: filePath,
      content: d.content,
      type: 'text',
      workspaceRef: true
    });
    renderFileChips();
  } catch (err) {
    addSystem('Could not read file: ' + err.message);
  }
}

// ── handleKey wrapper (slash popup, /command on Enter) ──────────────────────
// ma-ui-chat.js defines the base handleKey first; we chain after it loads.
if (typeof handleKey === 'function' && cmdPopup) {
  const _origHandleKey = handleKey;
  handleKey = function(e) {
    if (cmdPopup.classList.contains('show')) {
      const items = cmdPopup.querySelectorAll('.cmd-item');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        cmdActiveIdx = Math.min(cmdActiveIdx + 1, items.length - 1);
        _highlightCmd(items);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        cmdActiveIdx = Math.max(cmdActiveIdx - 1, 0);
        _highlightCmd(items);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && cmdActiveIdx >= 0 && !e.shiftKey)) {
        e.preventDefault();
        if (cmdActiveIdx >= 0 && items[cmdActiveIdx]) {
          inputEl.value = items[cmdActiveIdx].querySelector('.cmd-name').textContent;
          cmdPopup.classList.remove('show');
          cmdActiveIdx = -1;
        }
        return;
      }
      if (e.key === 'Escape') {
        cmdPopup.classList.remove('show');
        cmdActiveIdx = -1;
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && inputEl.value.trim().startsWith('/')) {
      e.preventDefault();
      execSlash(inputEl.value.trim());
      return;
    }
    _origHandleKey(e);
  };
}

if (window.MA && window.MA.input) {
  window.MA.input.handleInput = handleInput;
  window.MA.input.removeFile = removeFile;
  window.MA.input.pickCmd = pickCmd;
}
