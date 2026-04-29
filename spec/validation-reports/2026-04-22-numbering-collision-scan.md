# Spec-Tree Numbering Collision Scan

**Generated:** 2026-04-22 (Asia/Kuala_Lumpur)
**Scope:** Entire `spec/` tree (excluding `99-archive/`)
**Trigger:** Post-renumbering verification after resolving 6 duplicate-prefix collisions in `spec/22-app-issues/`

---

## Executive summary

| Metric | Count |
|---|---|
| **Hard collisions** (true duplicates) | **8 reported** → **4 resolved 2026-04-22**, 4 remain |
| **Soft collisions** (companion-doc convention) | 9 (OK) |
| **Soft collisions** (unrelated file+dir) | **2 reported** → 1 resolved (slot 16), 1 accepted (slot 99 root) |
| `spec/22-app-issues/` collisions | **0** ✅ (target folder is clean) |

**Headline:** The folder targeted by the recent renumbering work — `spec/22-app-issues/` — is **completely clean**. As of 2026-04-22 a follow-up pass cleared 4 of 8 hard collisions (06 in coding-guidelines, 97/98 in split-db, 97/98 in seedable, plus the earlier slot-00 fix in error-resolution) and the slot-16 cross-language file/dir collision. See **Resolution log** below; the 4 remaining hard collisions (slot 04 in spec-authoring-guide, slot 05 in apperror-reference, slot 01 in powershell-integration, slot 58 in chrome-extension) are unchanged.

---

## ✅ Resolution log — 2026-04-22 follow-up pass

| Collision | Resolution | New location |
|---|---|---|
| Slot 06 in `02-coding-guidelines/` | Renamed `06-cicd-integration/` → `12-cicd-integration/` | `spec/02-coding-guidelines/12-cicd-integration/` |
| Slot 16 in `01-cross-language/` (file vs dir) | Renamed `16-lazy-evaluation-patterns.md` → slot 29 | `spec/02-coding-guidelines/01-cross-language/29-lazy-evaluation-patterns.md` |
| Slot 00 in `01-error-resolution/` | Renamed `00-error-documentation-guideline.md` → `06-…` | `spec/03-error-manage/01-error-resolution/06-error-documentation-guideline.md` |
| Slot 97/98 in `05-split-db-architecture/` | v1.0 brief → `96-acceptance-criteria-legacy.md`; v2.0 GIVEN/WHEN/THEN → `97-acceptance-criteria.md`; `98-changelog.md` retained | folder cleaned |
| Slot 97/98 in `06-seedable-config-architecture/` | Same pattern: v3.2 brief → `96-…-legacy.md`; v3.2 GIVEN/WHEN/THEN → `97-…`; renamed `97-changelog.md` → `98-changelog.md` | folder cleaned |

Inbound references updated in: `12-cicd-pipeline-workflows/00-overview.md`, `12-cicd-pipeline-workflows/01-repo-rename-script.md`, `02-coding-guidelines/00-overview.md`, `05-split-db-architecture/00-overview.md`, `06-seedable-config-architecture/00-overview.md`. The 6 cross-language link sites that referenced lazy-evaluation already pointed to `29-lazy-evaluation-patterns.md` from earlier passes.

---

---

## ✅ `spec/22-app-issues/` — clean

Zero numbering collisions across all 100+ entries. The renumbering work (slots 11→25, 14→26, 15→28, 35→32, 50→33, 91→97) is complete and verified.

---

## 🔴 Hard collisions (8) — same-kind duplicates

These are true duplicates: two files or two directories at the same numeric slot. Each one needs the same playbook used for `22-app-issues`: pick a vacant slot, rename, update inbound references, add a one-line traceability note.

### 1. `spec/01-spec-authoring-guide/` — slot `04`

```
04-ai-onboarding-prompt.md
04-cli-module-template.md
```
**Suggested fix:** Move `04-cli-module-template.md` → next vacant slot in this folder.

### 2. `spec/02-coding-guidelines/` — slot `06`

```
06-ai-optimization/      (directory)
06-cicd-integration/     (directory)
```
**Note:** Both are active subfolders with `00-overview.md`. The CI/CD-integration folder is referenced as `02-coding-guidelines/06-cicd-integration/` from at least 2 specs (overview, repo-rename script). **High inbound-ref count — handle carefully.**

### 3. `spec/03-error-manage/01-error-resolution/` — slot `00`

```
00-error-documentation-guideline.md
00-overview.md
```
**Special:** Slot `00` is reserved for `00-overview.md` per the spec authoring guide. The `00-error-documentation-guideline.md` file violates the convention and should be renumbered (e.g. → `01-error-documentation-guideline.md` if `01-` is free, otherwise next vacant slot).

### 4. `spec/03-error-manage/02-error-architecture/06-apperror-package/01-apperror-reference/` — slot `05`

```
05-apperrtype-enums.md
05-usage-and-adapters.md
```
**Suggested fix:** Move `05-usage-and-adapters.md` → next vacant slot.

### 5. `spec/05-split-db-architecture/` — slot `97`

```
97-acceptance-criteria.md
97-changelog.md
```
**Suggested fix:** Per spec authoring guide, slot `97` is conventionally `acceptance-criteria` and `98` is `changelog`. Rename `97-changelog.md` → `98-changelog.md`.

### 6. `spec/06-seedable-config-architecture/` — slot `97`

```
97-acceptance-criteria.md
97-changelog.md
```
**Same as #5.** Apply identical fix: `97-changelog.md` → `98-changelog.md`.

### 7. `spec/11-powershell-integration/` — slot `01`

```
01-configuration-schema.md
01-template-vs-project-differences.md
```
**Suggested fix:** Move `01-template-vs-project-differences.md` → next vacant slot.

### 8. `spec/21-app/02-features/chrome-extension/` — slot `58`

```
58-dashboard-and-project-enhancements.md
58-updater-system.md
```
**Suggested fix:** Move the later-added file (likely `58-updater-system.md`) to the next vacant slot in the chrome-extension feature folder.

---

## 🟡 Soft collisions (file + directory at same slot)

A file and a folder at the same slot is allowed by the authoring guide **only when the file is a companion overview/index for the folder of the same name** (e.g. `02-features.md` summarising `02-features/`). When the file and directory have unrelated names, this is a true collision.

### ✅ Companion-doc pairs (9, all OK)

| Path | Slot | Files |
|---|---|---|
| `spec/02-coding-guidelines/01-cross-language/` | 02 | `02-boolean-principles` + `02-boolean-principles.md` |
| `spec/02-coding-guidelines/01-cross-language/` | 15 | `15-master-coding-guidelines` + `15-master-coding-guidelines.md` |
| `spec/02-coding-guidelines/03-golang/` | 04 | `04-golang-standards-reference` + `04-golang-standards-reference.md` |
| `spec/02-coding-guidelines/04-php/` | 07 | `07-php-standards-reference` + `07-php-standards-reference.md` |
| `spec/03-error-manage/02-error-architecture/04-error-modal/` | 01 | `01-copy-formats` + `01-copy-formats.md` |
| `spec/03-error-manage/02-error-architecture/04-error-modal/` | 02 | `02-react-components` + `02-react-components.md` |
| `spec/03-error-manage/02-error-architecture/04-error-modal/` | 03 | `03-error-modal-reference` + `03-error-modal-reference.md` |
| `spec/03-error-manage/02-error-architecture/04-error-modal/` | 04 | `04-color-themes` + `04-color-themes.md` |
| `spec/03-error-manage/02-error-architecture/06-apperror-package/` | 01 | `01-apperror-reference` + `01-apperror-reference.md` |

These follow the established companion-doc pattern. **No action needed.**

### ⚠️ Unrelated file+dir pairs (2 — review)

#### A. `spec/` — slot `99`

```
99-archive/                   (directory — frozen historical content)
99-consistency-report.md      (file — root-level health report)
```
**Verdict:** This is **structurally accepted** — the spec authoring guide reserves slot `99` for both archive and consistency-report at the root. Document this exception explicitly in the authoring guide if not already covered. **No move needed.**

#### B. `spec/02-coding-guidelines/01-cross-language/` — slot `16`

```
16-static-analysis/                  (directory)
16-lazy-evaluation-patterns.md       (file — unrelated topic)
```
**Verdict:** True collision — the file and directory cover different topics. **Suggested fix:** rename the file to the next vacant slot (`17-` if free) since the directory is the "anchor" for slot 16.

---

## 📊 Action priority matrix

| Priority | Count | Action |
|---|---|---|
| P0 — Block future renames | 0 | (none) |
| P1 — Fix in current sprint | 7 | Hard collisions #1, #3, #4, #5, #6, #7, #8 |
| P2 — Fix with care (high refs) | 1 | Hard collision #2 (`06-ai-optimization` vs `06-cicd-integration`) |
| P3 — Single-file rename | 1 | Soft collision B (`16-lazy-evaluation-patterns.md`) |
| Skip | 10 | All companion pairs + slot-99 root exception |

**Total actionable:** 9 collisions across 8 directories.

---

## 🛠️ Fixing playbook (proven on `22-app-issues`)

For each hard collision:

1. **Identify free slots** in the parent directory.
2. **Pick which file/dir to keep at original slot** (usually the older, more-referenced one).
3. **Audit inbound references** with `grep -rn "<old-name>" --include="*.md" --include="*.ts" --include="*.tsx" --include="*.json" --include="*.mjs"`.
4. **Rename** the moving file with `code--rename`.
5. **Update headings** inside the renamed file to reflect new slot, with a one-line traceability note: `> Originally filed at slot NN — renumbered to slot MM on YYYY-MM-DD to remove duplicate prefix collision.`
6. **Update all inbound references** in parallel.
7. **Re-run this scan** to confirm zero remaining collisions.

For Hard #2 (`02-coding-guidelines/06-*`), use **extra care** — both subfolders have substantial content and external references. Recommended approach:
- Move `06-cicd-integration/` → `04-cicd-integration/` (slot 04 may be free in this parent — verify first), since CI/CD is the more cross-cutting topic.
- Or leave both at `06-` and **document this as an accepted exception** by introducing the convention "two sibling folders may share a slot prefix when they form a domain pair (e.g. `06-ai-*` + `06-ci-*`)" — **not recommended** as it weakens the guide.

---

## 🔄 How to regenerate this report

```bash
python3 << 'PY'
import os, re, collections, json
ROOT = "spec"
PATTERN = re.compile(r"^(\d{2})-")
hard, soft = [], []
for dirpath, dirnames, filenames in os.walk(ROOT):
    if "/99-archive" in dirpath or dirpath.endswith("/99-archive"):
        dirnames[:] = []; continue
    by_slot = collections.defaultdict(list)
    for d in dirnames:
        m = PATTERN.match(d)
        if m: by_slot[m.group(1)].append((d, "dir"))
    for f in filenames:
        m = PATTERN.match(f)
        if m: by_slot[m.group(1)].append((f, "file"))
    for slot, entries in by_slot.items():
        if len(entries) < 2: continue
        kinds = {k for _, k in entries}
        (hard if len(kinds) == 1 else soft).append((dirpath, slot, entries))
for d, s, e in hard: print(f"HARD {d}/ slot {s}: {[x for x,_ in e]}")
for d, s, e in soft: print(f"SOFT {d}/ slot {s}: {[x for x,_ in e]}")
PY
```

Save the script as `scripts/scan-spec-collisions.py` if it becomes a recurring need.

---

## Cross-references

| Reference | Location |
|---|---|
| Spec authoring guide (numbering rules) | `../01-spec-authoring-guide/00-overview.md` |
| Folder structure rules | `../01-spec-authoring-guide/01-folder-structure.md` |
| Recent reorganization audit | `./2026-04-22-reorganization-audit.md` |
| `22-app-issues` renumbering work (this session) | Slots 11→25, 14→26, 15→28, 35→32, 50→33, 91→97 |
| Spec-folder safeguard | `../../scripts/spec-folder-guard-readme.md` |
