# 17 — Hover Highlighter, Data Source Controller, and Endpoint I/O

> Status: **Draft v1** (2026-04-26, Asia/Kuala_Lumpur)
> Owner: Macro Recorder
> Related: `06-xpath-capture-engine.md`, `07-data-source-drop-zone.md`,
> `09-step-persistence-and-replay.md`, `11-inline-javascript-step.md`,
> `12-record-replay-e2e-contract.md`, `16-step-group-library.md`

This spec defines three intertwined recorder subsystems:

| § | Subsystem | One-liner |
|---|-----------|-----------|
| 1 | **Hover Highlighter** | Visual outline of the element + its smart group container under the cursor, with `Alt`-key cycling through ancestors. |
| 2 | **Data Source Controller** | Tabbed UI (CSV / JSON / JS / Endpoint) bound at project- **or** StepGroup-level, feeding the existing `FieldRow` store. |
| 3 | **Endpoint Scheduler + `HttpRequest` step** | Project / group / step-level fetches + scheduled refresh, plus a new `StepKindId = 7` step that POSTs collected form values back to an endpoint. |

The spec is written so a "blind" implementer (no DOM-level intuition) can
follow it from end to end.

---

## 1. Hover Highlighter

### 1.1 Activation modes

| Mode | When | Trigger |
|------|------|---------|
| `Recording` | A recorder session is active. | Auto-on while session active. |
| `Replay` | A replay run is in progress. | Auto-on while runner ticks. |
| `Inspector` | On-demand from the recorder toolbar. | Toolbar button `Inspect` toggles. |

Modes are stored on `RecorderHighlighterStore.mode` (`"off" | "recording" | "replay" | "inspector"`).
Only one mode is active at a time; mode switches are explicit.

### 1.2 Outline rules

Two nested outlines are drawn over the page using **fixed-position overlays**
(no DOM mutation of the inspected element):

- **Primary outline** — the element directly under the cursor.
  - Stroke: `2px solid hsl(var(--primary))`
  - Background: `hsl(var(--primary) / 0.08)`
- **Group outline** — the smart container detected via §1.3.
  - Stroke: `1px dashed hsl(var(--accent))`
  - Background: `transparent`

Both overlays live inside a single shadow-root host element with id
`marco-hover-highlighter` injected once into `<body>`. The host has
`pointer-events: none` so it never steals events.

### 1.3 Smart group detection (priority order)

1. The closest `<form>` ancestor.
2. The closest `<fieldset>` ancestor.
3. The closest `<tr>` (table row) ancestor.
4. The closest element matching
   `[role="group"], [role="region"], [role="listitem"], [role="row"]`.
5. The closest element with class containing `card`, `panel`, `field-row`, or `form-group`.
6. The closest ancestor whose `display` computed style is `grid` or `flex`
   AND whose `childElementCount >= 2`.
7. Fallback: the parent element.

The first match wins.

### 1.4 Alt-key ancestor cycling

While the highlighter is active and the cursor is over an element:

- Pressing `Alt` (keydown) bumps a per-target `ancestorOffset` counter from 0 → 1.
- Each subsequent **wheel-up tick while `Alt` is held** increments the offset.
- Each **wheel-down tick while `Alt` is held** decrements it (clamped at 0).
- Releasing `Alt` resets offset to 0 on next `mousemove`.

The primary outline becomes the n-th `parentElement` of the original target.
The group outline is recomputed from that element using §1.3 rules.

A small chip floats next to the primary outline showing
`tagName.classes #id  · depth +N` so the user can see exactly where they are.

### 1.5 Recording / Replay overlays

- **Recording**: clicking an element while in recording mode captures it as
  the step target (existing `capture-step-recorder` flow) — the highlighter
  doesn't change capture behavior, it only renders the outline.
- **Replay**: the runner emits a `replay:step:start` event with the resolved
  element; the highlighter listens and outlines that element until
  `replay:step:end`. Useful for visual debugging.

### 1.6 Files

| File | Purpose |
|------|---------|
| `src/background/recorder/hover-highlighter.ts` | Pure DOM module; exports `mountHoverHighlighter`, `setHighlighterMode`, `unmount`. |
| `src/background/recorder/__tests__/hover-highlighter.test.ts` | jsdom tests for §1.3 group detection + §1.4 Alt cycling. |
| `src/background/recorder/recorder-toolbar.ts` | Add an **Inspect** toggle button bound to mode `"inspector"`. |

### 1.7 Performance

- All listeners are passive (`{ passive: true }`) and bound at `document`.
- Outline DOM is reused (no per-mousemove `createElement`).
- `requestAnimationFrame` throttles redraws — at most one paint per frame.

---

## 2. Data Source Controller

### 2.1 Goal

Unify CSV, JSON, JavaScript, and HTTP endpoint inputs behind a single
`DataSource` panel so any StepGroup can declare its own source and the
existing `{{Column}}` field-reference templates resolve transparently.

### 2.2 New `DataSourceKindId` values

The `DataSourceKind` lookup table (from `recorder-db-schema.ts`) gains:

| Id | Name | Notes |
|----|------|-------|
| 1 | `Csv` | Existing. |
| 2 | `Json` | Existing. |
| 3 | `Js` | Function body that returns `Row[]`. |
| 4 | `Endpoint` | Fetched via `fetch()` + `Accept: application/json`. |

Schema migration: `ALTER TABLE` is not needed — only seed rows are added in
a new migration `recorder-db-schema migration 003` (idempotent
`INSERT OR IGNORE`).

### 2.3 New columns on `DataSource`

Migration `003`:

```sql
ALTER TABLE DataSource ADD COLUMN ScriptBody         TEXT NULL;   -- for Js kind
ALTER TABLE DataSource ADD COLUMN EndpointUrl        TEXT NULL;   -- for Endpoint kind
ALTER TABLE DataSource ADD COLUMN EndpointMethod     TEXT NULL;   -- 'GET' | 'POST'
ALTER TABLE DataSource ADD COLUMN EndpointHeadersJson TEXT NULL;  -- JSON object
ALTER TABLE DataSource ADD COLUMN EndpointBodyJson   TEXT NULL;   -- JSON value
ALTER TABLE DataSource ADD COLUMN RefreshIntervalMs  INTEGER NULL; -- §3.4
```

All NULL-able so existing rows survive.

### 2.4 Per-StepGroup binding

New table:

```sql
CREATE TABLE IF NOT EXISTS StepGroupDataSource (
    StepGroupId   INTEGER NOT NULL,
    DataSourceId  INTEGER NOT NULL,
    BindingKindId TINYINT NOT NULL DEFAULT 1,  -- 1=Primary, 2=Secondary
    PRIMARY KEY (StepGroupId, DataSourceId),
    FOREIGN KEY (StepGroupId)  REFERENCES StepGroup  (StepGroupId)  ON DELETE CASCADE,
    FOREIGN KEY (DataSourceId) REFERENCES DataSource (DataSourceId) ON DELETE CASCADE
);
```

A group has at most one **Primary** binding (UNIQUE enforced via partial index
`UxStepGroupPrimary` on `(StepGroupId) WHERE BindingKindId = 1`).
Field templates (`{{Column}}`) resolve in this priority:

1. Step-level row override (existing).
2. Primary data source rows for the running group.
3. Project-level data source rows (legacy behavior).

### 2.5 Tabbed UI

Component `src/components/recorder/DataSourcePanel.tsx`:

- **Tabs**: `CSV file` · `JSON paste` · `JavaScript` · `Endpoint`.
- **CSV / JSON**: existing dropzone & textarea.
- **JavaScript**: monospace textarea + "Test run" button.
  Sandbox: `js-step-sandbox.ts` already exists — reuse it; the function must
  `return Array<Record<string, string>>`.
- **Endpoint**: URL input, method select, headers JSON, body JSON,
  optional refresh interval (number + unit).
- Footer: **Save** + **Bind to current group** (checkbox).

### 2.6 Files

| File | Purpose |
|------|---------|
| `src/background/recorder/data-source-parsers.ts` | Add `evaluateJsDataSource(body)` + `fetchEndpointDataSource(url, init)` — both return `ParsedDataSource`. |
| `src/background/recorder/data-source-persistence.ts` | Extend insert/list to read/write the 6 new columns + `StepGroupDataSource` joins. |
| `src/components/recorder/DataSourcePanel.tsx` | Tabbed UI. |
| `src/background/recorder/__tests__/data-source-extended.test.ts` | Tests for JS + Endpoint parsers. |

---

## 3. Endpoint Scheduler + `HttpRequest` Step Kind

### 3.1 New `StepKindId`

Extend the enum in `step-library/schema.ts`:

```ts
export enum StepKindId {
    Click = 1, Type = 2, Select = 3, JsInline = 4,
    Wait = 5, RunGroup = 6,
    HttpRequest = 7,        // NEW
}
```

Seed row `(7, 'HttpRequest')` added; existing CHECK constraints unaffected.

### 3.2 `HttpRequest` step parameters

Stored on the existing `Step.ParamsJson` blob:

```ts
interface HttpRequestParams {
    readonly Url: string;                 // supports {{Column}} interpolation
    readonly Method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    readonly HeadersJson?: string;        // JSON object, also interpolated
    readonly BodyJson?: string;           // JSON value, also interpolated
    readonly CaptureAs?: string;          // bind response JSON to this var name
    readonly TimeoutMs?: number;          // default 15_000
}
```

Replay:

1. Resolve `{{Column}}` placeholders against the active row.
2. `fetch(Url, { method, headers, body })` with abort timeout.
3. On `2xx`: parse JSON; if `CaptureAs` set, push into the per-run variable
   bag (readable by later `JsInline` steps via `RiseupAsiaMacroExt.vars`).
4. On non-2xx OR timeout: emit a structured failure report
   (`buildHttpStepFailureReport`) following the standards in
   `mem://standards/verbose-logging-and-failure-diagnostics`.

### 3.3 Trigger timing matrix

| Scope | When fires | Stored on |
|-------|-----------|-----------|
| Project start | When recorder/replay session opens. | `DataSource.RefreshIntervalMs` NULL + `DataSource` linked at project level. |
| Per-group | When a StepGroup begins execution. | `StepGroupDataSource` row. |
| Per-step | Inline `HttpRequest` step. | `Step` row. |
| Scheduled refresh | Repeating timer. | `DataSource.RefreshIntervalMs > 0`. |

### 3.4 Scheduler

`src/background/recorder/endpoint-scheduler.ts`:

```ts
export interface ScheduledFetch {
    readonly DataSourceId: number;
    readonly IntervalMs: number;
}
export function startScheduler(fetches: ReadonlyArray<ScheduledFetch>): () => void;
```

Implementation: one `setInterval` per fetch (allowed exception to PERF-13
because intervals are user-declared, capped at 32 active timers).
Returned function tears down all timers.

### 3.5 Sending data **out** to an endpoint

Two paths:

1. `HttpRequest` step with method `POST` and `BodyJson` referencing
   `{{Column}}` or run-vars (covers ad-hoc per-step sends).
2. Group-level "On finish: POST to" hook stored as
   `StepGroup.OnFinishHttpRequestStepId` (NULLable FK to `Step`). When the
   group ends successfully the runner enqueues that step.

### 3.6 Files

| File | Purpose |
|------|---------|
| `src/background/recorder/endpoint-scheduler.ts` | Scheduler + teardown. |
| `src/background/recorder/http-request-step.ts` | Resolve + execute + diagnostic on failure. |
| `src/background/recorder/__tests__/http-request-step.test.ts` | Unit tests w/ `fetch` stub. |
| `src/background/recorder/step-library/schema.ts` | Add `HttpRequest = 7` + seed + `OnFinishHttpRequestStepId` column. |

---

## 4. Failure-diagnostic contract

All new failure paths MUST emit reports following
`mem://standards/verbose-logging-and-failure-diagnostics`:

- `Reason` ∈ `{ "EndpointHttpError", "EndpointTimeout", "EndpointParseError", "JsDataSourceThrew", "HighlighterMountFailed" }`
- Always include the resolved URL, method, status, response snippet (≤ 2 KB),
  active row vars, selectors (for highlighter), and the verbose log tail.

---

## 5. Out of scope (this spec)

- OAuth / per-user credential exchange for endpoints (use static headers for now).
- WebSocket / SSE data sources.
- Multi-row CSV reverse-write (POST one row per request) — future spec.
- Highlighter on cross-origin iframes (browser blocks; documented limitation).

---

## 6. Test matrix

| ID | Area | Assertion |
|----|------|-----------|
| H1 | Highlighter | `<form>` ancestor wins over `[role="group"]`. |
| H2 | Highlighter | `Alt + wheel up` increments depth. |
| H3 | Highlighter | Mode `"off"` removes overlay from DOM. |
| D1 | Data | JS body returning non-array throws `JsDataSourceThrew`. |
| D2 | Data | Endpoint returning 404 throws `EndpointHttpError` with status. |
| D3 | Data | Per-group binding overrides project source. |
| E1 | Endpoint | `HttpRequest` step interpolates `{{Column}}`. |
| E2 | Endpoint | Timeout fires after `TimeoutMs`. |
| E3 | Scheduler | Teardown clears all intervals. |

---

## 7. Migration order

1. Schema migration `003` (DataSource ALTERs + StepGroupDataSource table).
2. Step-library schema bump → `STEP_LIBRARY_SCHEMA_VERSION = 2`, add `HttpRequest`.
3. UI: ship `DataSourcePanel.tsx` and toolbar Inspect toggle.
4. Runtime: ship `endpoint-scheduler.ts`, `http-request-step.ts`,
   `hover-highlighter.ts`.
