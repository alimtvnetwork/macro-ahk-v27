# Macro Recorder

**Version:** 1.0.0
**Updated:** 2026-04-26
**Status:** Planned (Phase 01 of 12 complete)
**AI Confidence:** Medium
**Ambiguity:** Low

---

## Overview

The Macro Recorder is an in-extension authoring tool that captures user
interactions on a target page (clicks, typing, selections), stores them as
structured `Step` rows linked to a `Project`, and lets the user bind input
columns from dropped CSV/JSON files into individual steps. The recorded
project is replayable through the existing macro-controller runtime and is
exportable as a portable artifact.

This module covers the **end-to-end authoring flow**: toolbar control,
XPath capture engine, data-source ingestion, field-binding overlay, step
persistence, project visualisation, inline JavaScript steps, and the
LLM authoring guide.

The companion module `../32-app-performance/` covers the codebase
performance and end-to-end testing improvements committed alongside the
recorder.

---

## Keywords

`macro-recorder` · `xpath` · `csv-binding` · `step-graph` · `replay` · `chrome-extension`

---

## Scoring

| Metric | Value |
|--------|-------|
| AI Confidence | Medium |
| Ambiguity | Low |
| Health Score | 100/100 |

---

## Files

| # | File | Description |
|---|------|-------------|
| 00 | [00-overview.md](./00-overview.md) | This index |
| 01 | [01-glossary.md](./01-glossary.md) | Canonical terms used across the recorder |
| 02 | [02-phases.md](./02-phases.md) | 12-phase implementation plan + status |
| 16 | [16-step-group-library.md](./16-step-group-library.md) | Step Group Library — nested groups, RunGroup step, batch run, ZIP import/export via SQLite |
| 16 | [16-step-group-library-erd.md](./16-step-group-library-erd.md) | ERD + invariants for the Step Group Library |
| 17 | [17-hover-highlighter-and-data-controllers.md](./17-hover-highlighter-and-data-controllers.md) | Hover highlighter, CSV/JSON/JS/Endpoint data sources, endpoint scheduler + HttpRequest step |
| 18 | [18-conditional-elements.md](./18-conditional-elements.md) | Compound boolean condition trees, inline Gate, Condition step kind, branching/routing |
| 19 | [19-url-tabs-appearance-waits-conditions.md](./19-url-tabs-appearance-waits-conditions.md) | URL-based tab clicks, element-appearance waiting contract, XPath/CSS condition rules + acceptance criteria |
| 99 | [99-consistency-report.md](./99-consistency-report.md) | Module health snapshot |

Future files (added per phase):

| Phase | Planned File |
|-------|--------------|
| 03 | `03-data-model.md` + `03-erd.md` |
| 04 | `04-backend-provisioning.md` |
| 05 | `05-toolbar-recording-ux.md` (or link to existing `26-chrome-extension-generic/06-ui-and-design-system/10-toolbar-recording-ux.md`) |
| 06 | `06-xpath-capture-engine.md` |
| 07 | `07-data-source-drop-zone.md` |
| 08 | `08-field-reference-wrapper.md` |
| 09 | `09-step-persistence-and-replay.md` |
| 10 | `10-project-visualisation.md` |
| 11 | `11-inline-js-step.md` |
| 12 | `llm-guide.md` + `97-acceptance-criteria.md` |

---

## Cross-References

| Reference | Location |
|-----------|----------|
| App performance + testing companion | `../32-app-performance/00-overview.md` |
| Toolbar recording UX (Phase 05 seed) | `../26-chrome-extension-generic/06-ui-and-design-system/10-toolbar-recording-ux.md` |
| XPath capture E2E (Phase 06/12 seed) | `../../tests/e2e/e2e-21-xpath-capture.spec.ts` |
| XPath strategies source | `../../src/content-scripts/xpath-strategies.ts` |
| Folder structure rules | `../01-spec-authoring-guide/01-folder-structure.md` |
| Required files | `../01-spec-authoring-guide/03-required-files.md` |
