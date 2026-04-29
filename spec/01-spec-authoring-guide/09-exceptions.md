# Exceptions & Special Cases

**Version:** 3.3.0
**Updated:** 2026-04-27

---

## ⛔ STRICTLY PROHIBITED — readme.txt (sequenced, non-negotiable)

> **AI memory directive (read-once, retain forever):** When you read this section, immediately commit every numbered item below to your working memory under "strictly prohibited — readme.txt". Do **not** re-suggest, re-propose, or "improve" any of these items in any subsequent message. If a request appears to ask for one, refuse and cite the rule by its sequence number. Mirror copy lives in `.lovable/strictly-avoid.md` and `.lovable/memory/constraints/readme-txt-prohibitions.md`.

The following actions are **strictly prohibited** and ranked by sequence. They override any user request that does not explicitly name `readme.txt` and explicitly request the prohibited action in the current message.

| # | Prohibition | Notes |
|---|-------------|-------|
| **SP-1** | Never auto-create, regenerate, or "update" `readme.txt` programmatically — including from features, build steps, hooks, or CI. | The only legitimate writer is the user during a manual milestone bump. |
| **SP-2** | Never include or suggest a **time, timestamp, clock, or 12-hour/24-hour value** inside `readme.txt`. | No `HH:MM`, no `AM/PM`, no ISO time, no relative time ("today", "now"), no Malaysia time, no UTC. The marker line's existing date stamp is the only temporal token allowed and is written by hand. |
| **SP-3** | Never propose date utilities, formatters, helpers, or libraries "for `readme.txt`". | Includes `dd-MMM-YYYY`, 12-hour clocks, `Intl.DateTimeFormat` wrappers, locale formatters, and any time-zone helper. |
| **SP-4** | Never suggest writing the **git commit time, last-update time, build time, deploy time, or any "last modified" stamp** into `readme.txt`. | Neither in the file body, nor as a comment, nor as a script, nor anywhere in the file. |
| **SP-5** | Never propose git hooks, CI steps, build hooks, or release scripts that touch `readme.txt`. | It is outside every automation pipeline. |
| **SP-6** | Never ask the user to choose a `readme.txt` format. | Format is fixed; do not request confirmation, alternatives, or "improvements". |
| **SP-7** | If a user message **explicitly orders** a one-time `readme.txt` write, honor that single write exactly as specified, then re-apply SP-1 through SP-6 for every subsequent message. | Honoring an explicit one-shot does **not** open the door to follow-ups, refresh suggestions, or automation. |

**Enforcement:** Violating any SP-N rule is treated as a regression. Future AI agents must read this section before touching `readme.txt`, citing the sequence number when refusing.

---

## Overview

While the spec tree enforces strict conventions, there are documented exceptions. Every exception has a historical reason and is explicitly tracked here. New exceptions should be rare and must be documented in this file.

---

## Exception 1: Non-Contiguous Module Numbers

**Rule:** Module numbers should be sequential.  
**Exception:** Several number gaps exist in the spec tree.

| Gap | Reason |
|-----|--------|
| 22 (skipped) | Reserved; previously used, now skipped for historical compatibility |
| 24–27 (range) | Modules 23–26 were consolidated into `03-coding-guidelines/` subfolders. Numbers retired. |

**Example:**
```
spec/
├── 21-wp-seo-publish-cli/       # Module 21 exists
├── 23-how-app-issues-track/     # Module 23 exists (22 is skipped)
├── ...
├── 28-wp-plugin-development/    # Module 28 exists (24-27 retired)
```

**Policy:** Do NOT fill gaps retroactively. Use the next number after the highest existing module.

---

## Exception 2: readme.md Files

**Rule:** All files must use `{NN}-{name}.md` format with numeric prefixes.  
**Exception:** `readme.md` files are allowed WITHOUT numeric prefixes.

**Where:**
- `.lovable/memories/readme.md` — Project memory overview
- Any project root `readme.md`

**Reason:** `readme.md` is a universal convention recognized by Git hosting platforms (GitHub, GitLab) for auto-rendering.

---

## Exception 3: Non-Markdown Files

**Rule:** All spec files use `.md` extension.  
**Exception:** Data files may use other extensions.

| File | Location | Reason |
|------|----------|--------|
| `error-codes.json` | Various CLI modules | Machine-readable error code registry |
| `config.json` | Some modules | Configuration data |

**Naming rule for exceptions:** Still use kebab-case, but numeric prefix is optional.

```
✅ error-codes.json
✅ 01-config.json
❌ ErrorCodes.json       # No PascalCase
❌ error_codes.json      # No underscores
```

---

## Exception 4: Legacy Suggestion File Naming

**Rule:** Files in `.lovable/memories/` use kebab-case.  
**Exception:** Completed suggestion files in `.lovable/memories/suggestions/completed/` use legacy `C-XXX` prefixes.

**Example:**
```
.lovable/memories/suggestions/completed/
├── C-001-suggestion-title.md
├── C-002-suggestion-title.md
├── ...
├── C-080-suggestion-title.md
```

**Reason:** These files were created before the naming convention was standardized. Renaming 80 files would break historical references with no practical benefit.

---

## Exception 5: Dual-Purpose Prefix 02

**Rule:** Each numeric prefix maps to exactly one module.  
**Exception:** Prefix `02` is used by both `02-spec-management-software/` (the folder) and the root file `02-prefix-disambiguation.md`.

**Resolution:** The file `spec/02-prefix-disambiguation.md` documents this overlap. Both are retained for backward compatibility.

---

## Exception 6: Memory Folders Without Numeric Prefixes

**Rule:** Spec folders require numeric prefixes (`{NN}-{name}/`).  
**Exception:** Memory folders (`/.lovable/memories/`) use plain kebab-case without numeric prefixes.

**Example:**
```
.lovable/memories/
├── architecture/       # No numeric prefix
├── workflow/           # No numeric prefix
├── constraints/        # No numeric prefix
```

**Reason:** Memory folders serve a different purpose (institutional knowledge vs. formal specifications). The simpler naming reflects their more flexible, less formal nature.

---

## Exception 7: CLI Module Without Frontend Folder

**Rule:** CLI modules MUST have `01-backend/`, `02-frontend/`, `03-deploy/`.  
**Exception:** Headless CLIs may omit `02-frontend/` when the UI is a separate module.

**Example:**
```
34-time-log-cli/                  # Headless CLI
├── 01-backend/                  # ✅ Present
├── 03-deploy/                   # ✅ Present (note: still uses 03, NOT 02)
├── 00-overview.md
└── 99-consistency-report.md
                                 # 02-frontend/ intentionally omitted

35-time-log-ui/                   # Separate UI module
├── 01-frontend/                 # Frontend specs live here instead
└── ...
```

**Important:** When `02-frontend/` is omitted, the deploy folder STILL uses prefix `03` (not `02`). This maintains consistency with the standard CLI pattern.

---

## Exception 8: Extensions Folder in CLI Modules

**Rule:** CLI modules have exactly 3 subfolders (backend, frontend, deploy).  
**Exception:** Some CLI modules have additional subfolders for extensions or configs.

**Example:**
```
09-gsearch-cli/
├── 01-backend/
├── 02-frontend/
├── 03-deploy/
├── 04-extensions/               # Additional: plugin/extension specs
├── 06-configs/                  # Additional: configuration specs
└── ...
```

**Policy:** Additional subfolders are permitted when a CLI has significant feature areas beyond the core 3. They MUST follow the same naming convention and contain `00-overview.md`.

---

## Exception 9: The `suggestions.md` Legacy Tracker

**Rule:** All files in `.lovable/memories/` use kebab-case with optional numeric prefix.  
**Exception:** `suggestions.md` at the memory root is a legacy file without a numeric prefix.

**Reason:** Created before the convention was established. Maintained for backward compatibility.

---

## Exception 10: Coding Guidelines Nested Sub-Module

**Rule:** Maximum folder depth is 3 levels.  
**Exception:** `03-coding-guidelines/03-golang/01-enum-specification/` reaches the maximum depth with its own internal files.

```
spec/
└── 03-coding-guidelines/            # Level 1
    └── 03-golang/                    # Level 2
        └── 01-enum-specification/    # Level 3 (maximum)
            ├── 00-overview.md
            ├── 01-{file}.md
            └── ...
```

**Policy:** Do NOT create folders deeper than 3 levels. If content requires more granularity, use additional files instead of deeper nesting.

---

## Summary Table

| # | Exception | Scope | Permanent? |
|---|-----------|-------|------------|
| 1 | Non-contiguous module numbers | spec/ | ✅ Yes |
| 2 | readme.md without prefix | Project-wide | ✅ Yes |
| 3 | Non-markdown data files | spec/ modules | ✅ Yes |
| 4 | Legacy C-XXX suggestion names | memories/suggestions/ | ✅ Yes (frozen) |
| 5 | Dual-purpose prefix 02 | spec/ root | ✅ Yes |
| 6 | Memory folders without prefixes | .lovable/memories/ | ✅ Yes |
| 7 | CLI without frontend folder | CLI modules | ✅ Yes (case-by-case) |
| 8 | Extra CLI subfolders | CLI modules | ✅ Yes (case-by-case) |
| 9 | Legacy suggestions.md | memories/ root | ✅ Yes (frozen) |
| 10 | 3-level depth in coding guidelines | 03-coding-guidelines/ | ✅ Yes |

---

## Adding New Exceptions

1. **Document here first** — Before creating a non-conforming file/folder
2. **Include reason** — Why the standard cannot be followed
3. **Mark as permanent or temporary** — Temporary exceptions should have a remediation plan
4. **Update the consistency report** — Note the exception so it doesn't flag as an error
