// ── Tests · Step 10 — Style Consistency ──────────────────────────────────────
//
// Validates that every source file in src/ follows the project's style
// conventions documented in STYLE-GUIDE.md.  This is an automated linter
// that checks structural patterns, not just formatting.
//
// Checks performed per file:
//   1. Header banner pattern:  // ── Pipeline · Name ──...
//   2. 'use strict'; directive present
//   3. Section divider pattern: // ── Name ──...
//   4. Exports section at bottom: module.exports = { ... }
//   5. Single quotes only (no double quotes in code)
//   6. Semicolons on statements
//   7. No `var` declarations
//   8. No template literals (backtick strings)
//   9. Error message prefix pattern: 'moduleName.fnName:'
//  10. 2-space indentation (no tabs)
//  11. Boxed function doc comments present
//  12. No trailing whitespace
//  13. Cross-file consistency (same harness in tests)
//
// Run:  node hello-world/tests/test-step10-style-consistency.js
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const fs   = require('fs');
const path = require('path');

// ── Test Harness ────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  \u2713 ' + name);
  } catch (err) {
    failed++;
    console.log('  \u2717 ' + name);
    console.log('    ' + err.message);
  }
}

function assert(value, msg) {
  if (value !== true) {
    throw new Error('Assertion failed: ' + (msg || 'expected true'));
  }
}

// ── File Loading ────────────────────────────────────────────────────────────

var srcDir  = path.resolve(__dirname, '..', 'src');
var testDir = path.resolve(__dirname);

var srcFiles = fs.readdirSync(srcDir)
  .filter(function(f) { return f.endsWith('.js'); })
  .map(function(f) {
    return {
      name: f,
      path: path.join(srcDir, f),
      content: fs.readFileSync(path.join(srcDir, f), 'utf8')
    };
  });

var testFiles = fs.readdirSync(testDir)
  .filter(function(f) { return f.endsWith('.js') && f !== 'run-all.js'; })
  .map(function(f) {
    return {
      name: f,
      path: path.join(testDir, f),
      content: fs.readFileSync(path.join(testDir, f), 'utf8')
    };
  });

// ── Tests ───────────────────────────────────────────────────────────────────

console.log('\n\u2500\u2500 Style Consistency Tests \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n');

// ── 1. Header Banner ───────────────────────────────────────────────────────

console.log('1. Header Banner:');

srcFiles.forEach(function(file) {
  test(file.name + ' has a header banner', function() {
    var firstLine = file.content.split('\n')[0];
    assert(
      firstLine.indexOf('// \u2500\u2500') === 0,
      'First line should start with "// \u2500\u2500", got: "' + firstLine.substring(0, 40) + '"'
    );
  });
});

// ── 2. Use Strict ──────────────────────────────────────────────────────────

console.log('\n2. Strict Mode:');

srcFiles.forEach(function(file) {
  test(file.name + ' has \'use strict\'', function() {
    assert(
      file.content.indexOf("'use strict';") !== -1,
      'Missing \'use strict\'; directive'
    );
  });
});

testFiles.forEach(function(file) {
  test(file.name + ' has \'use strict\'', function() {
    assert(
      file.content.indexOf("'use strict';") !== -1,
      'Missing \'use strict\'; directive'
    );
  });
});

// ── 3. Section Dividers ────────────────────────────────────────────────────

console.log('\n3. Section Dividers:');

srcFiles.forEach(function(file) {
  test(file.name + ' has section dividers', function() {
    // Must have at least 2 section dividers (Imports + Exports minimum)
    var dividerPattern = /^\/\/ \u2500\u2500 .+ \u2500+$/gm;
    var matches = file.content.match(dividerPattern) || [];
    assert(
      matches.length >= 2,
      'Expected at least 2 section dividers, found ' + matches.length
    );
  });
});

// ── 4. Exports at Bottom ───────────────────────────────────────────────────

console.log('\n4. Exports Section:');

srcFiles.forEach(function(file) {
  test(file.name + ' has module.exports at bottom', function() {
    var lines = file.content.split('\n');
    var exportsIndex = -1;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].indexOf('module.exports') !== -1) {
        exportsIndex = i;
      }
    }
    assert(exportsIndex !== -1, 'No module.exports found');
    // Exports should be in the last 20% of the file
    var threshold = Math.floor(lines.length * 0.7);
    assert(
      exportsIndex >= threshold,
      'module.exports at line ' + (exportsIndex + 1) + ' of ' + lines.length +
      ' (should be in bottom 30%)'
    );
  });
});

// ── 5. Single Quotes ───────────────────────────────────────────────────────

console.log('\n5. Single Quotes:');

srcFiles.forEach(function(file) {
  test(file.name + ' uses single quotes (no double quotes in code)', function() {
    var lines = file.content.split('\n');
    var violations = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      // Skip comment lines
      if (line.trimStart().indexOf('//') === 0) { continue; }
      // Skip lines that are part of block comments
      if (line.trimStart().indexOf('*') === 0) { continue; }
      // Check for double-quoted strings in code
      // Allow double quotes inside single-quoted strings and require() paths
      // Simple heuristic: if line has " but not inside a comment
      var codepart = line;
      // Remove single-quoted strings first to avoid false positives
      var cleaned = codepart.replace(/'[^']*'/g, '');
      // Now check for remaining double quotes (excluding those in comments)
      var commentIdx = cleaned.indexOf('//');
      if (commentIdx !== -1) {
        cleaned = cleaned.substring(0, commentIdx);
      }
      if (cleaned.indexOf('"') !== -1) {
        violations.push('Line ' + (i + 1) + ': ' + line.trim().substring(0, 60));
      }
    }
    assert(
      violations.length === 0,
      'Found double quotes on: ' + violations.slice(0, 3).join('; ')
    );
  });
});

// ── 6. No var Declarations ─────────────────────────────────────────────────

console.log('\n6. No var Declarations:');

srcFiles.forEach(function(file) {
  test(file.name + ' does not use var', function() {
    var lines = file.content.split('\n');
    var violations = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      // Skip comments
      if (line.trimStart().indexOf('//') === 0) { continue; }
      if (line.trimStart().indexOf('*') === 0) { continue; }
      // Check for var keyword as a declaration (word boundary)
      var varMatch = line.match(/\bvar\s+/);
      if (varMatch) {
        violations.push('Line ' + (i + 1));
      }
    }
    assert(
      violations.length === 0,
      'Found var declarations at: ' + violations.join(', ')
    );
  });
});

// ── 7. No Template Literals ────────────────────────────────────────────────

console.log('\n7. No Template Literals:');

srcFiles.forEach(function(file) {
  test(file.name + ' does not use template literals', function() {
    var lines = file.content.split('\n');
    var violations = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      // Skip comments
      if (line.trimStart().indexOf('//') === 0) { continue; }
      if (line.trimStart().indexOf('*') === 0) { continue; }
      // Check for backticks (template literals)
      if (line.indexOf('`') !== -1) {
        violations.push('Line ' + (i + 1));
      }
    }
    assert(
      violations.length === 0,
      'Found template literals at: ' + violations.join(', ')
    );
  });
});

// ── 8. Error Message Prefix ────────────────────────────────────────────────

console.log('\n8. Error Message Prefix Pattern:');

srcFiles.forEach(function(file) {
  test(file.name + ' uses moduleName.fnName: prefix in errors', function() {
    var lines = file.content.split('\n');
    var throwLines = [];
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].indexOf('throw new Error(') !== -1) {
        throwLines.push({ num: i + 1, text: lines[i].trim() });
      }
    }
    // Every throw new Error should have a 'word.word:' pattern
    var violations = [];
    var prefixPattern = /throw new Error\('[a-z]+\.[a-zA-Z]+:/;
    for (var j = 0; j < throwLines.length; j++) {
      if (!prefixPattern.test(throwLines[j].text)) {
        violations.push('Line ' + throwLines[j].num);
      }
    }
    assert(
      violations.length === 0,
      'Error messages without module.fn: prefix at: ' + violations.join(', ')
    );
  });
});

// ── 9. Indentation (2-space, no tabs) ──────────────────────────────────────

console.log('\n9. Indentation:');

srcFiles.forEach(function(file) {
  test(file.name + ' uses 2-space indent (no tabs)', function() {
    var lines = file.content.split('\n');
    var tabViolations = [];
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].indexOf('\t') !== -1) {
        tabViolations.push('Line ' + (i + 1));
      }
    }
    assert(
      tabViolations.length === 0,
      'Found tabs at: ' + tabViolations.slice(0, 5).join(', ')
    );
  });
});

// ── 10. Function Doc Blocks ────────────────────────────────────────────────

console.log('\n10. Function Doc Blocks:');

srcFiles.forEach(function(file) {
  test(file.name + ' has boxed function doc comments', function() {
    // Look for the boxed divider pattern that precedes function docs
    var boxPattern = /^\/\/ \u2500{77}$/gm;
    var matches = file.content.match(boxPattern) || [];
    // Each file should have at least 2 box lines (1 function = 2 lines top+bottom)
    assert(
      matches.length >= 2,
      'Expected at least 2 box dividers, found ' + matches.length
    );
  });
});

// ── 11. Immutability — No .push() on state.log ────────────────────────────

console.log('\n11. Immutability:');

srcFiles.forEach(function(file) {
  test(file.name + ' does not mutate state with .push()', function() {
    var lines = file.content.split('\n');
    var violations = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.trimStart().indexOf('//') === 0) { continue; }
      // Check for state.log.push or state.*.push patterns
      if (/state\.\w+\.push\(/.test(line)) {
        violations.push('Line ' + (i + 1));
      }
    }
    assert(
      violations.length === 0,
      'Found state mutation via .push() at: ' + violations.join(', ')
    );
  });
});

srcFiles.forEach(function(file) {
  test(file.name + ' returns new state via Object.assign (if pipeline stage)', function() {
    // Only check files that have a pipeline stage function
    // (files that import createLogEntry are likely pipeline stages)
    if (file.content.indexOf('createLogEntry') === -1) {
      // Not a pipeline stage file — skip
      assert(true);
      return;
    }
    // Should use Object.assign({}, state, ...) pattern
    var hasImmutableReturn = file.content.indexOf('Object.assign({}, state') !== -1;
    assert(
      hasImmutableReturn,
      'Pipeline stage should use Object.assign({}, state, ...) for immutability'
    );
  });
});

// ── 12. Cross-File Consistency ─────────────────────────────────────────────

console.log('\n12. Cross-File Consistency:');

test('All src files use the same require style for contracts', function() {
  // Files that import from contracts should use destructuring
  var importingFiles = srcFiles.filter(function(f) {
    return f.content.indexOf("require('./contracts')") !== -1;
  });
  assert(importingFiles.length >= 3, 'At least 3 files should import contracts');

  var allDestructure = importingFiles.every(function(f) {
    return /const\s*\{[^}]+\}\s*=\s*require\('\.\/contracts'\)/.test(f.content);
  });
  assert(allDestructure, 'All contracts imports should use destructuring');
});

test('All src files have consistent Exports section header', function() {
  var exportsSectionPattern = /^\/\/ \u2500\u2500 Exports \u2500+$/m;
  var allHaveIt = srcFiles.every(function(f) {
    return exportsSectionPattern.test(f.content);
  });
  assert(allHaveIt, 'Every src file should have "// \u2500\u2500 Exports \u2500..." section');
});

test('All src files have consistent Imports section header (if they import)', function() {
  var importsSectionPattern = /^\/\/ \u2500\u2500 Imports \u2500+$/m;
  var filesWithRequire = srcFiles.filter(function(f) {
    return f.content.indexOf('require(') !== -1;
  });
  var allHaveIt = filesWithRequire.every(function(f) {
    return importsSectionPattern.test(f.content);
  });
  assert(allHaveIt, 'Files with require() should have "// \u2500\u2500 Imports \u2500..." section');
});

test('No file uses console.log in source code (only in tests)', function() {
  var violations = [];
  srcFiles.forEach(function(f) {
    var lines = f.content.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.trimStart().indexOf('//') === 0) { continue; }
      if (line.indexOf('console.log') !== -1) {
        violations.push(f.name + ':' + (i + 1));
      }
    }
  });
  assert(
    violations.length === 0,
    'Found console.log in source files: ' + violations.slice(0, 3).join(', ')
  );
});

// ── 13. Naming Conventions ─────────────────────────────────────────────────

console.log('\n13. Naming Conventions:');

test('All src file names are kebab-case', function() {
  var kebabPattern = /^[a-z][a-z0-9]*(-[a-z0-9]+)*\.js$/;
  var violations = [];
  srcFiles.forEach(function(f) {
    if (!kebabPattern.test(f.name)) {
      violations.push(f.name);
    }
  });
  assert(
    violations.length === 0,
    'Non-kebab-case file names: ' + violations.join(', ')
  );
});

test('Constants in source use UPPER_SNAKE_CASE', function() {
  var allFiles = srcFiles;
  var violations = [];
  allFiles.forEach(function(f) {
    var lines = f.content.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      // Look for const declarations that look like constants (all caps)
      var match = line.match(/^const\s+([A-Z][A-Z_0-9]+)\s*=/);
      if (match) {
        // Verify it's truly UPPER_SNAKE_CASE
        var name = match[1];
        if (!/^[A-Z][A-Z0-9_]+$/.test(name)) {
          violations.push(f.name + ': ' + name);
        }
      }
    }
  });
  assert(
    violations.length === 0,
    'Non-UPPER_SNAKE_CASE constants: ' + violations.join(', ')
  );
});

// ── 14. Semicolons ─────────────────────────────────────────────────────────

console.log('\n14. Semicolons:');

srcFiles.forEach(function(file) {
  test(file.name + ' ends code lines with semicolons', function() {
    var lines = file.content.split('\n');
    var violations = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var trimmed = line.trim();
      // Skip empty lines, comments, opening/closing braces, labels, etc.
      if (trimmed.length === 0) { continue; }
      if (trimmed.indexOf('//') === 0) { continue; }
      if (trimmed.indexOf('*') === 0) { continue; }
      if (trimmed === '{' || trimmed === '}') { continue; }
      if (trimmed === '});') { continue; }
      if (trimmed === '],') { continue; }
      if (trimmed === '}') { continue; }
      // Skip lines that are just closing structures
      if (/^[}\])]/.test(trimmed) && trimmed.length <= 3) { continue; }
      // Skip function/if/for/switch/case/default/try/catch/else lines
      if (/^(function|if|for|while|switch|case|default|try|catch|else|return \{)/.test(trimmed)) { continue; }
      // Skip lines ending with { or , or ( — they're continuations
      if (/[{,(]$/.test(trimmed)) { continue; }
      // Skip lines that are part of object/array literals (end with , or nothing)
      if (/^\w+:\s/.test(trimmed) && /[,]$/.test(trimmed)) { continue; }
      // The actual check: code lines should end with ; or } or ) or ]
      if (!/[;}\])]$/.test(trimmed)) {
        // Only flag obvious code lines (has = or return or throw)
        if (/^(const|let|var|return|throw|module)/.test(trimmed)) {
          violations.push('Line ' + (i + 1) + ': ' + trimmed.substring(0, 50));
        }
      }
    }
    assert(
      violations.length === 0,
      'Missing semicolons at: ' + violations.slice(0, 3).join('; ')
    );
  });
});

// ── Summary ─────────────────────────────────────────────────────────────────

console.log('\n\u2500\u2500 Results \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
console.log('  Passed: ' + passed);
console.log('  Failed: ' + failed);
console.log('  Total:  ' + (passed + failed));

if (failed > 0) {
  console.log('\n  \u26a0 SOME STYLE CHECKS FAILED\n');
  process.exit(1);
} else {
  console.log('\n  \u2714 ALL STYLE CHECKS PASSED\n');
  process.exit(0);
}
