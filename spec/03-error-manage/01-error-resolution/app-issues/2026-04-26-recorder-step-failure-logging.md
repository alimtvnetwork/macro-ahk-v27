# Issue: Replay/Record step failures lacked structured AI-shareable logs

**Date:** 2026-04-26
**Severity:** Medium
**Status:** Resolved

---

## Error Description

When a macro recorder step failed during **Replay** (`executeReplay`) or
**Record** (capture→persist), the user only saw a short string like
`"Element not found for selector '#go'"`. The user reported:

> "If a step is fail, we'll log it properly with its stack trace and
> everything so that the user can share with AI."

That metadata did not exist:

- No `Error.stack` in the persisted `ReplayStepResult.ErrorMessage`.
- No selector list (which strategies were tried, which one was primary).
- No DOM context (tag/id/class/aria-label/text snippet of the target).
- No active `{{Column}}` data row at failure time.
- No phase tag (`Record` vs `Replay`).
- No copy-to-clipboard path — user had to scrape DevTools manually.

## Root Cause

`src/background/recorder/live-dom-replay.ts` caught errors with
`err instanceof Error ? err.message : String(err)` and stored only the
flat string. The Record pipeline (`capture-to-step-bridge.ts`) was pure
and threw, but no caller wrapped it with logging — failures surfaced as
unhandled rejections in the background worker.

## Solution

1. **New shared formatter** — `src/background/recorder/failure-logger.ts`
   exposes `buildFailureReport`, `formatFailureReport`, and `logFailure`.
   The structured `FailureReport` carries: `Phase` ("Record" | "Replay"),
   `Message`, `StackTrace`, `Selectors[]` (kind+expression+isPrimary),
   `DomContext` (tag/id/class/aria/name/type/text), `DataRow`,
   `ResolvedXPath`, `StepId`, `Index`, `StepKind`, `Timestamp`,
   `SourceFile`. `formatFailureReport` produces a multi-line `[MarcoReplay]`
   /`[MarcoRecord]` block ready to paste into an AI chat.
2. **Replay wired** — `live-dom-replay.ts` now collects the resolved DOM
   target on failure, calls `logFailure(...)`, attaches the structured
   `FailureReport` to `ReplayStepResult`, and persists
   `JSON.stringify(report)` into `ReplayStepResult.ErrorMessage`.
3. **Record wired** — new `src/background/recorder/capture-step-recorder.ts`
   wraps `buildStepDraftFromCapture` + `insertStepRow` with the same
   logger, returning `{ Ok, Step, Selectors, FailureReport }` so callers
   can choose to toast or retry.
4. **Toast UI** — `src/components/recorder/failure-toast.ts` exposes
   `showFailureToast(report)` (Sonner `toast.error` with a
   "Copy report" action) and `copyFailureReportToClipboard(report)`
   that writes the formatted text + JSON to the clipboard.

## Prevention

- All three recorder error sites now route through the single
  `logFailure` entry point; new step kinds inherit the structured log
  for free.
- Tests added:
  - `failure-logger.test.ts` — 7 cases covering report shape, DOM
    capture, formatting, and `logFailure` console output.
  - `capture-step-recorder.test.ts` — 2 cases covering the success path
    and the duplicate-`VariableName` failure path.
  - `live-dom-replay-persistence.test.ts` — extended to assert the
    JSON FailureReport blob in `ReplayStepResult.ErrorMessage`.
  - `failure-toast.test.ts` — 3 cases covering clipboard write,
    clipboard-unavailable fallback, and the Sonner action wiring.
- Lint/typecheck enforced: `tsc --noEmit` clean; no `any` introduced.

## Related

- spec/03-error-manage/01-error-resolution/06-error-documentation-guideline.md
- mem://standards/error-logging-requirements.md — "exact path, what was
  missing, reasoning — optimized for AI consumption"
- mem://constraints/file-path-error-logging-code-red.md
- spec/31-macro-recorder/09-step-persistence-and-replay.md
