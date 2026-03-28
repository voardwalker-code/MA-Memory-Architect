// ── FrontEnd · Blueprints (task recipe files) ─────────────────────────────────
//
// HOW BLUEPRINTS WORKS:
// Blueprints are markdown guides MA follows for certain jobs. This file lists
// them in groups, opens one in the editor as a special tab (flag isBlueprint),
// and saves changes through a different API path than normal workspace files.
//
// Think of a recipe card wall in a kitchen: pick a card, cook (edit), put it
// back in the right slot (save).
//
// WHAT USES THIS:
//   ma-ui-editor-tree.js — Blueprints rail section.
//   ma-ui-nav.js — Save / save-all may call saveBlueprint() for the active tab.
//
// WHAT IT NEEDS FIRST:
//   ma-ui.js, ma-ui-dom.js, ma-ui-api.js, ma-ui-editor-tabs.js.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

async function loadBlueprints() {
  const list = document.getElementById('bp-list');
  if (!list) return;
  list.innerHTML = '<div class="side-empty">Loading blueprints...</div>';
  try {
    const r = await fetch('/api/blueprints');
    const d = await r.json();
    const files = d.files || [];
    if (!files.length) {
      list.innerHTML = '<div class="side-empty">No blueprint files found.</div>';
      return;
    }
    // Group files by folder
    var groups = {};
    files.forEach(function(file) {
      var folder = file.group || 'root';
      if (!groups[folder]) groups[folder] = [];
      groups[folder].push(file);
    });
    // Render folder tree
    var html = '';
    var folderDescriptions = {
      core: 'Core — Task execution rules',
      modules: 'Modules — Task-type blueprints',
      nekocore: 'NekoCore — OS architecture docs',
      'rem-system': 'REM System — Layer specifications',
      root: 'Root'
    };
    Object.keys(groups).sort().forEach(function(folder) {
      var label = folderDescriptions[folder] || folder;
      html += '<div class="bp-folder">';
      html += '<button class="bp-folder-toggle" onclick="this.parentElement.classList.toggle(\'collapsed\')">';
      html += '<span class="bp-folder-icon">▾</span> ' + escHtml(label);
      html += '<span class="bp-folder-count">' + groups[folder].length + '</span>';
      html += '</button>';
      html += '<div class="bp-folder-items">';
      groups[folder].forEach(function(file) {
        var active = file.path === selectedBlueprintPath ? ' active' : '';
        html += '<button class="bp-item' + active + '" data-bp-path="' + escHtml(file.path) + '" onclick="openBlueprint(\'' + file.path.replace(/'/g, '\\&#39;') + '\')">';
        html += '<div class="name">' + escHtml(file.name.replace(/\.md$/, '')) + '</div>';
        html += '</button>';
      });
      html += '</div></div>';
    });
    list.innerHTML = html;
  } catch (e) {
    list.innerHTML = '<div class="side-empty">Could not load blueprints: ' + escHtml(e.message) + '</div>';
  }
}

async function openBlueprint(filePath) {
  selectedBlueprintPath = filePath;
  // Highlight active item in sidebar
  document.querySelectorAll('.bp-item').forEach(function(item) {
    item.classList.toggle('active', item.getAttribute('data-bp-path') === filePath);
  });
  // Check if already open in a tab
  const tabPath = 'blueprint:' + filePath;
  const existing = openTabs.find(t => t.path === tabPath);
  if (existing) { activateTab(existing.id); return; }
  // Fetch and open in editor tab
  try {
    const r = await fetch('/api/blueprints/file?path=' + encodeURIComponent(filePath));
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    const name = filePath.split('/').pop();
    const ext = (name.match(/\.([^.]+)$/) || [])[1] || '';
    const mode = detectEditorMode(ext);
    const tab = {
      id: 'tab-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      path: tabPath,
      name: '📘 ' + name,
      content: d.content || '',
      originalContent: d.content || '',
      ext: ext,
      mode: mode,
      viewMode: mode === 'markdown' ? 'preview' : 'source',
      dirty: false,
      isBlueprint: true,
      blueprintPath: filePath
    };
    openTabs.push(tab);
    activateTab(tab.id);
  } catch (e) {
    addSystem('Blueprint error: ' + e.message);
  }
}

async function saveBlueprint() {
  // Save from active editor tab if it's a blueprint
  const tab = openTabs.find(t => t.id === activeTabId);
  if (!tab || !tab.isBlueprint) {
    addSystem('No blueprint tab is active.');
    return;
  }
  const ta = document.querySelector('.editor-textarea');
  if (ta) tab.content = ta.value;
  try {
    const r = await apiPostJson('/api/blueprints/file', { path: tab.blueprintPath, content: tab.content });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Save failed');
    tab.originalContent = tab.content;
    tab.dirty = false;
    renderEditorTabs();
    renderEditorContent();
    addSystem('Saved blueprint: ' + tab.blueprintPath);
  } catch (e) {
    addSystem('Blueprint save error: ' + e.message);
  }
}
