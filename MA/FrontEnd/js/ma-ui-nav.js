// ── FrontEnd · Menus, folder picker, terminal, layout ───────────────────────
//
// HOW NAVIGATION WORKS:
// This file is the airport control tower for the chrome around the editor and
// chat — not the runway (file tree) itself. It opens File/Edit menus, runs the
// "pick a folder" dialog, slides the terminal drawer, remembers splitter widths
// in localStorage, and lights up the correct rail button when you switch views.
//
// The actual lists inside the sidebar (projects, blueprints, tree) are built by
// other files; this one connects BUTTONS and KEYBOARD SHORTCUTS to those tools.
//
// WHAT USES THIS:
//   MA-index.html — many onclick="" handlers call these functions by name.
//
// WHAT IT NEEDS FIRST:
//   ma-ui.js, ma-ui-dom.js (escHtml, escAttr), ma-ui-api.js (apiPostJson).
//
// GLOBAL API:
//   toggleMenu, menuNewFile, menuSave, fbBrowse, runTerminalCmd,
//   selectWorkspaceSection, switchMode, splitter helpers, …
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

// ── Menu dropdown system ────────────────────────────────────────────────────────
let _activeMenu = null;

function toggleMenu(name) {
  const dd = document.getElementById('menu-' + name + '-dropdown');
  if (!dd) return;
  if (_activeMenu === name) { closeMenus(); return; }
  closeMenus();
  dd.classList.add('show');
  _activeMenu = name;
}

function closeMenus() {
  document.querySelectorAll('.menu-dropdown').forEach(d => d.classList.remove('show'));
  _activeMenu = null;
}

document.addEventListener('click', function(e) {
  if (!e.target.closest('.menu-item')) closeMenus();
});

// ── File menu actions ─────────────────────────────────────────────────────
function menuNewFile() {
  closeMenus();
  const name = prompt('New file name (relative to workspace):');
  if (!name || !name.trim()) return;
  apiPostJson('/api/workspace/save', { path: name.trim(), content: '' }).then(r => r.json()).then(d => {
    if (!d.ok) { addSystem('Error: ' + (d.error || 'Could not create file')); return; }
    addSystem('Created ' + name.trim());
    if (currentInspector === 'workspace') loadWorkspaceTree();
    openFileInEditor(name.trim());
  }).catch(e => addSystem('Create error: ' + e.message));
}

function menuNewFolder() {
  closeMenus();
  const name = prompt('New folder name (relative to workspace):');
  if (!name || !name.trim()) return;
  apiPostJson('/api/workspace/mkdir', { path: name.trim() }).then(r => r.json()).then(d => {
    if (!d.ok) { addSystem('Error: ' + (d.error || 'Could not create folder')); return; }
    addSystem('Created folder ' + name.trim());
    if (currentInspector === 'workspace') loadWorkspaceTree();
  }).catch(e => addSystem('Create folder error: ' + e.message));
}

async function menuOpenFile() {
  closeMenus();
  // Use File System Access API for native OS file dialog (Chrome/Edge)
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({ multiple: false });
      const file = await handle.getFile();
      const content = await file.text();
      const name = file.name;
      const ext = (name.match(/\.([^.]+)$/) || [])[1] || '';
      const mode = detectEditorMode(ext);
      // Check if already open by handle name
      const existing = openTabs.find(t => t.fileHandle && t.name === name);
      if (existing) { activateTab(existing.id); return; }
      const tab = {
        id: 'tab-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        path: name,
        name: name,
        content: content,
        originalContent: content,
        ext: ext,
        mode: mode,
        viewMode: mode === 'markdown' ? 'preview' : mode === 'html' ? 'preview' : 'source',
        dirty: false,
        fileHandle: handle
      };
      openTabs.push(tab);
      activateTab(tab.id);
    } catch (e) {
      if (e.name !== 'AbortError') addSystem('Open file error: ' + e.message);
    }
    return;
  }
  // Fallback: hidden file input for browsers without FSA
  let inp = document.getElementById('_hidden-file-input');
  if (!inp) {
    inp = document.createElement('input');
    inp.type = 'file';
    inp.id = '_hidden-file-input';
    inp.style.display = 'none';
    document.body.appendChild(inp);
  }
  inp.value = '';
  inp.onchange = function() {
    const file = inp.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function() {
      const name = file.name;
      const ext = (name.match(/\.([^.]+)$/) || [])[1] || '';
      const mode = detectEditorMode(ext);
      const tab = {
        id: 'tab-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        path: name,
        name: name,
        content: reader.result,
        originalContent: reader.result,
        ext: ext,
        mode: mode,
        viewMode: mode === 'markdown' ? 'preview' : mode === 'html' ? 'preview' : 'source',
        dirty: false,
        localFile: true
      };
      openTabs.push(tab);
      activateTab(tab.id);
    };
    reader.readAsText(file);
  };
  inp.click();
}

// ── Folder Browser ────────────────────────────────────────────────────────
let _fbCurrentPath = '';
let _fbModal = null;

function menuOpenFolder() {
  closeMenus();
  _fbModal = document.getElementById('folder-browser-modal');
  if (!_fbModal) return;
  _fbModal.classList.add('show');
  // Load quick-access locations
  _loadQuickAccess();
  // Start by browsing drives/root (empty path) for immediate visual browsing
  document.getElementById('fb-path-input').value = '';
  _fbCurrentPath = '';
  fbBrowse('');
}

async function _loadQuickAccess() {
  const el = document.getElementById('fb-quick-access');
  if (!el) return;
  try {
    const r = await fetch('/api/workspace/quick-paths');
    const d = await r.json();
    const locs = d.locations || [];
    if (!locs.length) { el.innerHTML = ''; return; }
    const icons = { 'Current Workspace': '📂', 'Desktop': '🖥', 'Documents': '📄', 'Downloads': '⬇', 'Home': '🏠' };
    el.innerHTML = locs.map(function(loc) {
      return '<button class="fb-quick-btn" onclick="fbBrowse(\'' + escAttr(loc.path) + '\')" title="' + escHtml(loc.path) + '">' +
        '<span class="fb-quick-icon">' + (icons[loc.name] || '📁') + '</span>' +
        '<span class="fb-quick-label">' + escHtml(loc.name) + '</span>' +
      '</button>';
    }).join('');
  } catch (_) {
    el.innerHTML = '';
  }
}

function closeFolderBrowser() {
  if (_fbModal) _fbModal.classList.remove('show');
}

function fbNavigateTo() {
  const input = document.getElementById('fb-path-input');
  const path = (input ? input.value : '').trim();
  fbBrowse(path);
}

function fbNavigateUp() {
  const pathInput = document.getElementById('fb-path-input');
  const current = (pathInput ? pathInput.value : '').trim();
  if (!current) return;
  // Go up one directory
  const parts = current.replace(/\\/g, '/').replace(/\/+$/, '').split('/');
  parts.pop();
  const parent = parts.join('/') || '/';
  fbBrowse(parent === '/' && current.match(/^[A-Z]:/i) ? '' : parent);
}

// ─────────────────────────────────────────────────────────────────────────────
// fbBrowse(dirPath)
//
// Asks the server "what lives in this folder?" and draws the folder-browser list.
// Folders become buttons that call fbBrowse again (drill down). Files are shown
// but not clickable here — you only pick a folder, then confirm with Open.
//
// Think of a museum map: each room click loads the next room's exhibit list.
// We escape every path with escAttr in onclick so a funny folder name cannot
// break the HTML.
//
//   dirPath — path string from the server (Windows or Unix style)
// ─────────────────────────────────────────────────────────────────────────────
async function fbBrowse(dirPath) {
  const list = document.getElementById('fb-list');
  const pathInput = document.getElementById('fb-path-input');
  const selectedEl = document.getElementById('fb-selected-path');
  if (!list) return;

  list.innerHTML = '<div class="side-empty">Loading...</div>';
  try {
    const r = await apiPostJson('/api/workspace/browse', { path: dirPath });
    const d = await r.json();
    if (d.error) {
      list.innerHTML = '<div class="side-empty" style="color:var(--err)">' + escHtml(d.error) + '</div>';
      return;
    }

    _fbCurrentPath = d.path || '';
    if (pathInput) pathInput.value = _fbCurrentPath;
    if (selectedEl) selectedEl.textContent = _fbCurrentPath ? 'Selected: ' + _fbCurrentPath : '';

    // Render breadcrumb
    _renderFbBreadcrumb(d.path || '');

    // Render list
    const items = d.items || [];
    if (!items.length) {
      list.innerHTML = '<div class="side-empty">Empty directory</div>';
      return;
    }

    let html = '';
    // Parent directory link
    if (d.parent) {
      html += '<button class="fb-item fb-item-dir" onclick="fbBrowse(\'' + escAttr(d.parent) + '\')">' +
        '<span class="fb-icon">⬆</span>' +
        '<span class="fb-name">..</span>' +
      '</button>';
    }

    for (const item of items) {
      if (item.type === 'directory') {
        html += '<button class="fb-item fb-item-dir" onclick="fbBrowse(\'' + escAttr(item.fullPath) + '\')">' +
          '<span class="fb-icon">📁</span>' +
          '<span class="fb-name">' + escHtml(item.name) + '</span>' +
        '</button>';
      } else {
        html += '<div class="fb-item fb-item-file">' +
          '<span class="fb-icon">📄</span>' +
          '<span class="fb-name">' + escHtml(item.name) + '</span>' +
        '</div>';
      }
    }
    list.innerHTML = html;
  } catch (e) {
    list.innerHTML = '<div class="side-empty" style="color:var(--err)">Error: ' + escHtml(e.message) + '</div>';
  }
}

function _renderFbBreadcrumb(fullPath) {
  const bc = document.getElementById('fb-breadcrumb');
  if (!bc || !fullPath) { if (bc) bc.innerHTML = ''; return; }
  const parts = fullPath.replace(/\\/g, '/').split('/').filter(Boolean);
  let html = '';
  let cumPath = '';
  for (let i = 0; i < parts.length; i++) {
    cumPath += (i === 0 && fullPath.match(/^[A-Z]:/i) ? '' : '/') + parts[i];
    if (i === 0 && fullPath.match(/^[A-Z]:/i)) cumPath = parts[i];
    const isLast = i === parts.length - 1;
    if (isLast) {
      html += '<span class="fb-bc-current">' + escHtml(parts[i]) + '</span>';
    } else {
      html += '<button class="fb-bc-link" onclick="fbBrowse(\'' + escAttr(cumPath) + '\')">' + escHtml(parts[i]) + '</button>';
      html += '<span class="fb-bc-sep">›</span>';
    }
  }
  bc.innerHTML = html;
}

// ─────────────────────────────────────────────────────────────────────────────
// fbOpenSelected()
//
// User picked a folder in the browser and clicked Open. We tell the server to
// mount that folder as the workspace root, close the modal, update titles, and
// jump to the workspace tree view.
//
//   (no args — uses _fbCurrentPath set by fbBrowse)
// ─────────────────────────────────────────────────────────────────────────────
async function fbOpenSelected() {
  if (!_fbCurrentPath) return;
  try {
    const r = await apiPostJson('/api/workspace/open-folder', { path: _fbCurrentPath });
    const d = await r.json();
    if (!d.ok) {
      addSystem('Error: ' + (d.error || 'Could not open folder'));
      return;
    }
    closeFolderBrowser();
    addSystem('Opened folder: ' + _fbCurrentPath);
    _updateWorkspaceTitle(d.root);
    selectWorkspaceSection('workspace');
  } catch (e) {
    addSystem('Open folder error: ' + e.message);
  }
}

function _updateWorkspaceTitle(rootPath) {
  if (!rootPath) return;
  const name = rootPath.replace(/\\/g, '/').split('/').pop() || rootPath;
  if (explorerTitleEl) explorerTitleEl.textContent = name.toUpperCase();
  const brandH1 = document.querySelector('.workspace-brand h1');
  if (brandH1) brandH1.textContent = name;
}

function menuSave() {
  closeMenus();
  if (activeTabId) saveEditorTab();
  else addSystem('No file open to save.');
}

function menuSaveAll() {
  closeMenus();
  let saved = 0;
  // Capture current editor content before saving
  const activeTab = openTabs.find(t => t.id === activeTabId);
  if (activeTab) {
    const ta = document.querySelector('.editor-textarea') || document.getElementById('styled-ta');
    if (ta) activeTab.content = ta.value;
  }
  const dirtyTabs = openTabs.filter(t => t.dirty);
  if (!dirtyTabs.length) { addSystem('All files are already saved.'); return; }
  dirtyTabs.forEach(function(tab) {
    apiPostJson('/api/workspace/save', { path: tab.path, content: tab.content }).then(r => r.json()).then(d => {
      if (d.ok) {
        tab.originalContent = tab.content;
        tab.dirty = false;
        saved++;
        if (saved === dirtyTabs.length) {
          renderEditorTabs();
          renderEditorContent();
          addSystem('Saved ' + saved + ' file(s).');
        }
      }
    }).catch(() => {});
  });
}

// ── Terminal panel (slide-out shell runner) ───────────────────────────────────
function toggleTerminalPanel() {
  closeMenus();
  const panel = document.getElementById('terminal-panel');
  if (!panel) return;
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) {
    document.getElementById('terminal-input').focus();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// runTerminalCmd()
//
// Reads the terminal drawer input, sends the command line to /api/terminal/exec,
// and appends stdout/stderr (or an error) to the scrollable log. The server
// enforces timeouts and safety — the browser just displays what came back.
//
// Think of a walkie-talkie: you press talk (Enter), the server runs the command
// in MA's sandbox, then radios the output back as text in the panel.
//
//   (no args — reads #terminal-input, writes to #terminal-output)
// ─────────────────────────────────────────────────────────────────────────────
async function runTerminalCmd() {
  const input = document.getElementById('terminal-input');
  const output = document.getElementById('terminal-output');
  if (!input || !output) return;
  const cmd = input.value.trim();
  if (!cmd) return;
  input.value = '';
  // Show command in output
  const cmdLine = document.createElement('div');
  cmdLine.className = 'term-cmd';
  cmdLine.textContent = '> ' + cmd;
  output.appendChild(cmdLine);
  output.scrollTop = output.scrollHeight;
  try {
    const r = await apiPostJson('/api/terminal/exec', { command: cmd });
    const d = await r.json();
    const result = document.createElement('div');
    if (d.error) {
      result.className = 'term-err';
      result.textContent = d.error;
    } else if (d.timedOut) {
      result.className = 'term-err';
      result.textContent = (d.stdout || '') + (d.stderr ? '\n' + d.stderr : '') + '\n[Command timed out]';
    } else {
      result.className = d.code === 0 ? 'term-out' : 'term-err';
      const text = (d.stdout || '') + (d.stderr ? '\n' + d.stderr : '');
      result.textContent = text || '(no output)';
    }
    output.appendChild(result);
  } catch (e) {
    const errLine = document.createElement('div');
    errLine.className = 'term-err';
    errLine.textContent = 'Connection error: ' + e.message;
    output.appendChild(errLine);
  }
  output.scrollTop = output.scrollHeight;
}

// ── Rail & explorer section ─────────────────────────────────────────────────

function setRailActive(activeId) {
  document.querySelectorAll('.rail-btn').forEach(function(button) {
    button.classList.toggle('active', button.id === activeId);
  });
}

// ── selectWorkspaceSection(name) ────────────────────────────────────────────
// Switches the left explorer pane: updates rail highlight, title, and asks
// ma-ui-editor.js to load the right list (tree, blueprints, session, …).
// ───────────────────────────────────────────────────────────────────────────
function selectWorkspaceSection(name) {
  currentInspector = name;
  setRailActive('rail-' + name);
  if (explorerTitleEl) {
    explorerTitleEl.textContent = inspectorTitles[name] || 'Workspace Files';
  }
  refreshWorkspaceSection();
}

function saveActiveTab() {
  if (activeTabId) return saveEditorTab();
  saveBlueprint();
}

function resetWorkspaceLayout() {
  localStorage.removeItem('ma-workspace-layout-v1');
  location.reload();
}

function syncRailMode() {
  const pill = document.getElementById('rail-mode-pill');
  if (!pill) return;
  pill.textContent = currentMode.toUpperCase();
  if (currentMode === 'chat') {
    pill.style.color = 'var(--ma)';
    pill.style.background = 'rgba(35,134,54,.12)';
    pill.style.borderColor = 'rgba(35,134,54,.25)';
  } else {
    pill.style.color = 'var(--accent)';
    pill.style.background = 'rgba(88,166,255,.12)';
    pill.style.borderColor = 'rgba(88,166,255,.25)';
  }
}

function openConfigPanelTab(tab) {
  openConfig(tab);
}

let currentMode = localStorage.getItem('ma-mode') || 'work';

// ─────────────────────────────────────────────────────────────────────────────
// switchMode(mode)
//
// Chat vs Work mode is not just a skin — the server tracks it too (different
// behaviour on the backend). We POST the choice, then mirror it in localStorage
// and repaint the toggle buttons so refresh keeps your preference.
//
// Think of a light switch: flip 'chat' or 'work'; if the wire is dead (network
// error) we leave the switch where it was so you are not lied to.
//
//   mode — 'chat' or 'work' only; anything else is ignored
// ─────────────────────────────────────────────────────────────────────────────
async function switchMode(mode) {
  if (mode !== 'chat' && mode !== 'work') return;
  try {
    const r = await apiPostJson('/api/mode', { mode });
    const d = await r.json();
    if (d.ok) {
      currentMode = d.mode;
      localStorage.setItem('ma-mode', currentMode);
      updateModeUI();
    }
  } catch (_) {
    // Network or server error — keep previous currentMode; UI unchanged.
  }
}

function updateModeUI() {
  const btns = document.querySelectorAll('.mode-btn');
  btns.forEach(b => {
    b.classList.remove('active', 'chat-active');
    if (b.dataset.mode === currentMode) {
      b.classList.add('active');
      if (currentMode === 'chat') b.classList.add('chat-active');
    }
  });
  syncRailMode();
}

// ─────────────────────────────────────────────────────────────────────────────
// syncMode()
//
// On page load we ask the server "which mode are we really in?" and fix the UI.
// That way if you changed mode in another tab or the server defaulted differently,
// the buttons match reality.
// ─────────────────────────────────────────────────────────────────────────────
async function syncMode() {
  try {
    const r = await fetch('/api/mode');
    const d = await r.json();
    currentMode = d.mode || 'work';
    localStorage.setItem('ma-mode', currentMode);
    updateModeUI();
  } catch { /* ignore — will default to work */ }
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────
document.addEventListener('keydown', function(e) {
  // Ctrl+S — Save active tab
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    if (activeTabId && typeof saveEditorTab === 'function') saveEditorTab();
  }
  // Ctrl+N — New file
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
    e.preventDefault();
    menuNewFile();
  }
  // Ctrl+O — Open file
  if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
    e.preventDefault();
    menuOpenFile();
  }
  // Ctrl+W — Close active tab
  if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
    if (activeTabId) {
      e.preventDefault();
      closeTab(activeTabId);
    }
  }
  // Ctrl+` — Toggle terminal
  if ((e.ctrlKey || e.metaKey) && e.key === '`') {
    e.preventDefault();
    toggleTerminalPanel();
  }
  // Ctrl+Shift+E — Focus explorer
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'E') {
    e.preventDefault();
    selectWorkspaceSection('workspace');
  }
  // Escape — Close menus/modals
  if (e.key === 'Escape') {
    closeMenus();
    const fbModal = document.getElementById('folder-browser-modal');
    if (fbModal && fbModal.classList.contains('show')) closeFolderBrowser();
    const ctxMenu = document.getElementById('tree-context-menu');
    if (ctxMenu) ctxMenu.style.display = 'none';
  }
});

// ── Pane Splitter Drag ────────────────────────────────────────────────────
(function initSplitters() {
  const leftSplitter = document.getElementById('splitter-left');
  const rightSplitter = document.getElementById('splitter-right');
  const explorer = document.getElementById('explorer-panel');
  const chatPanel = document.getElementById('chat-panel');

  function initDrag(splitter, resizeTarget, direction) {
    if (!splitter || !resizeTarget) return;
    let startX, startW;
    function onMouseDown(e) {
      e.preventDefault();
      startX = e.clientX;
      startW = resizeTarget.getBoundingClientRect().width;
      splitter.classList.add('dragging');
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    }
    function onMouseMove(e) {
      const delta = (direction === 'left') ? (e.clientX - startX) : (startX - e.clientX);
      const newW = Math.max(160, Math.min(600, startW + delta));
      resizeTarget.style.width = newW + 'px';
    }
    function onMouseUp() {
      splitter.classList.remove('dragging');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      // Persist layout
      const layout = JSON.parse(localStorage.getItem('ma-workspace-layout-v1') || '{}');
      layout[direction === 'left' ? 'explorerWidth' : 'chatWidth'] = resizeTarget.style.width;
      localStorage.setItem('ma-workspace-layout-v1', JSON.stringify(layout));
    }
    splitter.addEventListener('mousedown', onMouseDown);
  }

  initDrag(leftSplitter, explorer, 'left');
  initDrag(rightSplitter, chatPanel, 'right');

  // Restore saved layout
  try {
    const saved = JSON.parse(localStorage.getItem('ma-workspace-layout-v1') || '{}');
    if (saved.explorerWidth && explorer) explorer.style.width = saved.explorerWidth;
    if (saved.chatWidth && chatPanel) chatPanel.style.width = saved.chatWidth;
    if (saved.explorerCollapsed) {
      if (explorer) explorer.classList.add('collapsed');
      if (leftSplitter) leftSplitter.classList.add('collapsed');
    }
  } catch (_) {}
})();

// ── Explorer panel collapse/expand via MA logo ─────────────────────────────
function toggleExplorerPanel() {
  const explorer = document.getElementById('explorer-panel');
  const splitter = document.getElementById('splitter-left');
  if (!explorer) return;
  const collapsed = explorer.classList.toggle('collapsed');
  if (splitter) splitter.classList.toggle('collapsed', collapsed);
  const layout = JSON.parse(localStorage.getItem('ma-workspace-layout-v1') || '{}');
  layout.explorerCollapsed = collapsed;
  localStorage.setItem('ma-workspace-layout-v1', JSON.stringify(layout));
}

if (window.MA && window.MA.nav) {
  Object.assign(window.MA.nav, {
    toggleMenu,
    menuNewFile,
    menuNewFolder,
    menuOpenFile,
    menuOpenFolder,
    menuSave,
    menuSaveAll,
    closeFolderBrowser,
    fbNavigateTo,
    fbNavigateUp,
    fbOpenSelected,
    toggleTerminalPanel,
    selectWorkspaceSection,
    resetWorkspaceLayout,
    switchMode,
    toggleExplorerPanel,
    runTerminalCmd,
    fbBrowse
  });
}
