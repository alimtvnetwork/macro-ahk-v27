# Solved Issue: compile-instruction.mjs — LOVABLE_BASE_URL Not Defined

**Resolved**: 2026-04-05
**Version**: v2.5.0
**Severity**: Critical (build-blocking)

## Problem

`compile-instruction.mjs` failed when compiling `marco-sdk/src/instruction.ts`:
```
ReferenceError: LOVABLE_BASE_URL is not defined
```

The SDK instruction file declares `const LOVABLE_BASE_URL = "https://lovable.dev"` before the instruction object, but the build script's preamble regex failed to capture it.

## Root Cause

The preamble const-extraction regex had two issues:

1. **No leading whitespace tolerance**: `^(const\s+\w+)` required the `const` keyword at column 0. Any indentation would cause a miss.
2. **Greedy value capture**: `(.+)` consumed the trailing semicolon, but this was fragile with certain value patterns.

Additionally, the user's local copy of `compile-instruction.mjs` was an older version that lacked the preamble logic entirely (error at line 47 vs current line 61).

## Solution

Updated regex from:
```js
/^(const\s+\w+)\s*(?::\s*\w+)?\s*=\s*(.+);?\s*$/
```
To:
```js
/^\s*(const\s+\w+)\s*(?::\s*\w+)?\s*=\s*(.+?);?\s*$/
```

Changes:
- `^\s*` — tolerate leading whitespace
- `.+?` — non-greedy value capture for safer semicolon handling

## Learning

- Build scripts that parse TypeScript must be defensive about whitespace and formatting variations.
- When line numbers in error traces don't match the current source, the user is running a stale version — the fix must be pushed so they can sync.

## What NOT to Repeat

- Don't use strict `^` anchors in regex meant to parse user-editable source files.
- Don't assume source formatting will remain consistent across files.
