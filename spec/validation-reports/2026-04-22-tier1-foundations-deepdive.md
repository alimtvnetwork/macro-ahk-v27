# Spec Deep-Dive — Tier 1 (Foundations 01–20)

**Generated:** 2026-04-22 (Asia/Kuala_Lumpur)
**Scope:** `spec/01-*` through `spec/20-*` only
**Methodology:** Folder-by-folder check against the **new structural rules** locked in 2026-04-22:
- Slots 01–20 = **foundations only** (universal, project-agnostic)
- App content forbidden in this range
- Macro-controller will be promoted to top-level slot 26 (Tier 2)
- Chrome-extension stays inside `21-app/` but renamed to `01-chrome-extension/` (Tier 2)

---

## 📊 Tier-1 health summary

| Slot | Folder | Status | Issues |
|---|---|---|---|
| 01 | `01-spec-authoring-guide/` | 🟡 1 hard | Duplicate slot 04 |
| 02 | `02-coding-guidelines/` | 🟡 1 hard + 1 low | Duplicate slot 06; 2 non-numbered files |
| 03 | `03-error-manage/` | 🟡 2 hard + 1 low | Duplicate slot 00 + slot 05 (deep); 1 non-numbered file |
| 04 | `04-database-conventions/` | ✅ Clean | — |
| 05 | `05-split-db-architecture/` | 🟡 1 hard | Duplicate slot 97 |
| 06 | `06-seedable-config-architecture/` | 🟡 1 hard | Duplicate slot 97 (same pattern as 05) |
| 07 | `07-design-system/` | ✅ Clean | — |
| 08 | `08-docs-viewer-ui/` | ⚠️ Stub | Empty (`.lovable-keep` only) |
| 09 | `09-code-block-system/` | ✅ Clean | — |
| 10 | `10-research/` | ✅ Clean | — |
| 11 | `11-powershell-integration/` | 🟡 1 hard + 1 low | Duplicate slot 01; 2 non-numbered files |
| 12 | `12-cicd-pipeline-workflows/` | ✅ Clean | (Just got `01-repo-rename-script.md`) |
| 13 | — | ⚪ Reserved | Vacant — OK |
| 14 | `14-update/` | ✅ Clean | — |
| 15–16 | — | ⚪ Reserved | Vacant — OK |
| 17 | `17-consolidated-guidelines/` | ✅ Clean | — |
| 18–20 | — | ⚪ Reserved | Vacant per new rule — OK |

**Totals**: 11 issues — **7 HARD** (collisions), **3 LOW** (naming), **1 INFO** (stub).
Clean folders: **6 of 14** (43%). No app-content leakage detected in foundations range. ✅

---

## 🔴 Hard issues (7) — duplicate-prefix collisions

Each one needs the same playbook proven on `22-app-issues`: pick the keeper, move the other to the next vacant slot, update inbound refs, add traceability note.

### F1 — `spec/01-spec-authoring-guide/` slot 04

```
04-ai-onboarding-prompt.md
04-cli-module-template.md
```

**Suggested fix:** vacant slots in folder are likely 05+. Move `04-cli-module-template.md` → `05-cli-module-template.md` (need to check if 05 is free first).

**Risk:** LOW. The authoring-guide folder is mostly self-contained.

---

### F2 — `spec/02-coding-guidelines/` slot 06

```
06-ai-optimization/      (directory)
06-cicd-integration/     (directory)
```

**Suggested fix:** Both are active subfolders with internal content + heavy inbound references. Move `06-cicd-integration/` → next vacant slot (likely `07-cicd-integration/` or higher). The `cicd-integration` folder is referenced from `spec/12-cicd-pipeline-workflows/01-repo-rename-script.md` and the master overview.

**Risk:** MEDIUM-HIGH. ~6 inbound references to audit. Recommend doing this one with explicit approval, separately.

---

### F3 — `spec/03-error-manage/01-error-resolution/` slot 00

```
00-error-documentation-guideline.md
00-overview.md
```

**Suggested fix:** Slot `00-` is **reserved** for `00-overview.md` per the authoring guide. Rename `00-error-documentation-guideline.md` → `01-error-documentation-guideline.md` (if 01 free; check first).

**Risk:** LOW. Convention-violation fix, makes the folder compliant.

---

### F4 — `spec/03-error-manage/02-error-architecture/06-apperror-package/01-apperror-reference/` slot 05

```
05-apperrtype-enums.md
05-usage-and-adapters.md
```

**Suggested fix:** Move `05-usage-and-adapters.md` → next vacant slot in the `01-apperror-reference/` folder.

**Risk:** LOW. Deep nested folder, narrow audience.

---

### F5 — `spec/05-split-db-architecture/` slot 97

```
97-acceptance-criteria.md
97-changelog.md
```

**Suggested fix:** Per authoring guide, slot `97 = acceptance-criteria`, slot `98 = changelog`. **Trivial rename:** `97-changelog.md` → `98-changelog.md`.

**Risk:** TRIVIAL. Almost certainly zero inbound refs. **Recommend doing this first.**

---

### F6 — `spec/06-seedable-config-architecture/` slot 97

Same pattern as F5. **Same trivial fix:** `97-changelog.md` → `98-changelog.md`.

**Risk:** TRIVIAL.

---

### F7 — `spec/11-powershell-integration/` slot 01

```
01-configuration-schema.md
01-template-vs-project-differences.md
```

**Suggested fix:** Move `01-template-vs-project-differences.md` → next vacant slot (check 02-13).

**Risk:** LOW-MEDIUM. PowerShell folder is freshly imported, may have some internal cross-refs.

---

## 🟡 Low-severity issues (3) — non-numbered files at folder root

These break the "every meaningful file should have a numeric prefix" convention. Two acceptable exceptions exist: `readme.md` and `00-overview.md`. Anything else at root is a smell.

### L1 — `spec/02-coding-guidelines/`

```
consolidated-review-guide-condensed.md
consolidated-review-guide.md
```

**Suggested fix:** Either:
- (a) **Number them**: rename to next vacant slots (e.g. `18-consolidated-review-guide.md`, `19-consolidated-review-guide-condensed.md`).
- (b) **Move into `17-consolidated-guidelines/`** if they belong there (currently a stub).
- (c) **Convert to `readme.md`** if one is meant to be the folder's intro.

**Recommendation:** Option (b) — they look like canonical fits for the `17-consolidated-guidelines/` stub.

---

### L2 — `spec/03-error-manage/`

```
structure.md
```

**Suggested fix:** Rename → `00-overview.md` if it's the folder intro, or `00-structure.md`/next-numbered slot if it's content. Need to read first to decide.

---

### L3 — `spec/11-powershell-integration/`

```
changelog.md
parallel-work-sync-output.md
```

**Suggested fix:**
- `changelog.md` → `98-changelog.md` (per authoring-guide convention).
- `parallel-work-sync-output.md` looks like a one-off scratch file — review for archival to `99-archive/` or rename to numbered slot.

---

## ⚪ Stub & reserved slots — informational

### `08-docs-viewer-ui/` (stub, only `.lovable-keep`)

Reserved by safeguard but no content yet. **Action:** Either fill with at least a `00-overview.md` describing scope, or leave as protected stub. Currently safeguarded against auto-cleanup. ✅ no action required.

### Vacant slots: 13, 15, 16, 18, 19, 20

All vacant per the new strict 01–20 foundations rule. **Action:** None — these are reserved gaps.

---

## ✅ Clean foundations folders (6)

- `04-database-conventions/` (9 md files, no issues)
- `07-design-system/` (16 md files, no issues)
- `09-code-block-system/`
- `10-research/`
- `12-cicd-pipeline-workflows/` (newly active, 1 spec + overview + consistency)
- `14-update/`
- `17-consolidated-guidelines/`

These pass all checks: have `00-overview.md`, no duplicate prefixes, all root files numbered, no app-content leakage.

---

## 🎯 Recommended fix order for Tier 1

| Step | Issue | Risk | Why this order |
|---|---|---|---|
| 1 | F5 + F6 (`97-changelog.md` → `98-`) | TRIVIAL | Zero inbound refs. Pure rename. Builds confidence. |
| 2 | F3 (`00-error-documentation-guideline.md` → `01-`) | LOW | Fixes a convention violation. |
| 3 | F4 (deep nested slot 05) | LOW | Narrow audience. |
| 4 | F1 (`04-cli-module-template.md` → `05-`) | LOW | Authoring-guide internal. |
| 5 | F7 (`11-powershell-integration` slot 01) | LOW-MED | Fresh import — verify refs. |
| 6 | L1, L2, L3 (non-numbered files) | LOW | Cleanup pass. |
| 7 | F2 (`06-ai-optimization` vs `06-cicd-integration`) | MED-HIGH | Most inbound refs — do last with explicit approval. |

**Estimated total effort:** 8 atomic renames + ~15 inbound-reference updates = one focused work session.

---

## ❓ Questions before proceeding

1. **F2 keeper choice:** When resolving the `06-ai-optimization/` vs `06-cicd-integration/` collision, which should keep slot 06? My recommendation: keep `06-ai-optimization/` (older, more cross-references) and move `06-cicd-integration/` → next free slot.
2. **L1 destination:** Move the two `consolidated-review-guide*.md` files into `17-consolidated-guidelines/`, or number them in place? (Recommend: into `17-`.)
3. **L3 disposition:** Is `parallel-work-sync-output.md` an active artifact, or scratch from earlier work that should go to `99-archive/`?

---

## ▶️ Next step

Reply with one of:

- **"Apply steps 1–6"** → I'll fix everything except F2 in parallel.
- **"Apply step N"** → I'll fix only that issue.
- **"Move to Tier 2 first"** → I'll generate the Tier-2 (apps 21+) report including the macro-controller promotion and chrome-extension rename.
- **Answer the 3 questions above** → I'll incorporate and re-plan.

---

## Cross-references

- Slot rules memory: `mem://architecture/spec-slot-rules`
- Prior collision scan: `./2026-04-22-numbering-collision-scan.md`
- `22-app-issues` renumbering precedent: same playbook applied
- Spec authoring guide: `../01-spec-authoring-guide/00-overview.md`
