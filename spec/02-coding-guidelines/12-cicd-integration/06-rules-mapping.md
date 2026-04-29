# Rules Mapping — Spec → Check → Severity

> **Version:** 1.0.0
> **Updated:** 2026-04-19

Single source of truth: every CODE RED / STYLE rule, where it is defined
in the spec, which check script enforces it, and what severity each
emits.

---

## CODE RED rules (block merge — SARIF `error`)

| ID | Rule | Spec source | Check script | Phase 1 langs |
|----|------|-------------|--------------|---------------|
| CODE-RED-001 | No nested `if` | `01-cross-language/04-code-style/` | `checks/nested-if/<lang>.py` | go, ts |
| CODE-RED-002 | Boolean naming (Is/Has/Can/Should/Was/Will) | `01-cross-language/02-boolean-principles/` | `checks/boolean-naming/<lang>.py` | go, ts |
| CODE-RED-003 | No magic strings | `01-cross-language/04-code-style/` | `checks/magic-strings/<lang>.py` | go, ts |
| CODE-RED-004 | Function length 8–15 lines | `01-cross-language/04-code-style/` | `checks/function-length/<lang>.py` | go, ts |
| CODE-RED-006 | File length ≤ 300 lines | `01-cross-language/04-code-style/` | `checks/file-length/<lang>.py` | universal |
| CODE-RED-008 | No raw negations in conditions | `01-cross-language/12-no-negatives.md` | `checks/positive-conditions/<lang>.py` | go, ts |

---

## STYLE rules (annotate — SARIF `warning`)

| ID | Rule | Spec source | Check script | Phase 1 langs |
|----|------|-------------|--------------|---------------|
| STYLE-002 | No `else` after `return`/`throw` | `01-cross-language/04-code-style/` | `checks/no-else-after-return/<lang>.py` | go, ts |

---

## Database rules (block merge — SARIF `error`)

| ID | Rule | Spec source | Check script | Phase 1 langs |
|----|------|-------------|--------------|---------------|
| BOOL-NEG-001 | No Not/No-prefixed boolean columns | `04-database-conventions/01-naming-conventions.md` | `checks/boolean-column-negative/sql.py` | sql |
| DB-FREETEXT-001 | **Presence only** — entity tables need `Description`; transactional tables need `Notes`+`Comments` | `04-database-conventions/02-schema-design.md` §6 | `checks/free-text-columns/sql.py` | sql |
| MISSING-DESC-001 | **Strict superset** — presence (Rules 10/11) + nullability (Rule 12) + waiver mechanism. Recommended for new pipelines. | `04-database-conventions/02-schema-design.md` §6 (v3.4.0) | `checks/missing-desc/sql.py` | sql |

> Both DB-FREETEXT-001 and MISSING-DESC-001 share the same classifier
> via `_lib/free_text_columns.py` so they cannot drift apart. Enable
> **only one** in CI to avoid duplicate findings — MISSING-DESC-001 is
> the recommended choice.

---

## Future rules (Phase 2+)

Added to this table as they ship. Removing a rule requires a major
version bump of the linter pack and a deprecation note in
[`03-language-roadmap.md`](./03-language-roadmap.md).

---

*Part of [CI/CD Integration](./00-overview.md)*
