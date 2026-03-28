// ── FrontEnd · Projects & memory archives list ───────────────────────────────
//
// HOW PROJECTS WORKS:
// MA can keep separate "project" archives (big folders of memories). This pane
// lists them as cards, lets you change state (activate, archive, …), and can open
// a tree of memory nodes inside a project. Double-clicking a node opens a
// read-only tab so you can read what was stored.
//
// Think of a shelf of labeled binders; each binder has sticky notes inside
// (nodes) you can pull out and read.
//
// WHAT USES THIS:
//   ma-ui-editor-tree.js — paints the Projects / Archives section.
//
// WHAT IT NEEDS FIRST:
//   ma-ui.js, ma-ui-dom.js, ma-ui-api.js, ma-ui-chat.js (addSystem),
//   ma-ui-editor-tabs.js, ma-ui-workspace-session.js (loadWorklog after updates).
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

async function loadProjects() {
  const list = document.getElementById('proj-list');
  if (!list) return;
  list.innerHTML = '<div class="side-empty">Loading project archives...</div>';
  try {
    const r = await fetch('/api/projects');
    const d = await r.json();
    const projects = d.projects || [];
    if (!projects.length) {
      list.innerHTML = '<div class="side-empty">No project archives yet.</div>';
      return;
    }
    list.innerHTML = projects.map(function(project) {
      const isClosed = project.status === 'closed';
      return '<div class="project-card">' +
        '<div class="split-row"><div><h4>' + escHtml(project.name || project.id) + '</h4><div class="meta">' + escHtml(project.id || '') + '</div></div><span class="status-pill' + (isClosed ? ' closed' : '') + '">' + escHtml(project.status || 'active') + '</span></div>' +
        '<div class="meta" style="margin-top:8px">Updated: ' + escHtml(project.updatedAt || project.createdAt || 'unknown') + '<br>Nodes: ' + escHtml(String(project.nodeCount || 0)) + ' · Edges: ' + escHtml(String(project.edgeCount || 0)) + '</div>' +
        '<div class="pane-actions"><button class="secondary" onclick="setProjectState(\'' + project.id.replace(/'/g, '\\&#39;') + '\', \'' + (isClosed ? 'resume' : 'close') + '\')">' + (isClosed ? 'Resume Project' : 'Close Project') + '</button></div>' +
      '</div>';
    }).join('');
  } catch (e) {
    list.innerHTML = '<div class="side-empty">Could not load projects: ' + escHtml(e.message) + '</div>';
  }
}

async function setProjectState(projectId, action) {
  try {
    const r = await apiPostJson('/api/projects/state', { id: projectId, action });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Project update failed');
    addSystem('Project ' + projectId + ' updated.');
    loadProjects();
    loadWorklog();
  } catch (e) {
    addSystem('Project update error: ' + e.message);
  }
}

// ── Archives ──────────────────────────────────────────────────────────────

let _archivesCache = []; // { project, nodes[] }

async function loadArchives() {
  const list = document.getElementById('archive-list');
  if (!list) return;
  list.innerHTML = '<div class="side-empty">Loading archives...</div>';
  try {
    const r = await fetch('/api/projects');
    const d = await r.json();
    const projects = d.projects || [];
    if (!projects.length) {
      _archivesCache = [];
      list.innerHTML = '<div class="side-empty">No project archives yet. Archives are created when MA works on tasks.</div>';
      return;
    }

    // Fetch nodes for each project in parallel
    const withNodes = await Promise.all(projects.map(async function(project) {
      try {
        const nr = await fetch('/api/projects/nodes/' + encodeURIComponent(project.id));
        const nd = await nr.json();
        return { project: project, nodes: nd.nodes || [] };
      } catch (_) { return { project: project, nodes: [] }; }
    }));

    _archivesCache = withNodes;
    _renderArchiveList(withNodes, '');
  } catch (e) {
    list.innerHTML = '<div class="side-empty">Could not load archives.</div>';
  }
}

function filterArchiveList() {
  const input = document.getElementById('archive-search');
  const query = (input ? input.value : '').toLowerCase().trim();
  _renderArchiveList(_archivesCache, query);
}

function _renderArchiveList(archives, query) {
  const list = document.getElementById('archive-list');
  if (!list) return;

  if (!archives.length) {
    list.innerHTML = '<div class="side-empty">No archives found.</div>';
    return;
  }

  let html = '';
  for (const entry of archives) {
    const proj = entry.project;
    let nodes = entry.nodes;

    // Filter by search query
    if (query) {
      nodes = nodes.filter(function(n) {
        return (n.summary || '').toLowerCase().includes(query)
          || (n.sourceType || '').toLowerCase().includes(query)
          || (n.topics || []).some(function(t) { return t.toLowerCase().includes(query); });
      });
      // Skip project if no matching nodes and project name doesn't match
      if (!nodes.length && !(proj.name || proj.id).toLowerCase().includes(query)) continue;
    }

    const isClosed = proj.status === 'closed';
    html += '<div class="archive-project-folder open">';
    html += '<div class="archive-project-header" onclick="this.parentElement.classList.toggle(\'open\')">';
    html += '<span class="conv-folder-icon">📂</span> ';
    html += '<strong>' + escHtml(proj.name || proj.id) + '</strong>';
    html += '<span class="conv-day-count">' + nodes.length + ' nodes</span>';
    if (isClosed) html += '<span class="archive-status-badge">closed</span>';
    html += '</div>';
    html += '<div class="archive-node-list">';

    if (!nodes.length) {
      html += '<div class="side-empty" style="padding-left:12px">No entries' + (query ? ' matching "' + escHtml(query) + '"' : '') + '</div>';
    } else {
      for (const node of nodes) {
        const icon = node.sourceType === 'code' ? '💻' : node.sourceType === 'decision' ? '🎯' : node.sourceType === 'error' ? '⚠️' : node.sourceType === 'semantic' ? '🧠' : '📄';
        const time = (node.created || '').slice(11, 16) || '';
        html += '<button class="archive-node-item" onclick="openArchiveNode(\'' + escHtml(proj.id).replace(/'/g, "\\'") + '\', \'' + escHtml(node.memory_id).replace(/'/g, "\\'") + '\')">';
        html += '<span class="archive-node-icon">' + icon + '</span>';
        html += '<span class="archive-node-summary">' + escHtml(node.summary || node.sourceType || 'Node') + '</span>';
        if (time) html += '<span class="conv-item-time">' + time + '</span>';
        html += '</button>';
      }
    }

    html += '</div></div>';
  }

  if (!html) {
    list.innerHTML = '<div class="side-empty">No archives matching "' + escHtml(query) + '"</div>';
    return;
  }
  list.innerHTML = html;
}

async function openArchiveNode(projectId, nodeId) {
  try {
    const r = await fetch('/api/projects/node/' + encodeURIComponent(projectId) + '/' + encodeURIComponent(nodeId));
    if (!r.ok) { addSystem('Could not load archive node.'); return; }
    const d = await r.json();
    const node = d.node;
    if (!node) { addSystem('Archive node not found.'); return; }

    // Format as plain text for the editor viewport
    let text = '── Archive Node ──\n';
    text += 'ID:          ' + (node.memory_id || nodeId) + '\n';
    text += 'Project:     ' + projectId + '\n';
    text += 'Type:        ' + (node.sourceType || 'unknown') + '\n';
    text += 'Created:     ' + (node.created || 'unknown') + '\n';
    text += 'Importance:  ' + (node.importance != null ? node.importance : 'N/A') + '\n';
    text += 'Topics:      ' + (node.topics || []).join(', ') + '\n';
    if (node.agentId) text += 'Agent:       ' + node.agentId + '\n';
    if (node.stepNumber != null) text += 'Step:        ' + node.stepNumber + '\n';
    text += '\n── Summary ──\n' + (node.summary || '(no summary)') + '\n';
    text += '\n── Content ──\n' + (node.content || '(no content)') + '\n';

    // Open as a read-only tab in the editor
    const tabName = (node.summary || node.sourceType || 'node').slice(0, 40);
    const tab = {
      id: 'tab-arc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      path: '__archive__/' + projectId + '/' + nodeId,
      name: tabName,
      content: text,
      originalContent: text,
      ext: 'txt',
      mode: 'code',
      viewMode: 'source',
      dirty: false
    };
    openTabs.push(tab);
    renderEditorTabs();
    activateTab(tab.id);
  } catch (e) {
    addSystem('Error loading archive node: ' + e.message);
  }
}
