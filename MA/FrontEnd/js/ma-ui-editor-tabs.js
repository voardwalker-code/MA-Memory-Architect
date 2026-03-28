// ── FrontEnd · Editor tabs & main writing area ─────────────────────────────
//
// HOW TABS WORK:
// Each open file is one "tab" object in openTabs[]. We draw the row of tab
// buttons, load file text from the server (or blueprints), and swap the big
// central pane between welcome screen, plain textarea, or fancy styled view.
// Saving knows the difference between workspace files, blueprints, and local
// files picked from your computer.
//
// Think of a ring-binder: each tab is a sheet; this file adds/removes sheets
// and figures out which one you are looking at.
//
// WHAT IT NEEDS FIRST:
//   ma-ui-editor.js, ma-ui.js, ma-ui-dom.js, ma-ui-api.js, ma-ui-chat.js (addSystem).
//
// GLOBAL API:
//   openFileInEditor, activateTab, saveEditorTab, renderEditorTabs, renderEditorContent, …
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

// ── Tab list: open, close, switch, dirty dots ─────────────────────────────────
async function openFileInEditor(filePath) {
  // Reuse existing tab if already open
  const existing = openTabs.find(t => t.path === filePath);
  if (existing) { activateTab(existing.id); return; }

  try {
    const r = await fetch('/api/workspace/read?path=' + encodeURIComponent(filePath));
    const d = await r.json();
    if (d.error) { addSystem('Error: ' + d.error); return; }

    const name = filePath.split('/').pop();
    const ext = (name.match(/\.([^.]+)$/) || [])[1] || '';
    const mode = detectEditorMode(ext);
    const tab = {
      id: 'tab-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      path: filePath,
      name: name,
      content: d.content,
      originalContent: d.content,
      ext: ext,
      mode: mode,
      viewMode: mode === 'markdown' ? 'preview' : mode === 'html' ? 'preview' : 'source',
      dirty: false
    };
    openTabs.push(tab);
    activateTab(tab.id);
  } catch (e) {
    addSystem('Could not open file: ' + e.message);
  }
}

function detectEditorMode(ext) {
  const e = ext.toLowerCase();
  if (e === 'md' || e === 'markdown') return 'markdown';
  if (e === 'html' || e === 'htm') return 'html';
  return 'code';
}

function renderEditorTabs() {
  if (!editorTabs) return;
  editorTabs.innerHTML = openTabs.map(function(tab) {
    const active = tab.id === activeTabId ? ' active' : '';
    const dirtyDot = tab.dirty ? ' •' : '';
    return '<button class="editor-tab' + active + '" data-tab="' + tab.id + '" onclick="activateTab(\'' + tab.id + '\')">' +
      '<span class="name">' + escHtml(tab.name) + dirtyDot + '</span>' +
      '<span class="close" onclick="event.stopPropagation();closeTab(\'' + tab.id + '\')" title="Close">&times;</span>' +
    '</button>';
  }).join('');
}

function activateTab(tabId) {
  activeTabId = tabId;
  const tab = openTabs.find(t => t.id === tabId);
  _activeFilePath = tab ? tab.path : null;
  renderEditorTabs();
  renderEditorContent();
  _updateBreadcrumb(tab);
  _highlightActiveFileInTree();
  _updateStatusBar();
}

function _updateBreadcrumb(tab) {
  const bc = document.getElementById('editor-breadcrumb');
  if (!bc) return;
  if (!tab) { bc.innerHTML = ''; return; }
  const parts = tab.path.split('/');
  let html = '';
  let cumPath = '';
  for (let i = 0; i < parts.length; i++) {
    cumPath += (i > 0 ? '/' : '') + parts[i];
    const isLast = i === parts.length - 1;
    html += '<span class="bc-item' + (isLast ? ' bc-current' : '') + '">' + escHtml(parts[i]) + '</span>';
    if (!isLast) html += '<span class="bc-sep">›</span>';
  }
  bc.innerHTML = html;
}

function _highlightActiveFileInTree() {
  document.querySelectorAll('.tree-file.active').forEach(el => el.classList.remove('active'));
  if (_activeFilePath) {
    const node = document.querySelector('.tree-file[data-path="' + _activeFilePath.replace(/"/g, '\\"') + '"]');
    if (node) node.classList.add('active');
  }
}

function closeTab(tabId) {
  const idx = openTabs.findIndex(t => t.id === tabId);
  if (idx === -1) return;
  const tab = openTabs[idx];
  if (tab.dirty && !confirm('Discard unsaved changes to ' + tab.name + '?')) return;
  openTabs.splice(idx, 1);
  if (activeTabId === tabId) {
    activeTabId = openTabs.length ? openTabs[Math.min(idx, openTabs.length - 1)].id : null;
  }
  renderEditorTabs();
  renderEditorContent();
}

function renderEditorContent() {
  if (!editorContent) return;
  const tab = openTabs.find(t => t.id === activeTabId);
  if (!tab) {
    editorContent.innerHTML =
      '<div id="editor-empty">' +
        '<div class="welcome-screen">' +
          '<div class="welcome-logo">MA</div>' +
          '<h2>Memory Architect</h2>' +
          '<div class="welcome-subtitle">NekoCore OS — Cognitive WebOS</div>' +
          '<div class="welcome-actions">' +
            '<button onclick="menuNewFile()"><span>📄</span> New File</button>' +
            '<button onclick="menuOpenFile()"><span>📂</span> Open File</button>' +
            '<button onclick="menuOpenFolder()"><span>📁</span> Open Folder</button>' +
          '</div>' +
          '<div class="welcome-shortcuts">' +
            '<div class="shortcut"><kbd>Ctrl+S</kbd> Save</div>' +
            '<div class="shortcut"><kbd>Ctrl+N</kbd> New File</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    return;
  }

  const toolbar = buildEditorToolbar(tab);
  let body = '';

  if (tab.mode === 'markdown') {
    if (tab.viewMode === 'preview') {
      body = '<div class="preview-surface"><div class="md-preview">' + renderMarkdown(tab.content) + '</div></div>';
    } else {
      body = '<div class="editor-surface"><textarea class="editor-textarea" oninput="onEditorInput(this)" spellcheck="false">' + escHtml(tab.content) + '</textarea></div>';
    }
  } else if (tab.mode === 'html') {
    if (tab.viewMode === 'preview') {
      body = '<div class="editor-surface"><iframe class="html-preview-frame" sandbox="allow-scripts allow-same-origin"></iframe></div>';
    } else {
      body = '<div class="editor-surface"><textarea class="editor-textarea" oninput="onEditorInput(this)" spellcheck="false">' + escHtml(tab.content) + '</textarea></div>';
    }
  } else {
    // Code mode: styled editor (edit) or highlighted read-only view
    if (tab.viewMode === 'source') {
      body = _buildStyledEditor(tab.content, tab.ext, tab.id);
    } else {
      body = '<div class="editor-code-view">' + renderCodeView(tab.content, tab.ext, tab.id) + '</div>';
    }
  }

  editorContent.innerHTML =
    '<div class="editor-pane active">' +
      '<div class="editor-pane-header">' + toolbar + '</div>' +
      '<div class="editor-pane-body" oncontextmenu="_editorCtxMenu(event)">' + body + '</div>' +
    '</div>';

  // Write HTML into iframe after DOM is ready
  if (tab.mode === 'html' && tab.viewMode === 'preview') {
    const iframe = editorContent.querySelector('.html-preview-frame');
    if (iframe) {
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      doc.open();
      doc.write(tab.content);
      doc.close();
    }
  }

  // Sync styled editor overlay after DOM insert
  if (tab.mode === 'code' && tab.viewMode === 'source') {
    _initStyledEditor();
  }

  // Hook status bar updates for plain textareas (markdown/HTML source)
  var plainTa = editorContent.querySelector('.editor-textarea');
  if (plainTa) {
    plainTa.addEventListener('keyup', _updateStatusBar);
    plainTa.addEventListener('click', _updateStatusBar);
  }
}

function buildEditorToolbar(tab) {
  const saveClass = tab.dirty ? 'save-indicator dirty' : 'save-indicator saved';
  const saveText = tab.dirty ? 'Unsaved' : 'Saved';

  let viewButtons = '';
  if (tab.mode === 'markdown') {
    viewButtons =
      '<div class="view-switch">' +
        '<button class="editor-mode-btn' + (tab.viewMode === 'preview' ? ' active' : '') + '" onclick="switchViewMode(\'preview\')">Preview</button>' +
        '<button class="editor-mode-btn' + (tab.viewMode === 'source' ? ' active' : '') + '" onclick="switchViewMode(\'source\')">Raw</button>' +
      '</div>';
  } else if (tab.mode === 'html') {
    viewButtons =
      '<div class="view-switch">' +
        '<button class="editor-mode-btn' + (tab.viewMode === 'preview' ? ' active' : '') + '" onclick="switchViewMode(\'preview\')">Preview</button>' +
        '<button class="editor-mode-btn' + (tab.viewMode === 'source' ? ' active' : '') + '" onclick="switchViewMode(\'source\')">Source</button>' +
      '</div>';
  } else {
    viewButtons =
      '<div class="view-switch">' +
        '<button class="editor-mode-btn' + (tab.viewMode === 'highlight' ? ' active' : '') + '" onclick="switchViewMode(\'highlight\')">Highlighted</button>' +
        '<button class="editor-mode-btn' + (tab.viewMode === 'source' ? ' active' : '') + '" onclick="switchViewMode(\'source\')">Edit</button>' +
      '</div>';
  }

  return '<div class="editor-toolbar">' +
    '<div class="meta-wrap">' +
      '<span class="editor-pane-title">' + escHtml(tab.name) + '</span>' +
      '<span class="editor-pane-meta">' + escHtml(tab.path) + ' <span class="' + saveClass + '">' + saveText + '</span></span>' +
    '</div>' +
    '<div class="actions">' +
      viewButtons +
      '<button class="editor-action-btn primary" onclick="saveEditorTab()" title="Save file">Save</button>' +
    '</div>' +
  '</div>';
}

function switchViewMode(mode) {
  const tab = openTabs.find(t => t.id === activeTabId);
  if (!tab) return;
  // On switching away from source, capture textarea content
  if (tab.viewMode === 'source') {
    const ta = editorContent.querySelector('.editor-textarea') || document.getElementById('styled-ta');
    if (ta) tab.content = ta.value;
  }
  tab.viewMode = mode;
  renderEditorContent();
}

function onEditorInput(textarea) {
  const tab = openTabs.find(t => t.id === activeTabId);
  if (!tab) return;
  tab.content = textarea.value;
  tab.dirty = tab.content !== tab.originalContent;
  renderEditorTabs();
  // Update save indicator inline
  const indicator = editorContent.querySelector('.save-indicator');
  if (indicator) {
    indicator.className = tab.dirty ? 'save-indicator dirty' : 'save-indicator saved';
    indicator.textContent = tab.dirty ? 'Unsaved' : 'Saved';
  }
}

async function saveEditorTab() {
  const tab = openTabs.find(t => t.id === activeTabId);
  if (!tab) return;
  // Capture textarea content if in source mode
  const ta = editorContent.querySelector('.editor-textarea') || document.getElementById('styled-ta');
  if (ta) tab.content = ta.value;

  try {
    // Blueprint tab — save via blueprint API
    if (tab.isBlueprint) {
      const r = await apiPostJson('/api/blueprints/file', { path: tab.blueprintPath, content: tab.content });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || 'Save failed');
      tab.originalContent = tab.content;
      tab.dirty = false;
      renderEditorTabs();
      renderEditorContent();
      addSystem('Saved blueprint: ' + tab.blueprintPath);
      return;
    }
    // File opened via File System Access API — save via handle
    if (tab.fileHandle) {
      const writable = await tab.fileHandle.createWritable();
      await writable.write(tab.content);
      await writable.close();
      tab.originalContent = tab.content;
      tab.dirty = false;
      renderEditorTabs();
      renderEditorContent();
      addSystem('Saved ' + tab.name);
      return;
    }
    // Local file opened via fallback input (no handle) — use Save As
    if (tab.localFile) {
      if (window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({
          suggestedName: tab.name
        });
        const writable = await handle.createWritable();
        await writable.write(tab.content);
        await writable.close();
        tab.fileHandle = handle;
        delete tab.localFile;
        tab.originalContent = tab.content;
        tab.dirty = false;
        renderEditorTabs();
        renderEditorContent();
        addSystem('Saved ' + tab.name);
      } else {
        addSystem('Cannot save local files in this browser. Copy content manually.');
      }
      return;
    }
    // Standard workspace file — save via backend API
    const r = await apiPostJson('/api/workspace/save', { path: tab.path, content: tab.content });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Save failed');
    tab.originalContent = tab.content;
    tab.dirty = false;
    renderEditorTabs();
    renderEditorContent();
    addSystem('Saved ' + tab.name);
  } catch (e) {
    if (e.name !== 'AbortError') addSystem('Save error: ' + e.message);
  }
}
