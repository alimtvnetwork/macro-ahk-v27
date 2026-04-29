# 23 — Coding Guidelines (Master Index)

> **Version**: 1.2.0  
> **Last updated**: 2026-02-28

## Purpose

This document indexes all coding guideline sub-specs for the Chrome Extension. Every AI agent and developer working on this codebase **MUST** read and follow all linked specs before writing any code.

> **⚠️ Pre-Guideline Code Examples**: Code snippets in specs 04, 05, 06, 07, 09, 19, and 20 were written before these coding guidelines were finalized. They contain patterns that violate the rules (e.g., `if (!value)`, bare `catch (err)`, truthy checks, inline compound conditions). When implementing, **always follow these guidelines** — treat code examples in other specs as structural guidance, not copy-paste templates.

---

## Guideline Files

| # | File | Scope |
|---|------|-------|
| 01 | [Naming Conventions](../../../99-archive/duplicates/03-coding-guidelines-stale/03-coding-guidelines-spec/00-overview.md) | Variables, functions, constants, files |
| 02 | [Function Standards](../../../99-archive/duplicates/03-coding-guidelines-stale/03-coding-guidelines-spec/00-overview.md) | Size limits, parameter rules, single responsibility |
| 03 | [Boolean & Condition Logic](../../../99-archive/duplicates/03-coding-guidelines-stale/03-coding-guidelines-spec/01-cross-language/02-boolean-principles.md) | Positive-only conditions, named booleans, no negation in `if` |
| 04 | [Formatting Rules](../../../99-archive/duplicates/03-coding-guidelines-stale/03-coding-guidelines-spec/01-cross-language/04-code-style/00-overview.md) | Line-per-argument, object formatting, line length |
| 05 | [File Organization](../../../99-archive/duplicates/03-coding-guidelines-stale/03-coding-guidelines-spec/00-overview.md) | 200-line limit, module splitting, folder structure |
| 06 | [Project Config Schema](../macro-controller/ts-migration-v2/05a-json-config-pipeline.md) | JSON manifest for script loading order and config bindings |

---

## Core Principles (Summary)

1. **Readable code over clever code** — every variable name tells the reader what it holds
2. **Positive logic only** — no `!`, `not`, or negation at `if` sites; no truthy/falsy checks
3. **Small units** — functions ≤15 lines, files ≤200 lines, parameters ≤3
4. **DRY** — extract shared logic into reusable functions and modules
5. **One thing per line** — object properties, function arguments, and parameters each on their own line
6. **Async discipline** — always `async`/`await`, no `.then()` chains, no fire-and-forget promises
7. **Explicit error handling** — named catch variables, no silent swallows, result types for expected failures
8. **Document exports** — JSDoc on every exported function
9. **Layered dependencies** — shared → background → UI; no circular imports
10. **Schema evolution** — `schemaVersion` field in project configs, chained migrations
11. **Chrome API isolation** — Chrome APIs only in `src/background/`, message passing everywhere else

---

## Enforcement

- **Code review**: Every PR must be checked against all six guideline files
- **AI agents**: Must reference these specs before generating or modifying code
- **Automated linting**: Each guideline file includes an **ESLint Enforcement** section mapping rules to specific ESLint/plugin configs. See individual files for rule names, plugin requirements, and override configurations
- **Required plugins**: `@typescript-eslint/eslint-plugin`, `eslint-plugin-import`, `eslint-plugin-unicorn`, `eslint-plugin-jsdoc`
- **Prettier**: Recommended for formatting rules (FMT1–FMT4, FMT8)

---

## Cross-References

- [Engineering Standards](../../../02-coding-guidelines/00-overview.md) — Project-wide engineering rules
- [Go Boolean Standards](../../../99-archive/duplicates/03-coding-guidelines-stale/03-coding-guidelines-spec/01-cross-language/02-boolean-principles.md) — Parallel boolean rules for Go
- [Go Readable Conditions](../../../99-archive/duplicates/03-coding-guidelines-stale/03-coding-guidelines-spec/01-cross-language/02-boolean-principles/02-guards-and-extraction.md) — Named boolean patterns (RC1–RC4)
- [Build System (Spec 17)](17-build-system.md) — Vite config and project structure
- [Message Protocol (Spec 18)](18-message-protocol.md) — Cross-layer communication types

*Coding guidelines master index v1.2.0 — 2026-02-28*
