# TypeScript & Linter

**Version:** 1.0.0
**Updated:** 2026-04-24
**Status:** Placeholder — to be authored
**AI Confidence:** Low (placeholder)
**Ambiguity:** Low

> *Generic blueprint — no project-specific identifiers. If you find one, file an issue.*

---

## Overview

Defines strict TypeScript settings, the ESLint flat-config (sonarjs + react-hooks + import + no-any + custom guards), Prettier integration, naming conventions (PascalCase / camelCase / SCREAMING_SNAKE_CASE), and the zero-warnings policy enforced in CI.

---

## Files in this folder

| # | File | Description |
|---|------|-------------|
| 01 | [01-typescript-rules.md](./01-typescript-rules.md) | Strict mode, no-any, no-unknown, generic constraints
| 02 | [02-eslint-config.md](./02-eslint-config.md) | Flat-config template, plugin set, custom guards
| 03 | [03-prettier-and-formatting.md](./03-prettier-and-formatting.md) | Prettier config + format-on-save policy
| 04 | [04-naming-conventions.md](./04-naming-conventions.md) | PascalCase / camelCase / SCREAMING_SNAKE_CASE prefixes (ID_, SEL_, ...)
| 05 | [05-zero-warnings-policy.md](./05-zero-warnings-policy.md) | CI enforcement of 0 warnings / 0 errors

---

## Cross-References

| Reference | Location |
|-----------|----------|
| Parent overview | `../00-overview.md` |
| Folder structure rules | `../../01-spec-authoring-guide/01-folder-structure.md` |
