// ── FrontEnd · Pretty views: markdown, colors, folds ─────────────────────────
//
// HOW STYLED EDITING WORKS:
// Plain .md files can show as a preview or raw text. Code files get line numbers,
// soft syntax colors, and optional code folding (hide a { … } block). We keep a
// hidden textarea in sync with a highlighted <pre> so typing still feels normal
// while you see colors. Small warnings appear if brackets look unbalanced.
//
// Think of a theatre costume over the actor: underneath it is still a person
// typing (textarea); on top is the painted face the audience sees (highlighted pre).
//
// WHAT IT NEEDS FIRST:
//   ma-ui-editor.js (fold + find state), ma-ui-editor-tabs.js (onEditorInput).
//
// GLOBAL API:
//   renderMarkdown, renderEditorContent helpers, fold/overlay sync, …
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

// ── Markdown → HTML (simple, not a full spec parser) ─────────────────────────
function renderMarkdown(src) {
  let html = escHtml(src);
  // Code blocks (fenced)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function(_, lang, code) {
    return '<pre><code class="lang-' + lang + '">' + code + '</code></pre>';
  });
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Headings
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');
  // Bold / italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Blockquotes
  html = html.replace(/^&gt;\s?(.+)$/gm, '<blockquote>$1</blockquote>');
  // Horizontal rules
  html = html.replace(/^---+$/gm, '<hr>');
  // Unordered lists
  html = html.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // Tables (simple)
  html = html.replace(/^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)+)/gm, function(_, header, sep, body) {
    const ths = header.split('|').filter(Boolean).map(c => '<th>' + c.trim() + '</th>').join('');
    const rows = body.trim().split('\n').map(function(row) {
      return '<tr>' + row.split('|').filter(Boolean).map(c => '<td>' + c.trim() + '</td>').join('') + '</tr>';
    }).join('');
    return '<table><thead><tr>' + ths + '</tr></thead><tbody>' + rows + '</tbody></table>';
  });
  // Paragraphs (lines that aren't already wrapped in tags)
  html = html.replace(/^(?!<[a-z])((?!<[a-z]).+)$/gm, '<p>$1</p>');
  // Consecutive blockquotes
  html = html.replace(/<\/blockquote>\n<blockquote>/g, '\n');
  return html;
}

// ── Syntax Highlighting (lightweight) ─────────────────────────────────────
function renderCodeView(content, ext, tabId) {
  var lines = content.split('\n');
  var lang  = ext.toLowerCase();
  var folds = _parseFoldRanges(content);
  var errs  = _detectErrors(content, lang);
  var fState = (_editorFoldState[tabId] || {});
  var html  = '';
  var skip  = -1;

  for (var i = 0; i < lines.length; i++) {
    if (i <= skip) continue;
    var num      = i + 1;
    var foldHere = null;
    for (var f = 0; f < folds.length; f++) { if (folds[f].start === i) { foldHere = folds[f]; break; } }
    var hasErr   = false;
    for (var e = 0; e < errs.length; e++) { if (errs[e].line === i) { hasErr = true; break; } }
    var isFolded = foldHere && fState[i];

    var gutter = '';
    if (foldHere) {
      gutter += '<span class="gutter-fold" onclick="editorToggleFold(' + i + ')">'.concat(isFolded ? '▸' : '▾', '</span>');
    } else {
      gutter += '<span class="gutter-fold-space"></span>';
    }
    if (hasErr) gutter += '<span class="gutter-error" title="Syntax issue">●</span>';
    gutter += '<span class="gutter-num">' + num + '</span>';

    html += '<div class="code-line' + (hasErr ? ' code-line-error' : '') + '" data-line="' + i + '">' +
      '<span class="code-gutter">' + gutter + '</span>' +
      '<span class="code-content">' + highlightLine(escHtml(lines[i]), lang) +
        (isFolded ? ' <span class="fold-placeholder">… }</span>' : '') +
      '</span></div>';

    if (isFolded && foldHere) skip = foldHere.end;
  }
  return html;
}

function highlightLine(line, lang) {
  // Comments
  if (lang === 'js' || lang === 'ts' || lang === 'json' || lang === 'cs' || lang === 'rs' || lang === 'css' || lang === 'java' || lang === 'c' || lang === 'cpp') {
    line = line.replace(/^(\s*)(\/\/.*)$/, '$1<span class="tok-comment">$2</span>');
    line = line.replace(/(\/\*.*?\*\/)/, '<span class="tok-comment">$1</span>');
  }
  if (lang === 'py') {
    line = line.replace(/^(\s*)(#.*)$/, '$1<span class="tok-comment">$2</span>');
  }
  if (lang === 'html' || lang === 'htm' || lang === 'xml' || lang === 'svg') {
    line = line.replace(/(&lt;!--.*?--&gt;)/, '<span class="tok-comment">$1</span>');
  }

  // Strings
  line = line.replace(/(&quot;(?:[^&]|&(?!quot;))*?&quot;|&#39;(?:[^&]|&(?!#39;))*?&#39;|`[^`]*`)/g, '<span class="tok-string">$1</span>');

  // Numbers
  line = line.replace(/\b(\d+\.?\d*)\b/g, '<span class="tok-number">$1</span>');

  // HTML tags
  if (lang === 'html' || lang === 'htm' || lang === 'xml' || lang === 'svg') {
    line = line.replace(/(&lt;\/?)([\w-]+)/g, '$1<span class="tok-tag">$2</span>');
    line = line.replace(/\b([\w-]+)(=)/g, '<span class="tok-attr">$1</span>$2');
  }

  // CSS selectors / properties
  if (lang === 'css') {
    line = line.replace(/\b([\w-]+)\s*(?=:)/g, '<span class="tok-attr">$1</span>');
  }

  // Keywords by language
  const kwSets = {
    js: /\b(const|let|var|function|return|if|else|for|while|switch|case|break|continue|class|new|this|import|export|default|from|async|await|try|catch|throw|typeof|instanceof|of|in|yield|null|undefined|true|false)\b/g,
    ts: /\b(const|let|var|function|return|if|else|for|while|switch|case|break|continue|class|new|this|import|export|default|from|async|await|try|catch|throw|typeof|instanceof|of|in|yield|null|undefined|true|false|interface|type|enum|implements|extends|public|private|protected|readonly|abstract)\b/g,
    py: /\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|raise|with|pass|break|continue|yield|lambda|and|or|not|in|is|None|True|False|self|async|await)\b/g,
    rs: /\b(fn|let|mut|const|if|else|for|while|loop|match|return|struct|enum|impl|trait|pub|use|mod|self|Self|super|crate|as|in|ref|move|async|await|true|false|None|Some|Ok|Err)\b/g,
    cs: /\b(class|struct|interface|enum|namespace|using|public|private|protected|internal|static|void|int|string|bool|var|new|return|if|else|for|while|foreach|switch|case|break|continue|try|catch|throw|async|await|null|true|false|this|base|override|virtual|abstract)\b/g,
    json: /\b(true|false|null)\b/g
  };
  const kwPat = kwSets[lang];
  if (kwPat) {
    line = line.replace(kwPat, '<span class="tok-keyword">$1</span>');
  }

  // Function calls — word followed by (
  line = line.replace(/\b([a-zA-Z_]\w*)\s*(?=\()/g, '<span class="tok-function">$1</span>');

  return line;
}

// ══════════════════════════════════════════════════════════════════════════
//  STYLED EDITOR  – overlay textarea + highlighted pre + gutter
// ══════════════════════════════════════════════════════════════════════════

function _buildStyledEditor(content, ext, tabId) {
  return '<div class="styled-editor" id="styled-editor">' +
    '<div class="styled-gutter" id="styled-gutter"></div>' +
    '<div class="styled-code-area">' +
      '<textarea class="styled-textarea" id="styled-ta" spellcheck="false">' + escHtml(content) + '</textarea>' +
      '<pre class="styled-highlight" id="styled-hl"></pre>' +
    '</div>' +
  '</div>';
}

/* Called once after DOM insert – hooks events and renders overlay */
function _initStyledEditor() {
  var ta = document.getElementById('styled-ta');
  if (!ta) return;
  _syncStyledOverlay();
  ta.addEventListener('input',  _onStyledInput);
  ta.addEventListener('scroll', _onStyledScroll);
  ta.addEventListener('click',  _onStyledClick);
  ta.addEventListener('keydown', _onStyledKeyDown);
  ta.addEventListener('keyup', _updateStatusBar);
  ta.addEventListener('click', _updateStatusBar);
  // Keep caret colour matched to theme
  ta.style.caretColor = 'var(--text)';
}

function _syncStyledOverlay() {
  var ta     = document.getElementById('styled-ta');
  var hl     = document.getElementById('styled-hl');
  var gutter = document.getElementById('styled-gutter');
  if (!ta || !hl) return;

  var tab = openTabs.find(function(t){ return t.id === activeTabId; });
  if (!tab) return;

  var content = ta.value;
  var lines   = content.split('\n');
  var lang    = tab.ext.toLowerCase();
  var folds   = _parseFoldRanges(content);
  var errs    = _detectErrors(content, lang);

  var hlHtml = '', gutHtml = '';
  for (var i = 0; i < lines.length; i++) {
    var num  = i + 1;
    var fold = null;
    for (var f = 0; f < folds.length; f++) { if (folds[f].start === i) { fold = folds[f]; break; } }
    var hasErr = false;
    for (var e = 0; e < errs.length; e++) { if (errs[e].line === i) { hasErr = true; break; } }

    gutHtml += '<div class="gutter-line' + (hasErr ? ' gutter-line-error' : '') + '">' +
      (fold ? '<span class="gutter-fold-space"></span>' : '<span class="gutter-fold-space"></span>') +
      (hasErr ? '<span class="gutter-error">●</span>' : '') +
      '<span class="gutter-num">' + num + '</span></div>';

    hlHtml += '<div class="code-line' + (hasErr ? ' code-line-error' : '') + '">' +
      '<span class="code-content">' + highlightLine(escHtml(lines[i]), lang) + '</span></div>';
  }

  hl.innerHTML = hlHtml;
  if (gutter) gutter.innerHTML = gutHtml;
  // Highlight current find matches
  if (_findOpen && _findQuery) _paintFindHighlights();
}

function _onStyledInput() {
  var ta = document.getElementById('styled-ta');
  if (!ta) return;
  onEditorInput(ta);
  _syncStyledOverlay();
}

function _onStyledScroll() {
  var ta = document.getElementById('styled-ta');
  var hl = document.getElementById('styled-hl');
  var gt = document.getElementById('styled-gutter');
  if (!ta) return;
  if (hl) { hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; }
  if (gt) { gt.scrollTop = ta.scrollTop; }
}

// ── Status bar: cursor position, line count, language ─────────────────────
var _langNames = { js:'JavaScript', ts:'TypeScript', jsx:'JSX', tsx:'TSX', json:'JSON', md:'Markdown', html:'HTML', htm:'HTML', css:'CSS', scss:'SCSS', py:'Python', rs:'Rust', cs:'C#', java:'Java', go:'Go', rb:'Ruby', php:'PHP', sql:'SQL', sh:'Shell', yaml:'YAML', yml:'YAML', toml:'TOML', xml:'XML', txt:'Plain Text' };

function _updateStatusBar() {
  var cursorEl  = document.getElementById('sb-cursor');
  var linesEl   = document.getElementById('sb-lines');
  var langEl    = document.getElementById('sb-language');
  if (!cursorEl) return;

  var tab = openTabs.find(function(t){ return t.id === activeTabId; });
  if (!tab) {
    cursorEl.textContent = '';
    linesEl.textContent = '';
    langEl.textContent = '';
    return;
  }

  // Language
  langEl.textContent = _langNames[(tab.ext || '').toLowerCase()] || 'Plain Text';

  // Line count
  var lineCount = (tab.content || '').split('\n').length;
  linesEl.textContent = lineCount + ' line' + (lineCount !== 1 ? 's' : '');

  // Cursor position from active textarea
  var ta = document.getElementById('styled-ta') || (editorContent ? editorContent.querySelector('.editor-textarea') : null);
  if (ta && typeof ta.selectionStart === 'number') {
    var text = ta.value.substring(0, ta.selectionStart);
    var ln = text.split('\n').length;
    var col = ta.selectionStart - text.lastIndexOf('\n');
    cursorEl.textContent = 'Ln ' + ln + ', Col ' + col;
  } else {
    cursorEl.textContent = 'Ln 1, Col 1';
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  BRACKET MATCHING
// ══════════════════════════════════════════════════════════════════════════

function _onStyledClick(e) {
  var ta = document.getElementById('styled-ta');
  if (!ta) return;
  // Slight delay so selectionStart is updated after click
  setTimeout(function(){ _doBracketMatch(ta); }, 0);
}

function _doBracketMatch(ta) {
  // Remove previous highlights
  document.querySelectorAll('.bracket-match').forEach(function(el){ el.classList.remove('bracket-match'); });

  var pos     = ta.selectionStart;
  var content = ta.value;
  var ch      = content[pos];
  var prev    = pos > 0 ? content[pos - 1] : '';

  var open  = { '{': '}', '(': ')', '[': ']' };
  var close = { '}': '{', ')': '(', ']': '[' };
  var src = -1, match = -1;

  if (open[ch])       { src = pos; match = _findBracketMatch(content, pos, ch, open[ch], 1); }
  else if (close[ch]) { src = pos; match = _findBracketMatch(content, pos, ch, close[ch], -1); }
  else if (open[prev])  { src = pos - 1; match = _findBracketMatch(content, pos - 1, prev, open[prev], 1); }
  else if (close[prev]) { src = pos - 1; match = _findBracketMatch(content, pos - 1, prev, close[prev], -1); }

  if (match >= 0 && src >= 0) _highlightBrackets(content, src, match);
}

function _findBracketMatch(content, pos, ownChar, pairChar, dir) {
  var depth = 0, i = pos;
  while (i >= 0 && i < content.length) {
    if (content[i] === ownChar)  depth += dir;
    if (content[i] === pairChar) depth -= dir;
    if (depth === 0) return i;
    i += dir;
  }
  return -1;
}

function _highlightBrackets(content, p1, p2) {
  var hl = document.getElementById('styled-hl');
  if (!hl) {
    // Try highlight mode code-view
    hl = editorContent ? editorContent.querySelector('.editor-code-view') : null;
  }
  if (!hl) return;

  var lines = content.split('\n');
  function lineCol(pos) {
    var c = 0;
    for (var i = 0; i < lines.length; i++) {
      if (c + lines[i].length >= pos) return { line: i, col: pos - c };
      c += lines[i].length + 1;
    }
    return { line: lines.length - 1, col: 0 };
  }

  var lc1 = lineCol(p1), lc2 = lineCol(p2);
  var codeLines = hl.querySelectorAll('.code-line');
  [lc1, lc2].forEach(function(lc) {
    var row = codeLines[lc.line];
    if (!row) return;
    var codeEl = row.querySelector('.code-content');
    if (!codeEl) return;
    var walker = document.createTreeWalker(codeEl, NodeFilter.SHOW_TEXT, null, false);
    var tPos = 0, node;
    while ((node = walker.nextNode())) {
      if (tPos + node.length > lc.col) {
        var off = lc.col - tPos;
        var range = document.createRange();
        range.setStart(node, off);
        range.setEnd(node, off + 1);
        var span = document.createElement('span');
        span.className = 'bracket-match';
        range.surroundContents(span);
        break;
      }
      tPos += node.length;
    }
  });
}

// ══════════════════════════════════════════════════════════════════════════
//  CODE FOLDING  (highlight / read-only mode)
// ══════════════════════════════════════════════════════════════════════════

function editorToggleFold(lineIdx) {
  var tab = openTabs.find(function(t){ return t.id === activeTabId; });
  if (!tab) return;
  if (!_editorFoldState[tab.id]) _editorFoldState[tab.id] = {};
  _editorFoldState[tab.id][lineIdx] = !_editorFoldState[tab.id][lineIdx];
  renderEditorContent();
}

function _parseFoldRanges(content) {
  var lines = content.split('\n');
  var ranges = [], stack = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var inStr = false, strCh = '';
    for (var j = 0; j < line.length; j++) {
      var ch = line[j];
      if (!inStr && (ch === '"' || ch === "'" || ch === '`')) { inStr = true; strCh = ch; continue; }
      if (inStr) { if (ch === strCh && line[j - 1] !== '\\') inStr = false; continue; }
      if (ch === '/' && line[j + 1] === '/') break; // line comment
      if (ch === '{') stack.push(i);
      else if (ch === '}' && stack.length) {
        var start = stack.pop();
        if (start !== i) ranges.push({ start: start, end: i });
      }
    }
  }
  return ranges;
}

// ══════════════════════════════════════════════════════════════════════════
//  ERROR DETECTION  (balanced brackets, basic format checks)
// ══════════════════════════════════════════════════════════════════════════

function _detectErrors(content, lang) {
  var errors = [];
  var lines  = content.split('\n');
  var stack  = [];
  var matchMap = { '}': '{', ')': '(', ']': '[' };
  var closeOf = { '{': '}', '(': ')', '[': ']' };

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var inStr = false, strCh = '', inComment = false;
    for (var j = 0; j < line.length; j++) {
      var ch = line[j];
      if (!inComment && !inStr && (ch === '"' || ch === "'" || ch === '`')) { inStr = true; strCh = ch; continue; }
      if (inStr) { if (ch === strCh && line[j - 1] !== '\\') inStr = false; continue; }
      if (ch === '/' && line[j + 1] === '/') break;
      if (ch === '/' && line[j + 1] === '*') { inComment = true; j++; continue; }
      if (inComment && ch === '*' && line[j + 1] === '/') { inComment = false; j++; continue; }
      if (inComment) continue;
      if ('{(['.indexOf(ch) >= 0) stack.push({ ch: ch, line: i });
      else if ('})]'.indexOf(ch) >= 0) {
        if (!stack.length) { errors.push({ line: i, msg: 'Unexpected ' + ch }); }
        else if (stack[stack.length - 1].ch !== matchMap[ch]) {
          errors.push({ line: i, msg: 'Mismatched ' + ch });
          stack.pop();
        } else { stack.pop(); }
      }
    }
  }
  while (stack.length) { var it = stack.pop(); errors.push({ line: it.line, msg: 'Unclosed ' + it.ch }); }
  return errors;
}
// ── Keyboard shortcut handler for styled editor ───────────────────────────
function _onStyledKeyDown(e) {
  // Tab key — insert spaces using execCommand to preserve undo stack
  if (e.key === 'Tab') {
    e.preventDefault();
    var ta = e.target;
    ta.focus();
    document.execCommand('insertText', false, '  ');
    _onStyledInput();
    return;
  }
  // Ctrl+F / Ctrl+H
  if (e.ctrlKey && e.key === 'f') { e.preventDefault(); _openFind(false); return; }
  if (e.ctrlKey && e.key === 'h') { e.preventDefault(); _openFind(true);  return; }
}
