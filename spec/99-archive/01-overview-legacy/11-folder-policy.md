# 11 — Folder Policy

**Last Updated**: 2026-04-06

---

## Rule: Active Codebase Only

**The active codebase is `chrome-extension/`, `src/`, and `standalone-scripts/`.**

All AHK version folders have been moved to `skipped/` and are **read-only archives**. Do NOT read, modify, or reference any files in them:

- ⛔ `skipped/` — All archived AHK folders (DO NOT read, edit, or browse)
- ⛔ `skipped/Archives/` — Original AHK v1 (historical only)
- ⛔ `skipped/marco-script-ahk-v6.55/` — Archived v6.55 baseline
- ⛔ `skipped/marco-script-ahk-v7.9.32/` — Archived v7.9.32 snapshot
- ⛔ `skipped/marco-script-ahk-v7.latest/` — Former active AHK codebase (replaced by Chrome extension)

### AI Instructions

1. **Do NOT read** any file from `skipped/` — not even for reference
2. **Do NOT open** or browse `skipped/` folders
3. **Do NOT copy** code from `skipped/` — all active code is in `chrome-extension/`, `src/`, `standalone-scripts/`
4. **ONLY edit** files inside the active folders listed below
5. **Exception**: Only touch `skipped/` if the user gives a **specific, explicit instruction** to do so

### What CAN Be Edited

- ✅ `chrome-extension/` — Chrome extension source code
- ✅ `src/` — Shared React components and platform adapters
- ✅ `standalone-scripts/` — Standalone JS scripts (macro controller)
- ✅ `spec/` — Shared specification files
- ✅ `.lovable/memory/` — Memory and workflow files
- ✅ `memory/` — PRD and keyboard shortcuts memory
- ✅ Root-level files (`plan.md`, `readme.txt`, etc.)

### Exceptions

- A new major version folder may be created if a full rewrite is requested.
- `skipped/` folders may be referenced **only** if the user explicitly instructs it.

### Why

The project has transitioned from AHK desktop automation to a Chrome extension architecture. The AHK codebase is complete and stable but no longer the active development target. Previous AI sessions repeatedly modified wrong version folders, causing confusion and wasted effort. All AHK folders are now in `skipped/` to prevent this permanently.

---

## Rule: Spec Folder Creation & Numbering

All folders inside `spec/` must follow these rules:

1. **Naming**: lowercase, hyphen-separated, with a two-digit numeric prefix (e.g., `07-chrome-extension/`).
2. **Sequential numbering**: Prefixes must be continuous with no gaps (currently `01`–`12`).
3. **New folders**: Append at the next available number — never insert or reorder existing folders.
4. **Single ownership**: Each topic lives in exactly one folder — no duplication across folders.
5. **Cross-references**: Always use relative paths (e.g., `../08-coding-guidelines/engineering-standards.md`).
6. **Deprecation**: Historical or deprecated specs go to `spec/archive/`, not deleted.

### Current Spec Folder Index

| # | Folder | Purpose |
|---|--------|---------|
| 01 | `01-overview/` | Master docs, architecture, version history, folder policy |
| 02 | `02-app-issues/` | Bug reports, issue tracking, debugging notes |
| 03 | `03-data-and-api/` | Data schemas, API samples, DB join specs, JSON schema guides |
| 04 | `04-tasks/` | Roadmap, task breakdowns, feature planning |
| 05 | `05-design-diagram/` | Diagram design specifications (Mermaid) |
| 06 | `06-macro-controller/` | Macro controller specs: credits, workspaces, UI, TS migrations |
| 07 | `07-chrome-extension/` | Extension architecture, build, message protocol, testing |
| 08 | `08-coding-guidelines/` | Unified coding standards (TS, Go, PHP, Chrome, engineering) |
| 09 | `09-devtools-and-injection/` | DevTools injection, SDK conventions, per-project architecture |
| 10 | `10-features/` | Feature specs: PStore, advanced automation, cross-project sync |
| 11 | `11-imported/` | Imported external specs: error management, WordPress, PowerShell |
| 12 | `12-prompts/` | AI prompt samples and prompt folder structure |
| — | `archive/` | Legacy AHK specs, performance audits, XMind files |
