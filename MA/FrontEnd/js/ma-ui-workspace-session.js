// ── FrontEnd · Session & tasks sidebar ──────────────────────────────────────
//
// HOW THE SESSION PANE WORKS:
// When you open "Session" in the left rail, you see a short summary of what MA
// remembers about your work, a list of past chat days, recent task cards, and
// a simple task planner (current task, resume line, checklist steps). All of that
// is loaded or saved through /api/worklog so it survives refresh.
//
// Think of it as MA's diary page: "what we were doing" and "recent chapters".
//
// WHAT USES THIS:
//   ma-ui-editor-tree.js — when you pick the session section, we fill the HTML.
//   ma-ui-chat.js — after some server events, we refresh the worklog list.
//   ma-ui-workspace-projects.js — changing a project pings loadWorklog() here.
//
// LOAD ORDER:
//   Before ma-ui-workspace-projects.js (project updates expect loadWorklog to exist).
//
// WHAT IT NEEDS FIRST:
//   ma-ui.js, ma-ui-dom.js, ma-ui-api.js, ma-ui-chat.js (sessions + addSystem).
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

function renderTaskEditor(state) {
  const taskInput = document.getElementById('task-current-input');
  const resumeInput = document.getElementById('task-resume-input');
  const list = document.getElementById('task-plan-list');
  // Session scaffold is only present after opening Session/Tasks in the explorer.
  if (!taskInput || !resumeInput || !list) return;
  taskInput.value = state.currentTask || '';
  resumeInput.value = state.resumePoint || '';
  const plan = Array.isArray(state.taskPlan) ? state.taskPlan : [];
  if (!plan.length) {
    list.innerHTML = '<div class="side-empty">No task plan yet.</div>';
    return;
  }
  list.innerHTML = plan.map(function(step, idx) {
    return '<div class="task-step-row' + (step.done ? ' done' : '') + '">' +
      '<input type="checkbox" ' + (step.done ? 'checked ' : '') + 'onchange="toggleTaskStep(' + idx + ', this.checked)">' +
      '<div class="body"><input value="' + escHtml(step.description || '') + '" oninput="updateTaskStep(' + idx + ', this.value)"></div>' +
      '<button class="tiny-btn danger" onclick="removeTaskStep(' + idx + ')">Remove</button>' +
    '</div>';
  }).join('');
}

function readTaskPlanDraft() {
  const steps = [];
  document.querySelectorAll('#task-plan-list .task-step-row').forEach(function(row) {
    const textInput = row.querySelector('.body input');
    const checkbox = row.querySelector('input[type="checkbox"]');
    const description = (textInput?.value || '').trim();
    if (!description) return;
    steps.push({ done: !!checkbox?.checked, description });
  });
  return steps;
}

function toggleTaskStep(index, done) {
  const steps = readTaskPlanDraft();
  if (!steps[index]) return;
  steps[index].done = done;
  renderTaskEditor({ currentTask: document.getElementById('task-current-input').value, resumePoint: document.getElementById('task-resume-input').value, taskPlan: steps });
}

function updateTaskStep(index, value) {
  const steps = readTaskPlanDraft();
  if (!steps[index]) return;
  steps[index].description = value;
}

function removeTaskStep(index) {
  const steps = readTaskPlanDraft();
  steps.splice(index, 1);
  renderTaskEditor({ currentTask: document.getElementById('task-current-input').value, resumePoint: document.getElementById('task-resume-input').value, taskPlan: steps });
}

function addTaskStep() {
  const input = document.getElementById('task-plan-new');
  const description = input.value.trim();
  if (!description) return;
  const steps = readTaskPlanDraft();
  steps.push({ done: false, description });
  renderTaskEditor({ currentTask: document.getElementById('task-current-input').value, resumePoint: document.getElementById('task-resume-input').value, taskPlan: steps });
  input.value = '';
}

async function saveTaskWorkspace() {
  try {
    const r = await apiPostJson('/api/worklog', {
      currentTask: document.getElementById('task-current-input').value.trim(),
      resumePoint: document.getElementById('task-resume-input').value.trim(),
      taskPlan: readTaskPlanDraft()
    });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Could not save task workspace');
    addSystem('Task workspace updated.');
    loadWorklog();
  } catch (e) {
    addSystem('Task workspace error: ' + e.message);
  }
}

// ── Session · worklog & conversation list ───────────────────────────────────

async function loadWorklog() {
  const summaryEl = document.getElementById('session-summary');
  const recentEl = document.getElementById('session-recent');
  if (!summaryEl || !recentEl) return;
  try {
    const r = await fetch('/api/worklog');
    const d = await r.json();
    if (!d || (!d.activeProject && !d.currentTask && !d.resumePoint && (!d.recentWork || !d.recentWork.length))) {
      summaryEl.innerHTML = '<div class="side-empty">No session history yet.</div>';
      recentEl.innerHTML = '<div class="side-empty">Recent work will appear here after MA completes a task.</div>';
      renderTaskEditor({ currentTask: '', resumePoint: '', taskPlan: [] });
      return;
    }
    const summary = [];
    if (d.activeProject) summary.push('<div><strong style="color:var(--accent)">Project:</strong> ' + escHtml(d.activeProject) + '</div>');
    if (d.currentTask) summary.push('<div><strong style="color:var(--text)">Task:</strong> ' + escHtml(d.currentTask) + '</div>');
    if (d.resumePoint) summary.push('<div><strong style="color:var(--dim)">Resume:</strong> ' + escHtml(d.resumePoint) + '</div>');
    summaryEl.innerHTML = summary.join('') || '<div class="side-empty">No session metadata available.</div>';

    const recent = Array.isArray(d.recentWork) ? d.recentWork.slice().reverse().slice(0, 6) : [];
    recentEl.innerHTML = recent.length
      ? recent.map(function(item) {
          return '<div class="stack-card"><strong>' + escHtml(item.task || 'Untitled work') + '</strong><div class="meta">' + escHtml(item.date || '') + ' · ' + escHtml(item.status || '') + (item.files ? ' · ' + escHtml(item.files) : '') + '</div></div>';
        }).join('')
      : '<div class="side-empty">No recent work yet.</div>';

    renderTaskEditor(d);
  } catch (e) {
    summaryEl.innerHTML = '<div class="side-empty">Could not load session worklog.</div>';
    recentEl.innerHTML = '<div class="side-empty">Retry from the Refresh button.</div>';
  }
}

async function loadConversationHistory() {
  const container = document.getElementById('session-conversations');
  if (!container) return;
  container.innerHTML = '<div class="side-empty">Loading conversations...</div>';
  try {
    const r = await fetch('/api/chat/sessions');
    const d = await r.json();
    const sessions = d.sessions || [];
    if (!sessions.length) {
      container.innerHTML = '<div class="side-empty">No conversations yet. Start chatting to create history.</div>';
      return;
    }

    // Group by date
    const groups = {};
    const today = new Date().toISOString().slice(0, 10);
    for (const s of sessions) {
      const day = (s.updatedAt || s.createdAt || '').slice(0, 10) || 'Unknown';
      if (!groups[day]) groups[day] = [];
      groups[day].push(s);
    }

    // Sort dates newest first
    const sortedDays = Object.keys(groups).sort((a, b) => b.localeCompare(a));

    let html = '';
    for (const day of sortedDays) {
      const label = day === today ? 'Today — ' + day : day;
      const items = groups[day];
      const isToday = day === today;
      html += '<div class="conv-day-folder' + (isToday ? ' open' : '') + '">';
      html += '<div class="conv-day-header" onclick="this.parentElement.classList.toggle(\'open\')">';
      html += '<span class="conv-folder-icon">' + (isToday ? '📂' : '📁') + '</span> ';
      html += '<strong>' + escHtml(label) + '</strong>';
      html += '<span class="conv-day-count">' + items.length + '</span>';
      html += '</div>';
      html += '<div class="conv-day-items">';
      for (const s of items) {
        const preview = escHtml(s.preview || 'Untitled conversation');
        const time = (s.updatedAt || s.createdAt || '').slice(11, 16) || '';
        const isActive = s.id === activeSessionId;
        html += '<button class="conv-item' + (isActive ? ' active' : '') + '" onclick="loadSession(\'' + s.id.replace(/'/g, "\\'") + '\')">';
        html += '<span class="conv-item-preview">' + preview + '</span>';
        if (time) html += '<span class="conv-item-time">' + time + '</span>';
        html += '</button>';
      }
      html += '</div></div>';
    }
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = '<div class="side-empty">Could not load conversations.</div>';
  }
}
