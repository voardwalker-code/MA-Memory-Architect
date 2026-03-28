// ── Pipeline · Responsive Design ──────────────────────────────────────────────
//
// HOW RESPONSIVE DESIGN WORKS:
// In a web app, "responsive design" means adapting layout to screen size.
// In an over-engineered CLI pipeline, it means adapting output formatting
// to the terminal dimensions.  Because if we're going to print
// "Hello, World!" we should make sure it looks good on a 40-column
// mobile terminal, an 80-column tablet terminal, AND a 200-column
// ultrawide desktop terminal.
//
// BREAKPOINTS:
// We define three breakpoints based on terminal column width, borrowing
// the naming convention from CSS media queries:
//
//   mobile  — columns < 50   (narrow terminal, SSH on phone, tmux pane)
//   tablet  — 50 <= columns < 100  (standard 80-col terminal, split pane)
//   desktop — columns >= 100 (wide terminal, ultrawide monitor, full screen)
//
// Each breakpoint defines layout constraints:
//   maxWidth     — maximum content width for that breakpoint
//   padding      — horizontal padding (spaces) on each side
//   borderStyle  — which border characters to use (none / light / heavy)
//   bannerScale  — multiplier for banner decorations
//   truncate     — whether to truncate long lines
//
// TERMINAL DETECTION:
// We detect the terminal size using process.stdout.columns and
// process.stdout.rows.  If stdout is not a TTY (e.g. piped to a file),
// we fall back to sensible defaults (80 columns, 24 rows).
//
// ADAPTIVE FORMATTING:
// The module provides functions that take a formatted string and adapt
// it for the current (or specified) viewport:
//   - Reflows bordered output to fit the available width
//   - Adjusts padding for narrow terminals
//   - Truncates or wraps long lines as appropriate
//   - Scales banner decorations up or down
//
// WHAT USES THIS:
//   formatter.js   — calls getViewport() and adaptOutput() to adjust display
//   output-handler.js — may call getViewport() for layout decisions
//   main.js        — can pass viewport overrides for testing
//
// EXPORTS:
//   BREAKPOINTS                    — the three breakpoint definitions
//   DEFAULT_VIEWPORT               — fallback viewport (80x24)
//   getTerminalSize()              → { columns, rows } from the actual terminal
//   getViewport(overrides?)        → full viewport object with breakpoint info
//   getBreakpointName(columns)     → 'mobile' | 'tablet' | 'desktop'
//   getBreakpointConfig(name)      → config object for that breakpoint
//   wrapText(str, maxWidth)        → string with lines wrapped at maxWidth
//   truncateText(str, maxWidth, ellipsis?) → truncated string
//   padCenter(str, width)          → center-padded string
//   padLeft(str, width)            → left-padded string
//   buildResponsiveBorder(content, viewport) → bordered string adapted to viewport
//   adaptOutput(formattedStr, viewport?) → string adapted for current viewport
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

// ── Imports ─────────────────────────────────────────────────────────────────

const { createLogEntry } = require('./contracts');

// ── Constants ───────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// BREAKPOINTS
//
// Three responsive breakpoints modelled after CSS media query conventions.
// Each breakpoint defines how content should be laid out at that width.
//
//   mobile:  Narrow terminals (phone SSH, tiny tmux pane)
//            - Minimal padding, no heavy borders, truncate long lines
//   tablet:  Standard terminals (80-column default, split panes)
//            - Moderate padding, light borders, wrap long lines
//   desktop: Wide terminals (ultrawide monitors, full-screen terminals)
//            - Generous padding, heavy borders, no truncation needed
// ─────────────────────────────────────────────────────────────────────────────
const BREAKPOINTS = {
  mobile: {
    name:        'mobile',
    minColumns:  0,
    maxColumns:  49,
    maxWidth:    40,
    padding:     1,
    borderStyle: 'none',
    bannerScale: 0.5,
    truncate:    true
  },
  tablet: {
    name:        'tablet',
    minColumns:  50,
    maxColumns:  99,
    maxWidth:    76,
    padding:     2,
    borderStyle: 'light',
    bannerScale: 1.0,
    truncate:    false
  },
  desktop: {
    name:        'desktop',
    minColumns:  100,
    maxColumns:  Infinity,
    maxWidth:    120,
    padding:     4,
    borderStyle: 'heavy',
    bannerScale: 1.5,
    truncate:    false
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// BORDER_CHARS
//
// Character sets for different border styles.  'none' uses empty strings
// so the output has no visible border.  'light' uses standard box-drawing
// characters.  'heavy' uses double-line box-drawing characters.
// ─────────────────────────────────────────────────────────────────────────────
const BORDER_CHARS = {
  none: {
    topLeft:     '',
    topRight:    '',
    bottomLeft:  '',
    bottomRight: '',
    horizontal:  '',
    vertical:    '',
    padding:     ''
  },
  light: {
    topLeft:     '+',
    topRight:    '+',
    bottomLeft:  '+',
    bottomRight: '+',
    horizontal:  '-',
    vertical:    '|',
    padding:     ' '
  },
  heavy: {
    topLeft:     '#',
    topRight:    '#',
    bottomLeft:  '#',
    bottomRight: '#',
    horizontal:  '=',
    vertical:    '#',
    padding:     ' '
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT_VIEWPORT
//
// Fallback viewport when terminal size cannot be detected (e.g. when
// stdout is piped to a file or when running in a non-TTY environment).
// 80x24 is the classic VT100 terminal size — the "safe" assumption.
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_VIEWPORT = {
  columns: 80,
  rows:    24
};

// ── Core Logic ──────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// getTerminalSize()
//
// Reads the actual terminal dimensions from process.stdout.  If stdout
// is not a TTY (piped, redirected, etc.), returns the DEFAULT_VIEWPORT.
//
//   Returns: { columns: number, rows: number }
// ─────────────────────────────────────────────────────────────────────────────
function getTerminalSize() {
  // ALGORITHM:
  // 1. Check if process.stdout exists and has isTTY === true
  // 2. If TTY, read process.stdout.columns and process.stdout.rows
  //    a. If either is falsy or not a number, use the default
  // 3. If not TTY, return DEFAULT_VIEWPORT
  // 4. Return { columns, rows }

  if (process.stdout && process.stdout.isTTY === true) {
    var cols = process.stdout.columns;
    var rows = process.stdout.rows;

    if (typeof cols !== 'number' || cols <= 0) {
      cols = DEFAULT_VIEWPORT.columns;
    }
    if (typeof rows !== 'number' || rows <= 0) {
      rows = DEFAULT_VIEWPORT.rows;
    }

    return { columns: cols, rows: rows };
  }

  return { columns: DEFAULT_VIEWPORT.columns, rows: DEFAULT_VIEWPORT.rows };
}

// ─────────────────────────────────────────────────────────────────────────────
// getBreakpointName(columns)
//
// Determines which breakpoint a given column width falls into.
//
//   columns — the terminal width in columns
//   Returns: 'mobile' | 'tablet' | 'desktop'
//   Throws:  if columns is not a positive number
// ─────────────────────────────────────────────────────────────────────────────
function getBreakpointName(columns) {
  // ALGORITHM:
  // 1. Validate columns is a positive number — throw if not
  // 2. If columns < 50, return 'mobile'
  // 3. If columns < 100, return 'tablet'
  // 4. Otherwise, return 'desktop'

  if (typeof columns !== 'number' || columns <= 0 || isNaN(columns)) {
    throw new Error(
      'responsive.getBreakpointName: columns must be a positive number, got ' +
      columns
    );
  }

  if (columns < 50) {
    return 'mobile';
  }
  if (columns < 100) {
    return 'tablet';
  }
  return 'desktop';
}

// ─────────────────────────────────────────────────────────────────────────────
// getBreakpointConfig(name)
//
// Returns the full configuration object for a named breakpoint.
//
//   name — 'mobile', 'tablet', or 'desktop'
//   Returns: the breakpoint config object
//   Throws:  if name is not a valid breakpoint
// ─────────────────────────────────────────────────────────────────────────────
function getBreakpointConfig(name) {
  // ALGORITHM:
  // 1. Validate name is a string — throw if not
  // 2. Look up name in BREAKPOINTS — throw if not found
  // 3. Return a shallow copy of the breakpoint config

  if (typeof name !== 'string') {
    throw new Error(
      'responsive.getBreakpointConfig: name must be a string, got ' + typeof name
    );
  }

  if (!BREAKPOINTS[name]) {
    throw new Error(
      'responsive.getBreakpointConfig: unknown breakpoint "' + name +
      '". Valid: mobile, tablet, desktop'
    );
  }

  return Object.assign({}, BREAKPOINTS[name]);
}

// ─────────────────────────────────────────────────────────────────────────────
// getViewport(overrides?)
//
// Builds a complete viewport descriptor by detecting the terminal size
// and resolving the appropriate breakpoint.  Overrides allow testing
// with specific dimensions without needing a real terminal.
//
//   overrides — optional { columns, rows } to use instead of detection
//   Returns:  { columns, rows, breakpoint, config }
// ─────────────────────────────────────────────────────────────────────────────
function getViewport(overrides) {
  // ALGORITHM:
  // 1. Get terminal size (or use overrides if provided)
  // 2. Determine breakpoint name from columns
  // 3. Get breakpoint config
  // 4. Return combined viewport object

  var size;
  if (overrides && typeof overrides === 'object') {
    size = {
      columns: (typeof overrides.columns === 'number' && overrides.columns > 0)
        ? overrides.columns
        : DEFAULT_VIEWPORT.columns,
      rows: (typeof overrides.rows === 'number' && overrides.rows > 0)
        ? overrides.rows
        : DEFAULT_VIEWPORT.rows
    };
  } else {
    size = getTerminalSize();
  }

  var bpName   = getBreakpointName(size.columns);
  var bpConfig = getBreakpointConfig(bpName);

  return {
    columns:    size.columns,
    rows:       size.rows,
    breakpoint: bpName,
    config:     bpConfig
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// wrapText(str, maxWidth)
//
// Wraps a string to fit within a maximum width, breaking at word
// boundaries where possible.  If a single word exceeds maxWidth,
// it is broken mid-word with a hyphen.
//
//   str      — the string to wrap
//   maxWidth — maximum line width in characters
//   Returns: the wrapped string with newlines inserted
//   Throws:  if str is not a string
//   Throws:  if maxWidth is not a positive number
// ─────────────────────────────────────────────────────────────────────────────
function wrapText(str, maxWidth) {
  // ALGORITHM:
  // 1. Validate str is a string — throw if not
  // 2. Validate maxWidth is a positive integer — throw if not
  // 3. If str is empty, return ''
  // 4. Split str into existing lines by '\n'
  // 5. For each line:
  //    a. If line.length <= maxWidth, keep as-is
  //    b. Otherwise, split into words by spaces
  //    c. Build wrapped lines by adding words until maxWidth is reached
  //    d. If a single word > maxWidth, break it with hyphen
  // 6. Join all lines with '\n' and return

  if (typeof str !== 'string') {
    throw new Error('responsive.wrapText: str must be a string, got ' + typeof str);
  }

  if (typeof maxWidth !== 'number' || maxWidth < 1 || !Number.isInteger(maxWidth)) {
    throw new Error(
      'responsive.wrapText: maxWidth must be a positive integer, got ' + maxWidth
    );
  }

  if (str.length === 0) {
    return '';
  }

  var inputLines = str.split('\n');
  var outputLines = [];

  for (let i = 0; i < inputLines.length; i++) {
    var line = inputLines[i];

    if (line.length <= maxWidth) {
      outputLines.push(line);
      continue;
    }

    // Word-wrap this line
    var words = line.split(' ');
    var currentLine = '';

    for (let w = 0; w < words.length; w++) {
      var word = words[w];

      // Handle words longer than maxWidth — break with hyphen
      if (word.length > maxWidth) {
        // Flush current line if non-empty
        if (currentLine.length > 0) {
          outputLines.push(currentLine);
          currentLine = '';
        }
        // Break the long word into chunks
        var remaining = word;
        while (remaining.length > maxWidth) {
          outputLines.push(remaining.slice(0, maxWidth - 1) + '-');
          remaining = remaining.slice(maxWidth - 1);
        }
        currentLine = remaining;
        continue;
      }

      // Normal word — does it fit on the current line?
      if (currentLine.length === 0) {
        currentLine = word;
      } else if (currentLine.length + 1 + word.length <= maxWidth) {
        currentLine = currentLine + ' ' + word;
      } else {
        // Start a new line
        outputLines.push(currentLine);
        currentLine = word;
      }
    }

    // Flush the last line
    if (currentLine.length > 0) {
      outputLines.push(currentLine);
    }
  }

  return outputLines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// truncateText(str, maxWidth, ellipsis?)
//
// Truncates a string to fit within maxWidth, appending an ellipsis
// indicator if truncation occurred.
//
//   str      — the string to truncate
//   maxWidth — maximum length in characters
//   ellipsis — the truncation indicator (default: '...')
//   Returns: the truncated string (or original if it fits)
//   Throws:  if str is not a string
//   Throws:  if maxWidth is not a positive number
// ─────────────────────────────────────────────────────────────────────────────
function truncateText(str, maxWidth, ellipsis) {
  // ALGORITHM:
  // 1. Validate str is a string — throw if not
  // 2. Validate maxWidth is a positive integer — throw if not
  // 3. Default ellipsis to '...' if not provided
  // 4. If str.length <= maxWidth, return str unchanged
  // 5. If maxWidth <= ellipsis.length, return ellipsis truncated to maxWidth
  // 6. Return str.slice(0, maxWidth - ellipsis.length) + ellipsis

  if (typeof str !== 'string') {
    throw new Error(
      'responsive.truncateText: str must be a string, got ' + typeof str
    );
  }

  if (typeof maxWidth !== 'number' || maxWidth < 1 || !Number.isInteger(maxWidth)) {
    throw new Error(
      'responsive.truncateText: maxWidth must be a positive integer, got ' + maxWidth
    );
  }

  var ell = (typeof ellipsis === 'string') ? ellipsis : '...';

  if (str.length <= maxWidth) {
    return str;
  }

  if (maxWidth <= ell.length) {
    return ell.slice(0, maxWidth);
  }

  return str.slice(0, maxWidth - ell.length) + ell;
}

// ─────────────────────────────────────────────────────────────────────────────
// padCenter(str, width)
//
// Centers a string within a given width by adding spaces on both sides.
// If the string is longer than width, it is returned unchanged.
//
//   str   — the string to center
//   width — the total width to center within
//   Returns: the center-padded string
//   Throws:  if str is not a string
//   Throws:  if width is not a positive number
// ─────────────────────────────────────────────────────────────────────────────
function padCenter(str, width) {
  // ALGORITHM:
  // 1. Validate str is a string — throw if not
  // 2. Validate width is a positive integer — throw if not
  // 3. If str.length >= width, return str
  // 4. Compute total padding = width - str.length
  // 5. Left padding = floor(total / 2)
  // 6. Right padding = total - left
  // 7. Return leftPad + str + rightPad

  if (typeof str !== 'string') {
    throw new Error('responsive.padCenter: str must be a string, got ' + typeof str);
  }

  if (typeof width !== 'number' || width < 1 || !Number.isInteger(width)) {
    throw new Error(
      'responsive.padCenter: width must be a positive integer, got ' + width
    );
  }

  if (str.length >= width) {
    return str;
  }

  var totalPad = width - str.length;
  var leftPad  = Math.floor(totalPad / 2);
  var rightPad = totalPad - leftPad;

  var spaces = '';
  for (let i = 0; i < leftPad; i++) {
    spaces += ' ';
  }
  var result = spaces + str;
  for (let i = 0; i < rightPad; i++) {
    result += ' ';
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// padLeft(str, width)
//
// Left-pads a string with spaces to reach the specified width.
// If the string is already at or beyond the width, returns it unchanged.
//
//   str   — the string to pad
//   width — the minimum width
//   Returns: the left-padded string
//   Throws:  if str is not a string
//   Throws:  if width is not a positive number
// ─────────────────────────────────────────────────────────────────────────────
function padLeft(str, width) {
  // ALGORITHM:
  // 1. Validate str is a string — throw if not
  // 2. Validate width is a positive integer — throw if not
  // 3. If str.length >= width, return str
  // 4. Build padding string of (width - str.length) spaces
  // 5. Return padding + str

  if (typeof str !== 'string') {
    throw new Error('responsive.padLeft: str must be a string, got ' + typeof str);
  }

  if (typeof width !== 'number' || width < 1 || !Number.isInteger(width)) {
    throw new Error(
      'responsive.padLeft: width must be a positive integer, got ' + width
    );
  }

  if (str.length >= width) {
    return str;
  }

  var pad = '';
  var needed = width - str.length;
  for (let i = 0; i < needed; i++) {
    pad += ' ';
  }

  return pad + str;
}

// ─────────────────────────────────────────────────────────────────────────────
// buildResponsiveBorder(content, viewport)
//
// Wraps content in a border that adapts to the viewport breakpoint.
// Mobile gets no border (just the content).  Tablet gets a light
// ASCII border.  Desktop gets a heavy double-line border.
//
//   content  — the string content to border
//   viewport — viewport object from getViewport()
//   Returns: the bordered string
//   Throws:  if content is not a string
//   Throws:  if viewport is not a valid viewport object
// ─────────────────────────────────────────────────────────────────────────────
function buildResponsiveBorder(content, viewport) {
  // ALGORITHM:
  // 1. Validate content is a string — throw if not
  // 2. Validate viewport is a valid object — throw if not
  // 3. Get border style from viewport config
  // 4. If borderStyle is 'none', return content with padding only
  // 5. Get border characters for the style
  // 6. Split content into lines
  // 7. Find the longest line length
  // 8. Compute inner width = min(longest line, viewport.config.maxWidth) + 2*padding
  // 9. Build top border line
  // 10. Build each content line with vertical borders and padding
  // 11. Build bottom border line
  // 12. Join and return

  if (typeof content !== 'string') {
    throw new Error(
      'responsive.buildResponsiveBorder: content must be a string, got ' +
      typeof content
    );
  }

  if (!viewport || typeof viewport !== 'object' || !viewport.config) {
    throw new Error(
      'responsive.buildResponsiveBorder: viewport must be a valid viewport object'
    );
  }

  var bpConfig    = viewport.config;
  var borderStyle = bpConfig.borderStyle || 'none';
  var padding     = bpConfig.padding || 0;
  var maxWidth    = bpConfig.maxWidth || 80;

  // For 'none' style, just add padding
  if (borderStyle === 'none') {
    var lines = content.split('\n');
    var padStr = '';
    for (let p = 0; p < padding; p++) {
      padStr += ' ';
    }
    var paddedLines = [];
    for (let i = 0; i < lines.length; i++) {
      paddedLines.push(padStr + lines[i]);
    }
    return paddedLines.join('\n');
  }

  var chars = BORDER_CHARS[borderStyle] || BORDER_CHARS.light;
  var contentLines = content.split('\n');

  // Find longest line
  var longestLine = 0;
  for (let i = 0; i < contentLines.length; i++) {
    if (contentLines[i].length > longestLine) {
      longestLine = contentLines[i].length;
    }
  }

  // Inner width: content + padding on each side
  var innerWidth = Math.min(longestLine, maxWidth) + (padding * 2);

  // Build top border
  var topBorder = chars.topLeft;
  for (let i = 0; i < innerWidth; i++) {
    topBorder += chars.horizontal;
  }
  topBorder += chars.topRight;

  // Build content lines
  var borderedLines = [topBorder];
  var padStr = '';
  for (let p = 0; p < padding; p++) {
    padStr += chars.padding;
  }

  for (let i = 0; i < contentLines.length; i++) {
    var line = contentLines[i];
    // Truncate or pad the line to fit inner width minus padding
    var contentWidth = innerWidth - (padding * 2);
    if (line.length > contentWidth) {
      line = line.slice(0, contentWidth);
    }
    // Right-pad to fill the content width
    while (line.length < contentWidth) {
      line += ' ';
    }
    borderedLines.push(chars.vertical + padStr + line + padStr + chars.vertical);
  }

  // Build bottom border
  var bottomBorder = chars.bottomLeft;
  for (let i = 0; i < innerWidth; i++) {
    bottomBorder += chars.horizontal;
  }
  bottomBorder += chars.bottomRight;
  borderedLines.push(bottomBorder);

  return borderedLines.join('\n');
}

// ── Pipeline Integration ────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// adaptOutput(formattedStr, viewport?)
//
// The main entry point for responsive adaptation.  Takes a formatted
// string (from the Formatter module) and adapts it for the current or
// specified viewport.
//
// Adaptation rules by breakpoint:
//   mobile:  truncate lines, no border, minimal padding
//   tablet:  wrap lines, light border, moderate padding
//   desktop: no wrapping needed, heavy border, generous padding
//
//   formattedStr — the formatted string to adapt
//   viewport     — optional viewport override (for testing)
//   Returns: the adapted string ready for output
//   Throws:  if formattedStr is not a string
// ─────────────────────────────────────────────────────────────────────────────
function adaptOutput(formattedStr, viewport) {
  // ALGORITHM:
  // 1. Validate formattedStr is a string — throw if not
  // 2. Get viewport (from param or auto-detect)
  // 3. Get breakpoint config from viewport
  // 4. If breakpoint is mobile and truncate is true:
  //    a. Split into lines
  //    b. Truncate each line to maxWidth
  //    c. Rejoin
  // 5. If breakpoint is tablet:
  //    a. Wrap text to maxWidth
  // 6. If breakpoint is desktop:
  //    a. No text modification needed (already fits)
  // 7. Build responsive border around the content
  // 8. Return the bordered, adapted string

  if (typeof formattedStr !== 'string') {
    throw new Error(
      'responsive.adaptOutput: formattedStr must be a string, got ' +
      typeof formattedStr
    );
  }

  var vp = viewport || getViewport();
  var bpConfig = vp.config;
  var adapted = formattedStr;

  // Mobile: truncate lines
  if (vp.breakpoint === 'mobile' && bpConfig.truncate === true) {
    var lines = adapted.split('\n');
    var truncatedLines = [];
    for (let i = 0; i < lines.length; i++) {
      truncatedLines.push(truncateText(lines[i], bpConfig.maxWidth));
    }
    adapted = truncatedLines.join('\n');
  }

  // Tablet: wrap text
  if (vp.breakpoint === 'tablet') {
    adapted = wrapText(adapted, bpConfig.maxWidth);
  }

  // Desktop: no text modification needed — content fits
  // (but we still apply the border below)

  // Build responsive border
  var bordered = buildResponsiveBorder(adapted, vp);

  return bordered;
}

// ── Pipeline Stage Function ─────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// responsive(state)
//
// Pipeline stage function.  Reads state.formatted, adapts it for the
// current viewport, and writes the result to state.responsive.
//
//   state — PipelineState with `formatted` field set
//   Returns: updated PipelineState with `responsive` field set
//   Throws:  if state is invalid or formatted is missing
// ─────────────────────────────────────────────────────────────────────────────
function responsiveStage(state) {
  // ALGORITHM:
  // 1. Validate state is a non-null object — throw if not
  // 2. Validate state.formatted is a non-empty string — throw if not
  // 3. Get viewport (from state.config.viewport or auto-detect)
  // 4. Adapt the formatted output for the viewport
  // 5. Create a log entry
  // 6. Return new state with responsive field set

  if (!state || typeof state !== 'object') {
    throw new Error('responsive.responsive: state must be a non-null object');
  }

  if (typeof state.formatted !== 'string' || state.formatted.length === 0) {
    throw new Error(
      'responsive.responsive: state.formatted must be a non-empty string'
    );
  }

  var viewportOverrides = null;
  if (state.config && state.config.viewport) {
    viewportOverrides = state.config.viewport;
  }

  var vp = getViewport(viewportOverrides);
  var adapted = adaptOutput(state.formatted, vp);

  var logEntry = createLogEntry(
    'responsive',
    'ok',
    'Adapted output for ' + vp.breakpoint + ' viewport (' +
    vp.columns + 'x' + vp.rows + ')'
  );

  var newLog = (state.log || []).concat([logEntry]);

  return Object.assign({}, state, {
    responsive: adapted,
    log:        newLog
  });
}

// ── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  // Constants
  BREAKPOINTS,
  BORDER_CHARS,
  DEFAULT_VIEWPORT,

  // Detection
  getTerminalSize,
  getBreakpointName,
  getBreakpointConfig,
  getViewport,

  // Text utilities
  wrapText,
  truncateText,
  padCenter,
  padLeft,

  // Responsive formatting
  buildResponsiveBorder,
  adaptOutput,

  // Pipeline stage
  responsive: responsiveStage
};
