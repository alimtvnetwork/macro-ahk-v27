# Toolbar Recording UX

**Version:** 1.0.0
**Updated:** 2026-04-26
**Status:** Active
**AI Confidence:** Medium
**Ambiguity:** Low

> *Generic blueprint — no project-specific identifiers. If you find one, file an issue.*

---

## Intent

Define the toolbar recording control surfaced inside the injected controller UI:
the **Start / Pause / Stop** lifecycle, the floating **overlay step list** that
grows as the user interacts with the page, and the **export contract** that
turns a recorded session into a portable macro artifact.

The toolbar is the only entry point a user touches to record. Everything that
appears mid-recording (highlight outlines, step rows, badges) flows from the
state model defined here.

---

## Lifecycle State Machine

| From → To | Trigger | UI Effect |
|-----------|---------|-----------|
| `Idle` → `Recording` | Click `Start` (or shortcut) | Toolbar shows red dot + elapsed timer; overlay opens empty |
| `Recording` → `Paused` | Click `Pause` | Timer freezes; capture handlers detached; overlay stays mounted |
| `Paused` → `Recording` | Click `Resume` | Timer resumes; capture handlers re-attached |
| `Recording` → `Idle` | Click `Stop` | Capture stops; export dialog opens; overlay survives until export closed |
| `Paused` → `Idle` | Click `Stop` | Same as above |
| any → `Idle` | Tab close / navigation | Auto-flush draft to local persistence; toast on next open |

```
   ┌───────┐  Start   ┌────────────┐  Pause   ┌────────┐
   │ Idle  │ ───────▶ │ Recording  │ ───────▶ │ Paused │
   └───────┘          └────────────┘ ◀─────── └────────┘
       ▲                    │  Resume              │
       │ Stop / Cancel      │                      │
       └────────────────────┴──────────────────────┘
```

---

## Overlay Step List

The overlay is a draggable panel anchored bottom-right of the viewport, isolated
in a Shadow Root to avoid host-page CSS bleed. Each captured interaction
appends one row.

| Column | Source | Notes |
|--------|--------|-------|
| `Index` | Insertion order | Re-numbered on row delete |
| `Kind` | Event type | `Click`, `Type`, `Select`, `Wait`, `JsInline` |
| `Label` | Closest `<label>` / `aria-label` / `placeholder` / text content | Truncated to 40 chars |
| `Selector` | XPath strategy result | Tooltip shows full XPath + strategy used |
| `Actions` | — | Rename variable, delete row, reorder |

Row states: `Captured` (green dot), `Edited` (amber dot), `Removed` (struck-through, kept until export).

---

## TypeScript Contracts

```typescript
type RecordingPhase = "Idle" | "Recording" | "Paused";

interface RecordingSession {
  readonly SessionId: string;          // ULID
  readonly StartedAt: string;          // ISO-8601
  readonly Phase: RecordingPhase;
  readonly Steps: ReadonlyArray<RecordedStep>;
}

interface RecordedStep {
  readonly StepId: string;             // ULID, stable across edits
  readonly Index: number;
  readonly Kind: "Click" | "Type" | "Select" | "Wait" | "JsInline";
  readonly Label: string;
  readonly VariableName: string;       // PascalCase, unique per session
  readonly Selector: StepSelector;
  readonly CapturedAt: string;
}

interface StepSelector {
  readonly XPathFull: string;
  readonly XPathRelative: string | null;
  readonly AnchorStepId: string | null;
  readonly Strategy: "Id" | "TestId" | "RoleText" | "Positional";
}
```

---

## Export Contract

`Stop` opens an export dialog. The user picks one format; the artifact is
generated client-side from the in-memory `RecordingSession` — no server round
trip is required for export.

| Format | Extension | Content |
|--------|-----------|---------|
| Macro JSON | `.macro.json` | Canonical `RecordingSession` serialized PascalCase |
| Replay Script | `.replay.ts` | Generated TypeScript using the project's replay runner API |
| Clipboard Summary | — | Human-readable Markdown table of steps |

Filename convention: `Recording-{YYYYMMDD-HHmmss}-{SessionId}.{ext}` written via
the existing download helper used by other export flows.

---

## Reference Implementation Excerpt

```typescript
// Toolbar control wiring — illustrative, ≤30 lines
function useRecordingToolbar(store: RecorderStore) {
  const phase = store.getPhase();
  const isIdle = phase === "Idle";
  const isPaused = phase === "Paused";
  const isRecording = phase === "Recording";

  const onPrimaryClick = (): void => {
    if (isIdle) {
      store.start();
      return;
    }
    if (isRecording) {
      store.pause();
      return;
    }
    store.resume();
  };

  const onStopClick = (): void => {
    store.stop();
    store.openExportDialog();
  };

  return { phase, onPrimaryClick, onStopClick, isPaused, isRecording };
}
```

---

## Common Pitfalls

| Pitfall | Cause | Fix |
|---------|-------|-----|
| Overlay clicks captured as steps | Capture handler not scoped | Skip targets whose root node is the overlay's Shadow Root |
| Variable name collisions on rename | Uniqueness checked at capture time only | Re-validate the whole session on every rename |
| Export missing recent step | Stop fires before final event flushes | Drain the capture queue inside `stop()` before opening export |
| Paused session loses state on tab nav | No persistence between phases | Mirror session to `chrome.storage.local` on every phase transition |
| Anchor selector points at deleted step | Row delete didn't rewrite anchors | On delete, re-resolve dependents to next valid ancestor or full XPath |

---

## DO / DO NOT / VERIFY

**DO**
- Render toolbar controls inside the existing injected controller's Shadow Root.
- Persist the session draft on every state transition.
- Re-validate `VariableName` uniqueness on every rename.
- Generate export filenames with timestamp + `SessionId`.

**DO NOT**
- Bind capture handlers in `Paused` phase.
- Use host-page CSS classes for overlay styling.
- Assume `Stop` is the only path back to `Idle` — handle tab close too.
- Inline export logic into the toolbar component — delegate to an exporter module.

**VERIFY**
- State machine transitions match the table above (unit test the reducer).
- Overlay rows survive a `Pause → Resume` cycle without re-render flicker.
- Export artifact round-trips: re-importing produces an equivalent session.
- Keyboard shortcut for `Start/Stop` is documented in `memory/keyboard-shortcuts.md`.

---

## Cross-References

| Reference | Location |
|-----------|----------|
| Injected controller UI | `./07-injected-controller-ui.md` |
| Notification system (toasts on stop) | `./08-notification-system.md` |
| Folder structure rules | `../../01-spec-authoring-guide/01-folder-structure.md` |
| Required files | `../../01-spec-authoring-guide/03-required-files.md` |
