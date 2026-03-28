// ── FrontEnd · Left sidebar: tree & section shells ───────────────────────────
//
// HOW THE EXPLORER WORKS:
// The left rail switches "modes" (workspace files, session, projects, …).
// When you pick a mode, we sometimes inject HTML scaffolding — empty boxes
// where other scripts will paint lists. For the workspace we fetch a tree from
// the server, filter it, let you drag files onto the chat box, and show a
// right-click menu (new file, rename, delete, …).
//
// Think of the sidebar as a filing cabinet whose drawers swap: this file
// builds the drawer inserts and hangs the folder tree for the workspace drawer.
//
// WHAT IT NEEDS FIRST:
//   ma-ui-editor-tabs.js (openFileInEditor), ma-ui-nav.js (_updateWorkspaceTitle),
//   ma-ui-workspace-session.js, ma-ui-workspace-projects.js,
//   ma-ui-workspace-blueprints.js, ma-ui-workspace-todos-chores.js.
//
// GLOBAL API:
//   loadWorkspaceTree, refreshWorkspaceSection, scaffold helpers, drag handlers, …
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

// ── Section scaffolds (empty layout before lists load) ───────────────────────
function _scaffoldSection(name) {
  if (!explorerBodyEl) return;
  const scaffolds = {
    blueprints:
      '<div id="bp-list"></div>',
    projects:
      '<div id="proj-list"></div>',
    session:
      '<div id="session-summary" style="margin-bottom:12px"></div>' +
      '<h3 style="font-size:13px;color:var(--text);margin:0 0 6px">Conversations</h3>' +
      '<div id="session-conversations"></div>' +
      '<h3 style="font-size:13px;color:var(--text);margin:12px 0 6px">Recent Work</h3>' +
      '<div id="session-recent"></div>' +
      '<h3 style="font-size:13px;color:var(--text);margin:12px 0 6px">Task Editor</h3>' +
      '<label style="font-size:12px;color:var(--dim)">Current Task</label>' +
      '<input id="task-current-input" placeholder="What are you working on?">' +
      '<label style="font-size:12px;color:var(--dim);margin-top:6px">Resume Point</label>' +
      '<input id="task-resume-input" placeholder="Where to pick up...">' +
      '<label style="font-size:12px;color:var(--dim);margin-top:6px">Plan Steps</label>' +
      '<div id="task-plan-list"></div>' +
      '<div class="task-add-row" style="display:flex;gap:4px;margin-top:6px">' +
        '<input id="task-plan-new" placeholder="New step..." style="flex:1">' +
        '<button class="btn-save" onclick="addTaskStep()">Add</button>' +
      '</div>' +
      '<div class="btn-row" style="margin-top:8px"><button class="btn-save" onclick="saveTaskWorkspace()">Save Task</button></div>',
    todos:
      '<div class="task-add-row" style="display:flex;gap:4px;margin-bottom:8px">' +
        '<input id="todo-new" placeholder="New todo..." style="flex:1">' +
        '<button class="btn-save" onclick="addTodo()">Add</button>' +
      '</div>' +
      '<div id="todo-list"></div>',
    chores:
      '<div id="chore-list"></div>' +
      '<h3 style="font-size:13px;color:var(--text);margin:12px 0 6px">Add Chore</h3>' +
      '<input id="chore-name" placeholder="Chore name">' +
      '<input id="chore-desc" placeholder="Description" style="margin-top:4px">' +
      '<label style="font-size:12px;color:var(--dim);margin-top:4px">Interval (ms)</label>' +
      '<input id="chore-interval" type="number" value="1800000" placeholder="1800000">' +
      '<div class="btn-row" style="margin-top:8px"><button class="btn-save" onclick="addChoreFromPane()">Add Chore</button></div>',
    archives:
      '<div class="archive-search-bar" style="margin-bottom:10px">' +
        '<input id="archive-search" placeholder="Search archives..." oninput="filterArchiveList()" style="width:100%;background:rgba(13,17,23,.9);border:1px solid var(--border);border-radius:10px;color:var(--text);padding:8px 12px;font-size:13px;font-family:inherit">' +
      '</div>' +
      '<div id="archive-list"></div>'
  };
  explorerBodyEl.innerHTML = scaffolds[name] || '';
}

function refreshWorkspaceSection() {
  if (currentInspector === 'workspace') return loadWorkspaceTree();
  if (currentInspector === 'projects') { _scaffoldSection('projects'); return loadProjects(); }
  if (currentInspector === 'blueprints') { _scaffoldSection('blueprints'); return loadBlueprints(); }
  if (currentInspector === 'session' || currentInspector === 'tasks') { _scaffoldSection('session'); loadWorklog(); loadConversationHistory(); return; }
  if (currentInspector === 'todos') { _scaffoldSection('todos'); return renderTodos(); }
  if (currentInspector === 'chores') { _scaffoldSection('chores'); return loadChoresPane(); }
  if (currentInspector === 'archives') { _scaffoldSection('archives'); return loadArchives(); }
  if (explorerBodyEl) {
    explorerBodyEl.innerHTML = '<div class="side-empty">This section is under construction.</div>';
  }
}

// ── Workspace File Tree ───────────────────────────────────────────────────
let _wsRootName = 'Workspace';
let _activeFilePath = null; // currently open file path for highlighting

async function loadWorkspaceTree() {
  if (!explorerBodyEl) return;
  explorerBodyEl.innerHTML = '<div class="side-empty">Loading workspace...</div>';
  try {
    const r = await fetch('/api/workspace/tree');
    const d = await r.json();
    const items = d.items || [];

    // Update workspace root name
    if (d.root) {
      _wsRootName = d.root.replace(/\\/g, '/').split('/').pop() || 'Workspace';
      _updateWorkspaceTitle(d.root);
    }

    if (!items.length) {
      explorerBodyEl.innerHTML =
        '<div class="tree-empty">' +
          '<div class="tree-empty-icon">📂</div>' +
          '<div class="tree-empty-text">This folder is empty</div>' +
          '<button class="tree-empty-btn" onclick="menuNewFile()">Create a File</button>' +
        '</div>';
      return;
    }
    explorerBodyEl.innerHTML = '<div class="file-tree">' + renderTreeNodes(items, 0) + '</div>';
  } catch (e) {
    explorerBodyEl.innerHTML =
      '<div class="tree-empty">' +
        '<div class="tree-empty-icon">📁</div>' +
        '<div class="tree-empty-text">No folder opened</div>' +
        '<div class="tree-empty-hint">Open a folder to start working</div>' +
        '<button class="tree-empty-btn" onclick="menuOpenFolder()">Open Folder</button>' +
      '</div>';
  }
}

function renderTreeNodes(nodes, depth) {
  return nodes.map(function(node) {
    if (node.type === 'directory') {
      const children = node.children ? renderTreeNodes(node.children, depth + 1) : '';
      const hasChildren = node.children && node.children.length > 0;
      return '<div class="tree-node tree-dir" data-path="' + escAttr(node.path) + '">' +
        '<div class="tree-row" onclick="treeSelect(this, \'' + escAttr(node.path) + '\', \'directory\')" ondblclick="toggleTreeDir(this)" oncontextmenu="showTreeContextMenu(event, \'' + escAttr(node.path) + '\', \'directory\')" draggable="true" ondragstart="treeDragStart(event, \'' + escAttr(node.path) + '\', \'directory\')" style="padding-left:4px">' +
          _renderIndentGuides(depth) +
          '<span class="tree-chevron">▶</span>' +
          '<span class="tree-icon">' + _folderIcon(node.name, false) + '</span>' +
          '<span class="tree-label">' + escHtml(node.name) + '</span>' +
        '</div>' +
        '<div class="tree-children" style="display:none">' + children + '</div>' +
      '</div>';
    }
    const ext = (node.name.match(/\.([^.]+)$/) || [])[1] || '';
    const isActive = _activeFilePath === node.path;
    return '<div class="tree-node tree-file' + (isActive ? ' active' : '') + '" data-path="' + escAttr(node.path) + '">' +
      '<div class="tree-row" onclick="treeSelect(this, \'' + escAttr(node.path) + '\', \'file\')" ondblclick="openFileInEditor(\'' + escAttr(node.path) + '\')" oncontextmenu="showTreeContextMenu(event, \'' + escAttr(node.path) + '\', \'file\')" draggable="true" ondragstart="treeDragStart(event, \'' + escAttr(node.path) + '\', \'file\')" style="padding-left:4px">' +
        _renderIndentGuides(depth) +
        '<span class="tree-chevron" style="visibility:hidden">▶</span>' +
        '<span class="tree-icon">' + _fileIcon(node.name, ext) + '</span>' +
        '<span class="tree-label">' + escHtml(node.name) + '</span>' +
      '</div>' +
    '</div>';
  }).join('');
}

function _renderIndentGuides(depth) {
  let guides = '';
  for (let i = 0; i < depth; i++) {
    guides += '<span class="tree-indent-guide"></span>';
  }
  return guides;
}

function _folderIcon(name, isOpen) {
  const special = {
    'node_modules': '📦', '.git': '🔒', 'src': '📂', 'dist': '📦',
    'build': '📦', 'test': '🧪', 'tests': '🧪', '__tests__': '🧪',
    'docs': '📖', 'lib': '📚', 'config': '⚙', 'public': '🌐',
    'assets': '🎨', 'images': '🖼', 'styles': '🎨', 'css': '🎨',
    'components': '🧩', 'pages': '📄', 'api': '🔌', 'hooks': '🪝',
    'utils': '🔧', 'helpers': '🔧', 'scripts': '📜', '.vscode': '⚙'
  };
  return special[name.toLowerCase()] || (isOpen ? '📂' : '📁');
}

function _fileIcon(name, ext) {
  const nameMap = {
    'package.json': '📦', 'tsconfig.json': '⚙', '.gitignore': '🔒', 'README.md': '📖',
    'LICENSE': '📜', 'Dockerfile': '🐳', 'docker-compose.yml': '🐳',
    '.env': '🔐', '.env.local': '🔐', 'Makefile': '🔧', 'Cargo.toml': '🦀'
  };
  if (nameMap[name]) return nameMap[name];
  const extMap = {
    js: '🟨', ts: '🔷', jsx: '⚛', tsx: '⚛', json: '📋', md: '📖',
    html: '🌐', css: '🎨', scss: '🎨', less: '🎨', py: '🐍',
    rs: '🦀', cs: '🔷', java: '☕', go: '🔵', rb: '💎',
    php: '🐘', sql: '🗃', sh: '📜', bash: '📜', ps1: '📜',
    yaml: '📋', yml: '📋', toml: '📋', xml: '🌐', svg: '🖼',
    png: '🖼', jpg: '🖼', gif: '🖼', webp: '🖼', ico: '🖼',
    txt: '📄', log: '📄', env: '🔐', lock: '🔒', map: '🗺'
  };
  return extMap[(ext || '').toLowerCase()] || '📄';
}

function toggleTreeDir(rowEl) {
  const children = rowEl.nextElementSibling;
  const chevron = rowEl.querySelector('.tree-chevron');
  const iconEl = rowEl.querySelector('.tree-icon');
  const dirNode = rowEl.closest('.tree-dir');
  if (!children) return;
  const isOpen = children.style.display !== 'none';
  children.style.display = isOpen ? 'none' : '';
  if (chevron) chevron.textContent = isOpen ? '▶' : '▼';
  if (dirNode) dirNode.classList.toggle('open', !isOpen);
  // Update folder icon
  if (iconEl) {
    const name = rowEl.querySelector('.tree-label')?.textContent || '';
    iconEl.textContent = _folderIcon(name, !isOpen);
  }
}

function collapseAllTree() {
  document.querySelectorAll('.tree-children').forEach(el => {
    el.style.display = 'none';
  });
  document.querySelectorAll('.tree-chevron').forEach(el => {
    if (el.style.visibility !== 'hidden') el.textContent = '▶';
  });
  document.querySelectorAll('.tree-dir').forEach(el => {
    el.classList.remove('open');
  });
}

function filterFileTree(query) {
  const q = (query || '').toLowerCase().trim();
  document.querySelectorAll('.file-tree .tree-node').forEach(node => {
    if (!q) {
      node.style.display = '';
      return;
    }
    const label = node.querySelector('.tree-label');
    const name = label ? label.textContent.toLowerCase() : '';
    if (node.classList.contains('tree-dir')) {
      // Always show dirs (children might match)
      node.style.display = '';
    } else {
      node.style.display = name.includes(q) ? '' : 'none';
    }
  });
}

// ── Tree Selection & Drag ─────────────────────────────────────────────────
let _selectedTreePath = null;

function treeSelect(rowEl, filePath, type) {
  // Clear previous selection
  document.querySelectorAll('.tree-row.selected').forEach(el => el.classList.remove('selected'));
  rowEl.classList.add('selected');
  _selectedTreePath = filePath;
}

function treeDragStart(event, filePath, type) {
  event.dataTransfer.setData('application/x-ma-tree-path', filePath);
  event.dataTransfer.setData('application/x-ma-tree-type', type);
  event.dataTransfer.effectAllowed = 'copy';
  // Visual drag image — create a small label
  const ghost = document.createElement('div');
  ghost.textContent = (type === 'directory' ? '📁 ' : '📄 ') + filePath.split('/').pop();
  ghost.style.cssText = 'position:absolute;top:-999px;left:-999px;padding:4px 10px;background:var(--surface);border:1px solid var(--accent);border-radius:6px;color:var(--text);font-size:12px;white-space:nowrap;';
  document.body.appendChild(ghost);
  event.dataTransfer.setDragImage(ghost, 0, 0);
  setTimeout(() => ghost.remove(), 0);
}

// ── Context Menu ──────────────────────────────────────────────────────────
let _ctxMenuPath = '';
let _ctxMenuType = '';

function showTreeContextMenu(event, filePath, type) {
  event.preventDefault();
  event.stopPropagation();
  _ctxMenuPath = filePath;
  _ctxMenuType = type;
  const menu = document.getElementById('tree-context-menu');
  if (!menu) return;
  menu.style.display = 'block';
  menu.style.left = event.clientX + 'px';
  menu.style.top = event.clientY + 'px';
  // Ensure menu stays in viewport
  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 4) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 4) + 'px';
  });
}

document.addEventListener('click', function() {
  const menu = document.getElementById('tree-context-menu');
  if (menu) menu.style.display = 'none';
});

function ctxNewFile() {
  const dir = _ctxMenuType === 'directory' ? _ctxMenuPath : _ctxMenuPath.replace(/\/[^/]+$/, '');
  const name = prompt('New file name:');
  if (!name || !name.trim()) return;
  const fullPath = dir ? dir + '/' + name.trim() : name.trim();
  apiPostJson('/api/workspace/save', { path: fullPath, content: '' }).then(r => r.json()).then(d => {
    if (!d.ok) { addSystem('Error: ' + (d.error || 'Could not create file')); return; }
    addSystem('Created ' + fullPath);
    loadWorkspaceTree();
    openFileInEditor(fullPath);
  }).catch(e => addSystem('Create error: ' + e.message));
}

function ctxNewFolder() {
  const dir = _ctxMenuType === 'directory' ? _ctxMenuPath : _ctxMenuPath.replace(/\/[^/]+$/, '');
  const name = prompt('New folder name:');
  if (!name || !name.trim()) return;
  const fullPath = dir ? dir + '/' + name.trim() : name.trim();
  apiPostJson('/api/workspace/mkdir', { path: fullPath }).then(r => r.json()).then(d => {
    if (!d.ok) { addSystem('Error: ' + (d.error || 'Could not create folder')); return; }
    addSystem('Created folder ' + fullPath);
    loadWorkspaceTree();
  }).catch(e => addSystem('Create folder error: ' + e.message));
}

function ctxRename() {
  const oldName = _ctxMenuPath.split('/').pop();
  const newName = prompt('Rename to:', oldName);
  if (!newName || !newName.trim() || newName.trim() === oldName) return;
  const dir = _ctxMenuPath.replace(/\/[^/]+$/, '');
  const newPath = dir ? dir + '/' + newName.trim() : newName.trim();
  apiPostJson('/api/workspace/rename', { oldPath: _ctxMenuPath, newPath: newPath }).then(r => r.json()).then(d => {
    if (d.error) { addSystem('Rename error: ' + d.error); return; }
    addSystem('Renamed to ' + newPath);
    // Update any open tab that referenced the old path
    const tab = openTabs.find(t => t.path === _ctxMenuPath);
    if (tab) { tab.path = newPath; tab.name = newName.trim(); renderEditorTabs(); _updateBreadcrumb(tab); }
    loadWorkspaceTree();
  }).catch(e => addSystem('Rename error: ' + e.message));
}

function ctxDelete() {
  if (!confirm('Delete ' + _ctxMenuPath + '?')) return;
  apiPostJson('/api/workspace/delete', { path: _ctxMenuPath }).then(r => r.json()).then(d => {
    if (d.error) { addSystem('Delete error: ' + d.error); return; }
    addSystem('Deleted ' + _ctxMenuPath);
    // Close tab if the deleted file was open
    const tabIdx = openTabs.findIndex(t => t.path === _ctxMenuPath || t.path.startsWith(_ctxMenuPath + '/'));
    if (tabIdx >= 0) { openTabs.splice(tabIdx, 1); if (activeTabId === openTabs[tabIdx]?.id) activeTabId = openTabs.length ? openTabs[0].id : null; renderEditorTabs(); renderEditorContent(); }
    loadWorkspaceTree();
  }).catch(e => addSystem('Delete error: ' + e.message));
}

function ctxCopyPath() {
  navigator.clipboard.writeText(_ctxMenuPath).then(() => {
    addSystem('Path copied: ' + _ctxMenuPath);
  }).catch(() => {
    addSystem('Could not copy path');
  });
}

function ctxRevealInTree() {
  // Expand parent directories to reveal the item
  const parts = _ctxMenuPath.split('/');
  let path = '';
  for (let i = 0; i < parts.length - 1; i++) {
    path += (i > 0 ? '/' : '') + parts[i];
    const dirNode = document.querySelector('.tree-dir[data-path="' + path + '"]');
    if (dirNode) {
      const children = dirNode.querySelector('.tree-children');
      const chevron = dirNode.querySelector('.tree-chevron');
      if (children) children.style.display = '';
      if (chevron) chevron.textContent = '▼';
      dirNode.classList.add('open');
    }
  }
}

if (window.MA && window.MA.workspace) {
  Object.assign(window.MA.workspace, {
    refreshWorkspaceSection,
    collapseAllTree,
    filterFileTree,
    ctxNewFile,
    ctxNewFolder,
    ctxRename,
    ctxDelete,
    ctxCopyPath,
    ctxRevealInTree
  });
}
