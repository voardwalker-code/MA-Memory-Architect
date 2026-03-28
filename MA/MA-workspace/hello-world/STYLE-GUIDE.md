# Hello World — Code Style Guide

> Canonical style rules for every file in the over-engineered Hello World pipeline.
> All 5 existing source modules follow these rules. New modules MUST match.

---

## 1. File Structure

Every source file follows this exact section order:

```
1. Header banner        // ── Pipeline · ModuleName ──────...
2. Block comment        // HOW ... WORKS:  (plain-English explanation)
3. 'use strict';
4. Imports section      // ── Imports ──────...
5. Constants section    // ── Constants ──────...
6. Core logic section   // ── Core Logic ──────...  (or domain-specific name)
7. Pipeline stage fn    // ── Pipeline Stage Function ──────...  (if applicable)
8. Exports section      // ── Exports ──────...
```

---

## 2. Banner & Section Dividers

- **File header banner**: `// ── Pipeline · ModuleName ──` padded with `─` to column 80
- **Section dividers**: `// ── Section Name ──` padded with `─` to column 80
- **Function doc blocks**: boxed with `// ─────...` top and bottom (column 80)

Example:
```js
// ── Pipeline · Decoder ────────────────────────────────────────────────────────
```

---

## 3. Strict Mode

Every file begins executable code with:
```js
'use strict';
```

---

## 4. Strings

- **Single quotes** for all strings: `'hello'` not `"hello"`
- **String concatenation** with `+` operator (no template literals)
- Error messages use single quotes internally: `'moduleName.fnName: reason'`

---

## 5. Semicolons

- **Always use semicolons** — no ASI reliance

---

## 6. Indentation

- **2 spaces** — no tabs, no 4-space

---

## 7. Variable Declarations

- Use `const` by default; `let` only when reassignment is needed
- **Never use `var`**
- Align related declarations with padding when it aids readability:
  ```js
  const fs   = require('fs');
  const path = require('path');
  ```

---

## 8. Error Messages

All thrown errors follow the pattern:
```
'moduleName.functionName: human-readable reason'
```

Examples:
```js
throw new Error('encoder.encodeBase64: input must be a string, got ' + typeof str);
throw new Error('validator.validateShape: config must be a non-null, non-array object');
```

---

## 9. Function Documentation

Every exported function has a boxed doc comment immediately above it:

```js
// ─────────────────────────────────────────────────────────────────────────────
// functionName(param1, param2)
//
// Plain-English description of what the function does.
//
//   param1 — description
//   param2 — description
//   Returns: description
//   Throws: description
// ─────────────────────────────────────────────────────────────────────────────
```

---

## 10. Algorithm Comments

Every non-trivial function includes an `// ALGORITHM:` block listing numbered steps:

```js
  // ALGORITHM:
  // 1. Validate input
  // 2. Transform data
  // 3. Return result
```

---

## 11. Imports

- Use destructuring for `require()`:
  ```js
  const { createLogEntry, isValidEncoding } = require('./contracts');
  ```
- Group imports: Node.js built-ins first, then local modules

---

## 12. Exports

- Single `module.exports = { ... }` at the bottom of the file
- Group exports with comments:
  ```js
  module.exports = {
    // Constants
    PIPELINE_VERSION,

    // Functions
    computeChecksum,
    buildMetadata,
    process: processState
  };
  ```

---

## 13. Immutability

- Pipeline stage functions **never mutate** their input state
- Always return a new object via `Object.assign({}, state, { ... })`
- Log arrays grow via `.concat()`, not `.push()`

---

## 14. Validation Pattern

Every public function validates its inputs at the top:

```js
if (typeof str !== 'string') {
  throw new Error('module.fn: input must be a string, got ' + typeof str);
}
```

---

## 15. Loops

- Use `for` loops with explicit index (`for (let i = 0; ...)`)
- Avoid `forEach`, `map`, `filter` in core pipeline code (consistency)

---

## 16. Test Files

- Same header banner style as source files
- Minimal test harness: `test(name, fn)`, `assert(value, msg)`, `assertThrows(fn, substr)`
- Group tests with `console.log('\nSectionName:');`
- End with pass/fail summary and `process.exit()`

---

## 17. Line Length

- Soft limit: **80 columns** (banners are exactly 80)
- Hard limit: **100 columns** (long strings may exceed 80 but not 100)

---

## 18. Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Constants | `UPPER_SNAKE_CASE` | `MAX_MESSAGE_LENGTH` |
| Functions | `camelCase` | `computeChecksum` |
| Local variables | `camelCase` | `majorVersion` |
| File names | `kebab-case.js` | `output-handler.js` |
| Module prefix in errors | `lowercase` | `'encoder.encode:'` |

---

## Checklist for New Modules

- [ ] Header banner matches pattern
- [ ] `'use strict';` is present
- [ ] Section dividers match pattern
- [ ] All strings use single quotes
- [ ] All statements end with semicolons
- [ ] Indentation is 2 spaces
- [ ] Error messages use `'moduleName.fnName: reason'`
- [ ] Functions have boxed doc comments
- [ ] Algorithm steps are numbered
- [ ] Inputs are validated at function entry
- [ ] State is never mutated (new objects returned)
- [ ] Exports are at the bottom in a single block
- [ ] No `var`, no template literals, no `forEach`
