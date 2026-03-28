// ── FrontEnd · Todos (your browser) & Chores (the server) ───────────────────
//
// HOW TODOS AND CHORES DIFFER:
// Todos are quick personal checkboxes — they live only in YOUR browser
// (localStorage + TODO_STORAGE_KEY from ma-ui.js). Chores are scheduled jobs
// MA's server knows about: we add, toggle, or remove them through /api/chores.
// Same sidebar area, two different backends.
//
// Think of todos like sticky notes on your monitor (only you see them), and
// chores like calendar alarms the house itself rings (the server runs them).
//
// WHAT USES THIS:
//   ma-ui-editor-tree.js — Todos / Chores rail sections.
//   ma-ui.js — startup may call renderTodos() if the list is on the page.
//
// WHAT IT NEEDS FIRST:
//   ma-ui.js, ma-ui-dom.js, ma-ui-api.js, ma-ui-chat.js (addSystem for errors).
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

function getTodos() {
  try {
    const raw = localStorage.getItem(TODO_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

function saveTodos(todos) {
  localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(todos));
}

function renderTodos() {
  const list = document.getElementById('todo-list');
  if (!list) return;
  const todos = getTodos();
  if (!todos.length) {
    list.innerHTML = '<div class="side-empty">No todos yet.</div>';
    return;
  }
  list.innerHTML = todos.map(function(todo, idx) {
    return '<div class="todo-item' + (todo.done ? ' done' : '') + '">' +
      '<input type="checkbox" ' + (todo.done ? 'checked ' : '') + 'onchange="toggleTodo(' + idx + ', this.checked)">' +
      '<div class="body"><textarea oninput="updateTodoText(' + idx + ', this.value)">' + escHtml(todo.text || '') + '</textarea><div class="meta">Updated ' + escHtml(todo.updatedAt || 'just now') + '</div></div>' +
      '<button class="tiny-btn danger" onclick="deleteTodo(' + idx + ')">Delete</button>' +
    '</div>';
  }).join('');
}

function addTodo() {
  const input = document.getElementById('todo-new');
  const text = input.value.trim();
  if (!text) return;
  const todos = getTodos();
  todos.unshift({ text, done: false, updatedAt: new Date().toISOString() });
  saveTodos(todos);
  input.value = '';
  renderTodos();
}

function toggleTodo(index, done) {
  const todos = getTodos();
  if (!todos[index]) return;
  todos[index].done = done;
  todos[index].updatedAt = new Date().toISOString();
  saveTodos(todos);
  renderTodos();
}

function updateTodoText(index, value) {
  const todos = getTodos();
  if (!todos[index]) return;
  todos[index].text = value;
  todos[index].updatedAt = new Date().toISOString();
  saveTodos(todos);
}

function deleteTodo(index) {
  const todos = getTodos();
  todos.splice(index, 1);
  saveTodos(todos);
  renderTodos();
}

async function loadChoresPane() {
  const list = document.getElementById('chore-list');
  if (!list) return;
  list.innerHTML = '<div class="side-empty">Loading chores...</div>';
  try {
    const r = await fetch('/api/chores');
    const d = await r.json();
    const chores = d.chores || [];
    if (!chores.length) {
      list.innerHTML = '<div class="side-empty">No chores defined.</div>';
      return;
    }
    list.innerHTML = chores.map(function(chore) {
      return '<div class="chore-card">' +
        '<div class="split-row"><div><h4>' + escHtml(chore.name || chore.id) + '</h4><div class="meta">' + escHtml(chore.description || 'No description') + '</div></div><span class="status-pill' + (chore.enabled === false ? ' closed' : '') + '">' + (chore.enabled === false ? 'paused' : 'active') + '</span></div>' +
        '<div class="meta" style="margin-top:8px">Interval: ' + escHtml(String(Math.round((chore.intervalMs || 0) / 60000))) + ' min · Runs: ' + escHtml(String(chore.runCount || 0)) + (chore.lastRun ? ' · Last run: ' + escHtml(chore.lastRun) : '') + '</div>' +
        '<div class="pane-actions"><button class="secondary" onclick="toggleChoreEnabled(\'' + chore.id.replace(/'/g, '\\&#39;') + '\', ' + (chore.enabled === false ? 'true' : 'false') + ')">' + (chore.enabled === false ? 'Enable' : 'Pause') + '</button><button class="danger" onclick="removeChoreFromPane(\'' + chore.id.replace(/'/g, '\\&#39;') + '\')">Delete</button></div>' +
      '</div>';
    }).join('');
  } catch (e) {
    list.innerHTML = '<div class="side-empty">Could not load chores: ' + escHtml(e.message) + '</div>';
  }
}

async function addChoreFromPane() {
  const name = document.getElementById('chore-name').value.trim();
  const description = document.getElementById('chore-desc').value.trim();
  const intervalMs = parseInt(document.getElementById('chore-interval').value, 10) || 1800000;
  if (!name) {
    addSystem('Chore name is required.');
    return;
  }
  try {
    const r = await apiPostJson('/api/chores/add', { name, description, intervalMs });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Could not add chore');
    document.getElementById('chore-name').value = '';
    document.getElementById('chore-desc').value = '';
    loadChoresPane();
  } catch (e) {
    addSystem('Chore add error: ' + e.message);
  }
}

async function toggleChoreEnabled(id, enabled) {
  try {
    const r = await apiPostJson('/api/chores/update', { id, enabled });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Could not update chore');
    loadChoresPane();
  } catch (e) {
    addSystem('Chore update error: ' + e.message);
  }
}

async function removeChoreFromPane(id) {
  try {
    const r = await apiPostJson('/api/chores/remove', { id });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Could not remove chore');
    loadChoresPane();
  } catch (e) {
    addSystem('Chore remove error: ' + e.message);
  }
}
