// ── FrontEnd · Memory ingest (load folders into MA's memory) ─────────────────
//
// HOW INGEST WORKS:
// This panel is separate from the LLM settings. You pick a folder on disk; MA
// reads files and builds searchable "memory" chunks. While it runs, the server
// streams progress events — like a copy bar when you move many files — and you
// can hit Stop to cancel.
//
// Think of it like moving boxes into a library: you see each shelf fill, and
// you can abort if you grabbed the wrong stack.
//
// WHAT USES THIS:
//   MA-index.html — Ingest rail, folder path form, progress overlay.
//
// LOAD ORDER:
//   After ma-ui-config-settings.js (same family of overlays, but different job).
//
// WHAT IT NEEDS FIRST:
//   ma-ui-dom.js (escHtml), ma-ui-api.js (apiPostJson for the POST + stream).
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

let _ingestAbort = null;

function toggleIngestPanel() {
  const panel = document.getElementById('ingest-panel');
  if (!panel) return;
  panel.classList.toggle('show');
  if (panel.classList.contains('show')) loadArchivesList();
}

async function loadArchivesList() {
  const el = document.getElementById('ingest-archives-list');
  if (!el) return;
  try {
    const r = await fetch('/api/memory/archives');
    const archives = await r.json();
    const keys = Object.keys(archives);
    if (!keys.length) { el.textContent = 'No archives yet.'; return; }
    el.innerHTML = '';
    for (const name of keys) {
      const a = archives[name];
      const row = document.createElement('div');
      row.className = 'archive-row';
      row.innerHTML = '<strong>' + escHtml(name) + '</strong> — ' +
        a.fileCount + ' files, ' + a.chunkCount + ' chunks' +
        '<br><span style="color:var(--dim);font-size:11px">' + (a.ingestedAt || '').slice(0, 16) + '</span>';
      el.appendChild(row);
    }
  } catch (_) { el.textContent = 'Could not load archives.'; }
}

function _openIngestProgress(label) {
  const overlay = document.getElementById('ingest-progress-overlay');
  overlay.classList.add('show');
  document.getElementById('ingest-prog-label').textContent = label;
  document.getElementById('ingest-prog-pct').textContent = '';
  const fill = document.getElementById('ingest-prog-fill');
  fill.style.width = '0%';
  fill.className = 'ingest-prog-fill';
  document.getElementById('ingest-prog-detail').textContent = '';
  document.getElementById('ingest-prog-log').innerHTML = '';
  const errEl = document.getElementById('ingest-prog-error');
  errEl.textContent = '';
  errEl.classList.add('hidden');
  document.getElementById('ingest-kill-btn').classList.remove('hidden');
  document.getElementById('ingest-close-btn').classList.add('hidden');
  // hide the ingest setup panel behind the progress overlay
  document.getElementById('ingest-panel').classList.remove('show');
}

function _updateIngestProgress(info) {
  const pct = info.total > 0 ? Math.round((info.processed / info.total) * 100) : 0;
  document.getElementById('ingest-prog-fill').style.width = pct + '%';
  document.getElementById('ingest-prog-pct').textContent = pct + '%';
  document.getElementById('ingest-prog-detail').textContent =
    info.phase === 'done'
      ? 'Done — ' + info.total + ' files, ' + info.chunks + ' chunks'
      : info.file ? ('Ingesting: ' + info.file + ' (' + info.processed + '/' + info.total + ')') : '';
  if (info.file) {
    const log = document.getElementById('ingest-prog-log');
    const line = document.createElement('div');
    line.textContent = info.file;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
  }
}

function _finishIngestProgress(result) {
  document.getElementById('ingest-prog-fill').style.width = '100%';
  document.getElementById('ingest-prog-label').textContent = 'Complete';
  document.getElementById('ingest-prog-pct').textContent = '100%';
  document.getElementById('ingest-prog-detail').textContent =
    result.filesProcessed + ' files → ' + result.chunksStored + ' chunks in archive "' + (result.archive || '') + '"';
  document.getElementById('ingest-kill-btn').classList.add('hidden');
  document.getElementById('ingest-close-btn').classList.remove('hidden');
  loadArchivesList();
}

function _showIngestError(msg) {
  const errEl = document.getElementById('ingest-prog-error');
  errEl.textContent = msg;
  errEl.classList.remove('hidden');
  document.getElementById('ingest-prog-fill').classList.add('error');
  document.getElementById('ingest-prog-label').textContent = 'Error';
  document.getElementById('ingest-kill-btn').classList.add('hidden');
  document.getElementById('ingest-close-btn').classList.remove('hidden');
}

function _showIngestStopped() {
  document.getElementById('ingest-prog-fill').classList.add('stopped');
  document.getElementById('ingest-prog-label').textContent = 'Stopped';
  document.getElementById('ingest-kill-btn').classList.add('hidden');
  document.getElementById('ingest-close-btn').classList.remove('hidden');
}

function closeIngestProgress() {
  document.getElementById('ingest-progress-overlay').classList.remove('show');
  _ingestAbort = null;
  document.getElementById('ingest-folder-btn').disabled = false;
}

function killIngest() {
  if (_ingestAbort) {
    _ingestAbort.abort();
    _ingestAbort = null;
  }
}

async function _sseIngest(url, body, label) {
  _openIngestProgress(label);
  const btn2 = document.getElementById('ingest-folder-btn');
  if (btn2) btn2.disabled = true;
  const controller = new AbortController();
  _ingestAbort = controller;
  try {
    const r = await apiPostJson(url, body, { signal: controller.signal });
    if (!r.ok) {
      let errMsg = 'Server returned ' + r.status;
      try { const errBody = await r.json(); errMsg = errBody.error || errMsg; } catch (_) {}
      _showIngestError(errMsg);
      if (btn2) btn2.disabled = false;
      return;
    }
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let eventType = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('event: ')) { eventType = line.slice(7).trim(); }
        else if (line.startsWith('data: ') && eventType) {
          try {
            const data = JSON.parse(line.slice(6));
            if (eventType === 'progress') _updateIngestProgress(data);
            else if (eventType === 'done') _finishIngestProgress(data);
            else if (eventType === 'error') _showIngestError(data.error || 'Unknown error');
          } catch (_) {}
          eventType = null;
        } else if (line === '') { eventType = null; }
      }
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      _showIngestStopped();
    } else {
      _showIngestError(e.message);
    }
  }
  _ingestAbort = null;
  if (btn2) btn2.disabled = false;
}

function ingestFolder() {
  const folderPath = document.getElementById('ingest-folder-path').value.trim();
  if (!folderPath) { alert('Enter a folder path.'); return; }
  const archive = document.getElementById('ingest-archive-name').value.trim() || undefined;
  _sseIngest('/api/memory/ingest-folder', { folderPath, archive }, 'Ingesting folder...');
}

if (window.MA && window.MA.ingest) {
  Object.assign(window.MA.ingest, {
    toggleIngestPanel,
    ingestFolder,
    killIngest,
    closeIngestProgress
  });
}
