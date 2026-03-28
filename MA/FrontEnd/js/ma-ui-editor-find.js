// ── FrontEnd · Find & replace in the editor ─────────────────────────────────
//
// HOW FIND WORKS:
// A small floating bar sits over the editor. You type a search string; we
// scan the current tab's text, jump match to match, and optionally replace
// one or all. Ctrl+F opens find; Ctrl+H opens find+replace. The editor's
// right-click menu can open the same panel.
//
// Think of a magnifying glass over a single page — it only searches the file
// you are editing, not the whole disk.
//
// WHAT IT NEEDS FIRST:
//   ma-ui-editor.js (find globals), ma-ui-editor-tabs.js (which tab is active).
//   Replace uses _syncStyledOverlay() from ma-ui-editor-styled.js (loads next;
//   that is fine — we only call it when you click buttons, not at load time).
//
// GLOBAL API:
//   _openFind, _closeFindPanel, keyboard hooks wired from elsewhere, …
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

function _editorCtxMenu(e) {
  // Only show on editor pane body when a tab is open
  var pane = e.target.closest('.editor-pane-body');
  if (!pane) return;
  var tab = openTabs.find(function(t){ return t.id === activeTabId; });
  if (!tab) return;
  e.preventDefault();
  _closeEditorCtx();
  var menu = document.createElement('div');
  menu.id = 'editor-ctx';
  menu.className = 'editor-ctx-menu';
  menu.innerHTML =
    '<div class="ctx-item" onclick="_openFind(false)">Find <span class="ctx-shortcut">Ctrl+F</span></div>' +
    '<div class="ctx-item" onclick="_openFind(true)">Find and Replace <span class="ctx-shortcut">Ctrl+H</span></div>';
  menu.style.left = e.clientX + 'px';
  menu.style.top  = e.clientY + 'px';
  document.body.appendChild(menu);
  setTimeout(function(){ document.addEventListener('click', _closeEditorCtx, { once: true }); }, 0);
}

function _closeEditorCtx() {
  var m = document.getElementById('editor-ctx');
  if (m) m.remove();
}

function _openFind(withReplace) {
  _closeEditorCtx();
  _findOpen    = true;
  _findReplace = !!withReplace;
  _findMatches = [];
  _findIdx     = -1;
  _renderFindPanel();
}

function _closeFindPanel() {
  _findOpen = false;
  _findQuery = '';
  _findMatches = [];
  _findIdx = -1;
  var p = document.getElementById('find-panel');
  if (p) p.remove();
  // Remove highlights
  document.querySelectorAll('.find-hl, .find-hl-current').forEach(function(el){
    var parent = el.parentNode;
    parent.replaceChild(document.createTextNode(el.textContent), el);
    parent.normalize();
  });
}

function _renderFindPanel() {
  var existing = document.getElementById('find-panel');
  if (existing) existing.remove();

  var panel = document.createElement('div');
  panel.id = 'find-panel';
  panel.className = 'find-panel';
  panel.innerHTML =
    '<div class="find-row">' +
      '<input id="find-input" class="find-input" placeholder="Find…" value="' + escHtml(_findQuery) + '" oninput="_onFindInput(this.value)" onkeydown="_onFindKey(event)">' +
      '<span id="find-count" class="find-count">No results</span>' +
      '<button class="find-btn" onclick="_findPrev()" title="Previous">&#9650;</button>' +
      '<button class="find-btn" onclick="_findNext()" title="Next">&#9660;</button>' +
      '<button class="find-btn find-close" onclick="_closeFindPanel()" title="Close">&times;</button>' +
    '</div>' +
    (_findReplace ?
    '<div class="find-row">' +
      '<input id="replace-input" class="find-input" placeholder="Replace…" value="' + escHtml(_findReplaceVal) + '">' +
      '<button class="find-btn" onclick="_doReplace()" title="Replace">Replace</button>' +
      '<button class="find-btn" onclick="_doReplaceAll()" title="Replace All">All</button>' +
    '</div>' : '');

  var pane = editorContent ? editorContent.querySelector('.editor-pane-body') : null;
  if (pane) {
    pane.style.position = 'relative';
    pane.insertBefore(panel, pane.firstChild);
  }
  var inp = document.getElementById('find-input');
  if (inp) inp.focus();
}

function _onFindInput(val) {
  _findQuery = val;
  _computeFindMatches();
  _paintFindHighlights();
}

function _onFindKey(e) {
  if (e.key === 'Enter') { if (e.shiftKey) _findPrev(); else _findNext(); e.preventDefault(); }
  if (e.key === 'Escape') _closeFindPanel();
}

function _computeFindMatches() {
  _findMatches = [];
  _findIdx = -1;
  if (!_findQuery) return;
  var tab = openTabs.find(function(t){ return t.id === activeTabId; });
  if (!tab) return;
  var content = tab.content;
  var q = _findQuery;
  var idx = 0;
  var lower = content.toLowerCase();
  var qLow  = q.toLowerCase();
  while (true) {
    var p = lower.indexOf(qLow, idx);
    if (p < 0) break;
    // Compute line number
    var line = content.substring(0, p).split('\n').length - 1;
    var col  = p - (content.lastIndexOf('\n', p - 1) + 1);
    _findMatches.push({ pos: p, line: line, col: col, len: q.length });
    idx = p + 1;
  }
  if (_findMatches.length) _findIdx = 0;
  var ct = document.getElementById('find-count');
  if (ct) ct.textContent = _findMatches.length ? (_findIdx + 1) + ' of ' + _findMatches.length : 'No results';
}

function _paintFindHighlights() {
  // Remove old highlights
  document.querySelectorAll('.find-hl, .find-hl-current').forEach(function(el){
    var parent = el.parentNode;
    parent.replaceChild(document.createTextNode(el.textContent), el);
    parent.normalize();
  });
  if (!_findMatches.length) return;

  var hl = document.getElementById('styled-hl');
  if (!hl) hl = editorContent ? editorContent.querySelector('.editor-code-view') : null;
  if (!hl) return;
  var codeLines = hl.querySelectorAll('.code-line');

  // Group matches by line
  var byLine = {};
  _findMatches.forEach(function(m, i){ if (!byLine[m.line]) byLine[m.line] = []; byLine[m.line].push({ idx: i, col: m.col, len: m.len }); });

  Object.keys(byLine).forEach(function(lineStr) {
    var lineIdx = parseInt(lineStr, 10);
    var row = codeLines[lineIdx];
    if (!row) return;
    var codeEl = row.querySelector('.code-content');
    if (!codeEl) return;
    var matches = byLine[lineIdx].sort(function(a, b){ return b.col - a.col; }); // reverse so offsets stay valid
    matches.forEach(function(m) {
      _wrapTextRange(codeEl, m.col, m.len, m.idx === _findIdx ? 'find-hl-current' : 'find-hl');
    });
  });
}

function _wrapTextRange(container, col, len, cls) {
  var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
  var tPos = 0, node, remaining = len, startCol = col;
  while ((node = walker.nextNode())) {
    if (tPos + node.length <= startCol) { tPos += node.length; continue; }
    var off = startCol - tPos;
    var take = Math.min(node.length - off, remaining);
    var range = document.createRange();
    range.setStart(node, off);
    range.setEnd(node, off + take);
    var span = document.createElement('span');
    span.className = cls;
    range.surroundContents(span);
    remaining -= take;
    if (remaining <= 0) break;
    startCol += take;
    tPos += off + take;
    // After surroundContents, the walker may skip nodes; re-start from span's nextSibling
    if (span.nextSibling && span.nextSibling.nodeType === 3) {
      node = span.nextSibling;
      tPos = startCol;
    }
  }
}

function _findNext() {
  if (!_findMatches.length) return;
  _findIdx = (_findIdx + 1) % _findMatches.length;
  _updateFindUI();
}

function _findPrev() {
  if (!_findMatches.length) return;
  _findIdx = (_findIdx - 1 + _findMatches.length) % _findMatches.length;
  _updateFindUI();
}

function _updateFindUI() {
  var ct = document.getElementById('find-count');
  if (ct) ct.textContent = (_findIdx + 1) + ' of ' + _findMatches.length;
  _paintFindHighlights();
  // Scroll match into view
  var current = document.querySelector('.find-hl-current');
  if (current) current.scrollIntoView({ block: 'center', behavior: 'smooth' });
  // Also move textarea cursor to match position (edit mode)
  var ta = document.getElementById('styled-ta') || (editorContent ? editorContent.querySelector('.editor-textarea') : null);
  if (ta && _findMatches[_findIdx]) {
    ta.focus();
    ta.setSelectionRange(_findMatches[_findIdx].pos, _findMatches[_findIdx].pos + _findMatches[_findIdx].len);
  }
}

function _doReplace() {
  if (_findIdx < 0 || !_findMatches.length) return;
  var tab = openTabs.find(function(t){ return t.id === activeTabId; });
  if (!tab) return;
  var ta = document.getElementById('styled-ta') || (editorContent ? editorContent.querySelector('.editor-textarea') : null);
  var replVal = (document.getElementById('replace-input') || {}).value || '';
  _findReplaceVal = replVal;
  var m = _findMatches[_findIdx];
  if (ta) {
    ta.focus();
    ta.setSelectionRange(m.pos, m.pos + m.len);
    document.execCommand('insertText', false, replVal);
    tab.content = ta.value;
    tab.dirty = tab.content !== tab.originalContent;
    renderEditorTabs();
    _computeFindMatches();
    if (typeof _syncStyledOverlay === 'function' && document.getElementById('styled-ta')) _syncStyledOverlay();
  }
}

function _doReplaceAll() {
  if (!_findMatches.length) return;
  var tab = openTabs.find(function(t){ return t.id === activeTabId; });
  if (!tab) return;
  var ta = document.getElementById('styled-ta') || (editorContent ? editorContent.querySelector('.editor-textarea') : null);
  var replVal = (document.getElementById('replace-input') || {}).value || '';
  _findReplaceVal = replVal;
  if (ta) {
    // Replace from end to start to keep positions valid, using execCommand for undo
    var sorted = _findMatches.slice().sort(function(a, b){ return b.pos - a.pos; });
    ta.focus();
    sorted.forEach(function(m) {
      ta.setSelectionRange(m.pos, m.pos + m.len);
      document.execCommand('insertText', false, replVal);
    });
    tab.content = ta.value;
    tab.dirty = tab.content !== tab.originalContent;
    renderEditorTabs();
    _computeFindMatches();
    _syncStyledOverlay();
  }
}

// Also attach global keyboard handler for Ctrl+F/H in any editor mode
document.addEventListener('keydown', function(e) {
  if (!editorContent) return;
  var tab = openTabs.find(function(t){ return t.id === activeTabId; });
  if (!tab) return;
  if (e.ctrlKey && e.key === 'f') { e.preventDefault(); _openFind(false); }
  if (e.ctrlKey && e.key === 'h') { e.preventDefault(); _openFind(true); }
});

if (window.MA && window.MA.editor) {
  window.MA.editor.openFind = _openFind;
}
