# Phase 06 — XPath Capture Engine

**Version:** 1.0.0
**Updated:** 2026-04-26
**Status:** ✅ Complete

---

## Goal

Convert a raw click during recording into a fully-projected `RecorderCapture`
payload that contains every selector projection a Step row will need:

| Field | Source |
|-------|--------|
| `XPathFull` | Priority strategy: `id` → `data-testid` → `role+text` → positional |
| `XPathRelative` | Positional path from the auto-detected anchor (`./…`) |
| `AnchorXPath` | Full XPath of the auto-detected anchor element |
| `Strategy` | Which winning strategy produced `XPathFull` |
| `SuggestedVariableName` | PascalCase identifier derived from label/aria/placeholder/id |

All projections are **deterministic**: same DOM ⇒ identical payload, no
timestamps inside the selector, no random ids.

---

## Modules

| File | Role | LOC |
|------|------|-----|
| `src/content-scripts/xpath-strategies.ts` | (existing) Priority strategy bundle | 105 |
| `src/content-scripts/xpath-anchor-strategies.ts` | **NEW** Auto-anchor + relative XPath builder | 67 |
| `src/content-scripts/xpath-label-suggester.ts` | **NEW** Label resolver + PascalCase converter | 90 |
| `src/content-scripts/xpath-recorder.ts` | Wires everything; emits `XPATH_CAPTURED` message | 158 |

All four files are under the 200-line cap; every function is under 8 lines
or a small switch over named helpers.

---

## Anchor selection rules

Walk up the parent chain; the first ancestor whose tag is in
`{LABEL, LEGEND, FIELDSET, FORM}` wins. If none is found,
`AnchorXPath = null` and `XPathRelative = null`.

This auto-anchor is what the Step replay engine (Phase 09) will resolve
first; the relative XPath is then evaluated *under* that anchor node so
small DOM shifts above the anchor do not break replay.

---

## Variable name suggestion priority

1. `<label for="…">` matching the element's `id`
2. Wrapping `<label>`
3. `aria-label`
4. `placeholder`
5. `id` attribute
6. Tag-name fallback (`Input`, `Button`, …)

The chosen string is normalised to PascalCase ASCII. If the result starts
with a digit it is prefixed with `Element` so it remains a valid
JavaScript identifier.

The Recorder Store (Phase 05) already enforces variable-name uniqueness
across the active session — when the suggester produces a duplicate, the
store appends `_2`, `_3`, … on capture.

---

## Tests

`src/content-scripts/__tests__/xpath-capture-engine.test.ts` — 16 tests:

- 2 anchor-detection cases (label-wrap, fieldset fallback)
- 2 relative-path cases (rejects non-ancestor, shorter than full)
- 3 PascalCase edge cases (separators, empty, leading digit)
- 4 label-resolver cases (for-id, wrap-label, aria, placeholder)
- 2 suggester cases (label-derived, tag fallback)
- 3 end-to-end `buildCapturePayload` cases (id strategy, determinism,
  testid strategy)

All tests pass under jsdom.

---

## Message contract

```ts
{
  type: "XPATH_CAPTURED",
  XPathFull: string,
  XPathRelative: string | null,
  AnchorXPath: string | null,
  Strategy: "id" | "testid" | "role-text" | "positional",
  SuggestedVariableName: string,
  TagName: string,
  Text: string,        // first 100 chars
  CapturedAt: string,  // ISO 8601 UTC
}
```

The background handler (added in Phase 09) translates this directly into
inserts on the per-project `Step` and `Selector` tables defined in
`recorder-db-schema.ts`.
