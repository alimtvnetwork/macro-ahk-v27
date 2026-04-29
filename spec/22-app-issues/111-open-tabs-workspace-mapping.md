# Open Lovable Tabs — Per-Tab Workspace Mapping

**Spec ID:** `spec/22-app-issues/111-open-tabs-workspace-mapping.md`
**Status:** Draft (awaiting `next` to harden)
**Owner:** Macro Controller + Extension Background
**Created:** 2026-04-27 (Asia/Kuala_Lumpur)
**Related memory:** `mem://features/macro-controller/open-tabs-workspace-mapping` (TO-DO)
**Related code:**
- `src/background/handlers/open-tabs-handler.ts`
- `src/content-scripts/message-relay.ts`
- `standalone-scripts/macro-controller/src/page-workspace-responder.ts`
- `standalone-scripts/macro-controller/src/ui/section-open-tabs.ts`
- `standalone-scripts/macro-controller/src/startup.ts`

---

## 1. Verbatim (source of truth)

> Add a macro-controller panel that lists all open Lovable tabs and shows
> which workspace each tab is bound to. Then implement automatic detection
> of the Lovable workspace per open tab by querying open Lovable URLs and
> asking each tab for its detected workspace via the existing message bus.

---

## 2. Goal

The "🪟 Open Lovable Tabs" panel inside the Macro Controller MUST list
every open Lovable tab in the current Chrome profile and, for each tab,
show:

1. The bound stored project (when the extension has injected into it), OR
2. The workspace that the tab's own macro-controller has **detected at
   runtime** (via the existing message bus), OR
3. A clear, non-misleading reason why neither could be resolved.

The panel MUST NOT call `chrome.tabs.*` directly — it lives in the MAIN
world (mem://architecture/injection-context-awareness).

---

## 3. STRICT rules

1. The MAIN-world panel only ever talks to background through the existing
   `window.postMessage` ⇄ content-script ⇄ `chrome.runtime` bridge
   (mem://architecture/message-relay-system). No new transport layers.
2. Every probe is **best-effort, single attempt, fail-fast** — no retry
   queue, no exponential backoff (mem://constraints/no-retry-policy).
3. Probes have a hard timeout (`PROBE_TIMEOUT_MS`, currently `600`). On
   timeout the row renders with a short reason; the panel never blocks.
4. Probes run in **parallel** across tabs (`Promise.all`), so panel
   refresh latency ≈ `O(slowest tab)` not `O(n × tabs)`.
5. Background → tab dispatch uses **only** `chrome.tabs.sendMessage` with
   the message type `PROBE_DETECTED_WORKSPACE`. No new permissions added.
6. Tabs without the macro-controller injected MUST surface
   `probeError = "Could not establish connection. Receiving end does not
   exist."` (or the platform's equivalent) — never `"unknown"`.
7. Field naming — every shape is explicit (No Explicit Unknown policy).
   `OpenLovableTabInfo` carries the union `bindingSource: 'injection' |
   'probe' | 'none'`; never a free-form string.
8. The page-side responder is **read-only** — it MUST NOT mutate
   `state.workspaceName` or trigger a re-detection; it only snapshots.
9. URL-pattern list (`LOVABLE_TAB_PATTERNS`) is the single source of
   truth and MUST mirror the auto-injector and cookie-watcher patterns.
10. All errors are logged via the namespace logger
    (`RiseupAsiaMacroExt.Logger.error()`) on the page side and via
    standard background logging in the handler — never `console.log`
    swallow (mem://standards/error-logging-via-namespace-logger.md).

---

## 4. Data contract

### 4.1 Page-side responder (MAIN world → page)

```ts
// Request — posted by content-script after receiving PROBE_DETECTED_WORKSPACE
{
  source: 'marco-extension-request',
  type:   'GET_DETECTED_WORKSPACE',
  requestId: string,
}

// Response — posted by macro-controller MAIN-world responder
{
  source: 'marco-controller-response',
  type:   'GET_DETECTED_WORKSPACE',
  requestId: string,
  payload: DetectedWorkspaceSnapshot | null,
  errorMessage?: string,
}

interface DetectedWorkspaceSnapshot {
  workspaceName: string;            // state.workspaceName ?? cached
  workspaceId:   string;            // getCachedWorkspaceId()
  projectId:     string | null;     // extractProjectIdFromUrl()
  source: 'api' | 'cache' | 'dom' | 'none';
  capturedAt: string;               // ISO-8601
}
```

### 4.2 Background → page bridge (`PROBE_DETECTED_WORKSPACE`)

The content-script relay handles the probe message type, posts the
request to the page, listens for the matching `requestId`, and resolves
via `sendResponse({ isOk, payload, errorMessage })`. Returns `true` so
Chrome keeps the channel open for the async reply.

### 4.3 Background handler response (`GET_OPEN_LOVABLE_TABS`)

```ts
interface OpenLovableTabInfo {
  tabId:                     number | null;
  title:                     string;
  url:                       string;
  active:                    boolean;
  windowFocused:             boolean;
  projectId:                 string | null;        // injection or probe
  projectName:               string | null;        // resolved from store
  bindingSource:             'injection' | 'probe' | 'none';
  detectedWorkspaceName:     string | null;        // from probe
  detectedWorkspaceId:       string | null;        // from probe
  detectedWorkspaceSource:   'api' | 'cache' | 'dom' | 'none' | null;
  probeError:                string | null;        // null on success
}
```

---

## 5. Resolution waterfall (per tab)

1. **Stored project (injection)** — if `getTabInjections()[tabId]` exists,
   `projectId` comes from the in-memory map and `bindingSource = 'injection'`.
2. **Probe-reported project** — else if probe payload contains a
   `projectId`, use it and set `bindingSource = 'probe'`.
3. **Resolved project name** — `projectName = projectsById.get(projectId)`
   or `null` if the project is not in `STORAGE_KEY_ALL_PROJECTS`.
4. **Detected workspace name (display fallback)** — when `projectName`
   is null but the probe returned a `workspaceName`, the panel renders
   that name in **amber** with a `(api|cache|dom)` source tag.
5. **Failure** — render an italic gray reason: either the truncated
   `probeError` (≤40 chars + ellipsis, full text in `title`) or a stable
   string (`"unknown project"` / `"not bound"`).

---

## 6. URL patterns (single source of truth)

```ts
const LOVABLE_TAB_PATTERNS = [
  'https://lovable.dev/*',
  'https://*.lovable.dev/*',
  'https://lovable.app/*',
  'https://*.lovable.app/*',
];
```

Mirrors auto-injector + cookie-watcher. Any change here MUST be applied
to those modules in the same commit.

---

## 7. Failure-log shape (LOG-1 compliance)

The page-side responder catches any snapshot error and emits via
`logError('pageWorkspaceResponder', 'Failed to build workspace snapshot', e)`.
The background handler relies on the existing handler-error wrapper.

| Reason            | ReasonDetail (example)                                     |
|-------------------|-------------------------------------------------------------|
| `NoTabId`         | "chrome did not assign a tab id"                            |
| `EmptyResponse`   | "content-script returned undefined"                         |
| `ProbeFailed`     | "controller returned errorMessage: <…>"                     |
| `ProbeTimeout`    | "probe timeout — controller not responding (600 ms)"        |
| `NoContentScript` | "Could not establish connection. Receiving end does not…"   |

`SelectorAttempts[]` and `VariableContext[]` are N/A for this feature
(no selector or variable resolution involved); the LOG-1 schema's
`Reason` + `ReasonDetail` pair is still mandatory.

---

## 8. UI contract (panel)

- Header: `🪟 Open Lovable Tabs`, persisted collapse state key
  `ml_collapse_open_tabs`.
- Each row: focus badge (`◆`), active badge (`●`), title, host+path,
  `↳ workspace: <name|reason>`.
- Workspace label colors:
  - Green (`#10b981`) — matched stored project.
  - Amber (`#fbbf24`) — probe-reported workspace, no stored project.
  - Gray italic — fallback reason (probe error or "not bound").
- Refresh: explicit `⟳ Refresh` button + auto-refresh on each expand.

---

## 9. Out of scope (this spec)

- Persisting probe results across panel openings (each refresh is fresh).
- Cross-window aggregation beyond `chrome.windows.getLastFocused()` for
  the focus badge.
- Automatically binding a tab to a stored project on probe success — the
  panel only surfaces information; binding is done elsewhere.
- Surfacing probe latency / per-tab timing histograms.

---

## 10. Acceptance checklist

- [ ] Open the panel with ≥ 2 Lovable tabs from different workspaces — each
      row shows the correct workspace name (green or amber).
- [ ] Open one Lovable tab where the controller has not yet booted — the
      row shows the gray fallback with the connection-error reason.
- [ ] Open a non-Lovable tab — it MUST NOT appear in the list.
- [ ] Force the page responder to throw — the row shows
      `probeError` truncated, full error visible in the row's `title`.
- [ ] `npx tsc -p tsconfig.app.json --noEmit` and
      `npx tsc -p tsconfig.macro.json --noEmit` both exit 0.
- [ ] No new `chrome.*` permission requested in `manifest.json`.
- [ ] Refresh latency for 5 tabs ≤ 1× `PROBE_TIMEOUT_MS` (parallel).
