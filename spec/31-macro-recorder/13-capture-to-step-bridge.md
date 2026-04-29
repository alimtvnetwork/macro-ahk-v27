# Spec 31 / 13 — Capture-to-Step Bridge

**Status:** ✅ Implemented 2026-04-26
**Phases bridged:** 06 (XPath capture engine) ↔ 09 (Step + Selector persistence)

## Why

Phase 06 produces `XPATH_CAPTURED` payloads in the page; Phase 09 persists
`Step` + `Selector` rows in the per-project SQLite DB. Until this bridge
existed, the capture event was a dead-letter — nothing translated it into
DB rows.

## Contract

A `RECORDER_CAPTURE_PERSIST` message accepts:

```ts
{
  projectSlug?: string;          // overrides active session if supplied
  payload: {
    XPathFull: string;           // required
    XPathRelative: string | null;
    AnchorXPath: string | null;  // required when XPathRelative is non-null
    SuggestedVariableName: string;
    TagName: string;
    Text: string;
  };
}
```

Behaviour:

1. Resolve `projectSlug` from the active recording session
   (`recorder-session-storage.loadSession()`) when not supplied.
2. If `XPathRelative` + `AnchorXPath` are present, look up an existing
   primary `XPathFull` Selector row matching `AnchorXPath` via
   `findAnchorSelectorId(db, anchorXPath)`. Returns `null` when no prior
   capture established the anchor.
3. Build a `StepDraft`:
   - `StepKindId` inferred from `TagName`
     (`input`/`textarea` → `Type`, `select` → `Select`, else `Click`).
   - `Selectors[0]`: primary `XPathFull`.
   - `Selectors[1]` (optional): `XPathRelative` with `AnchorSelectorId`
     set when an anchor exists. Dropped silently when the anchor is
     unknown — the full XPath remains deterministic.
4. Persist via `insertStep(projectSlug, draft)`.

## Files

| Path | Role |
|------|------|
| `src/background/recorder/capture-to-step-bridge.ts` | Pure converter + anchor lookup |
| `src/background/handlers/recorder-capture-handler.ts` | Message handler |
| `src/background/recorder/__tests__/capture-to-step-bridge.test.ts` | 13 unit tests |
| `src/shared/messages.ts` | `RECORDER_CAPTURE_PERSIST` enum + variant |
| `src/background/message-registry.ts` | Registry wiring |

## Tests (13)

* `inferStepKind` — INPUT/textarea→Type, SELECT→Select, default Click.
* `buildLabel` — tag+text, empty fallback, 60-char truncation.
* `buildStepDraftFromCapture` — single-primary, anchored relative, dropped
  relative when anchor unknown, validation of empty XPathFull / variable.
* `findAnchorSelectorId` — null when missing, returns most recent match.
* End-to-end capture→persist — relative selector links to its anchor row
  in the DB.

## Deferred

* Content-script forwarding of the `XPATH_CAPTURED` payload via
  `chrome.runtime.sendMessage({ type: "RECORDER_CAPTURE_PERSIST", payload })`
  — pending Shadow-Root toolbar UI (also deferred per
  `mem://preferences/deferred-workstreams.md`). The handler is contract-ready;
  the producer side just needs the type renamed in `xpath-recorder.ts`.
