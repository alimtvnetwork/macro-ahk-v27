# Solved Issue: ESLint SonarJS Integration

**Resolved**: 2026-04-01  
**Severity**: Enhancement  

## Problem
No automated code quality enforcement beyond basic ESLint. Large functions, high complexity, and code smells went undetected.

## Root Cause
No static analysis plugin was configured for code quality rules (function size, complexity, code smells).

## Solution
1. Installed `eslint-plugin-sonarjs` as a dev dependency
2. Added to root `eslint.config.js` (flat config) with recommended rules
3. Added to `chrome-extension/.eslintrc.json` (legacy config)
4. Set `max-lines-per-function: 25` (warn) in both
5. Set `sonarjs/cognitive-complexity: 15` (root) and `10` (extension)

## Iteration
- Initially all rules enabled including dead-code detection
- User identified that dead-code rules would false-positive on SDK exports and injected scripts
- Disabled 4 rules: `no-dead-store`, `no-unused-function-argument`, `no-unused-collection`, `sonarjs/no-unused-vars`

## Learning
- **Always consider the runtime consumption model** when enabling static analysis rules. Code that appears dead at compile time may be consumed by injected scripts, SDK exports, or cross-project imports.
- **Discuss rules with the user first** before enforcing — the AI listed all rules for review before integrating.

## What Not to Repeat
- Don't enable dead-code/unused rules in projects with dynamic script injection without first checking for false positives.
- Don't assume all SonarJS rules are appropriate — tune per project architecture.

## Files Changed
- `eslint.config.js`
- `chrome-extension/.eslintrc.json`
- `package.json` (dev dependency added)
