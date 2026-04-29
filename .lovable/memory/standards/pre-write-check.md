---
name: Pre-write standards check
description: Always read .lovable/memory/standards/ + a sibling file before writing any new code
type: preference
---

Before writing or rewriting any file under `src/`, `standalone-scripts/`, `chrome-extension/`, or `scripts/`, the agent MUST:

1. List `.lovable/memory/standards/` and read every standard whose name overlaps the change being made (search by keyword: `error`, `css`, `import`, `cast`, `class`, `return`, `naming`, `lint`, etc.).
2. List the target folder and read at least one sibling file in the same folder to inherit local conventions (file layout, naming, imports, test pattern).
3. Restate in the response which standards apply and how the new file complies — so the user can audit at a glance before approving.

**Why**: 2026-04-24 banner-hider RCA — agent wrote `!important`, error-swallowing, inline `<style>`, free functions, magic strings, and type casts because it skipped the existing standards. Every one of those failures had a memory rule that would have prevented it.

**How to apply**: Treat this as a hard precondition, not a courtesy. Do not write the file until both reads have happened and the compliance restatement is in the response.
