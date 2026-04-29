# 03 — Projects Map

> **Status**: 📝 Draft (2026-04-25)
> **Owner**: Macro Controller
> **Source prompt**: mirrored to `prompts/04-projects-map-spec.md`
> **Depends on**: Macro Controller hamburger menu (`ui/menu-builder.ts`),
> SDK IndexedDB cache (`project-kv-store.ts`), workspace + credit API
> already wired in (`workspace-management.ts`, `credit-api.ts`,
> `core/CreditManager.ts`).

---

## 1. Goal

Add a new **Projects Map** entry to the Macro Controller hamburger menu.
Opening it scans every currently open browser tab, detects Lovable
project tabs, captures `ProjectId` + `ProjectName` + `WorkspaceId` +
`WorkspaceName` per project, persists them under
`RiseUpAsia.Projects.MacroController.IndexDb` (the existing
`ProjectKvStore` namespace), enriches each unique workspace with credit
balance + expiry + category via the existing Lovable API path, and
renders a grouped read-only view: workspace → projects.

Closed tabs do **not** delete the persisted record — the row is
retained and flagged `IsOpenNow = false`.

---

## 2. Non-goals

- No new auth path. Reuse the bearer token already resolved by
  `auth-resolve.ts` / `auth-bridge.ts`.
- No new design system. Reuse existing Macro Controller theme tokens
  (`shared-state.ts`: `cPanelBg`, `cPanelFgDim`, `cPrimary`,
  `tFont`, `tFontSm`, `trFast`, etc.).
- No top-level project. Implementation lives inside
  `standalone-scripts/macro-controller/`.
- No re-implementation of IndexedDB. Wrap the existing `ProjectKvStore`
  via a section name (`ProjectsMap`).
- No mutation of other workspace state. Read-only enrichment.

---

## 3. URL pattern + ID extraction (constants only — no magic strings)

Add to `standalone-scripts/macro-controller/src/projects-map/constants.ts`:

```ts
// kebab-case file names; PascalCase exported constants
export const LovableProjectUrlPattern = /^https:\/\/lovable\.dev\/projects\/([A-Za-z0-9-]+)(?:\/|$|\?)/;
export const LovablePreviewUrlPattern = /^https:\/\/([A-Za-z0-9-]+)-preview--[A-Za-z0-9-]+\.lovable\.app(?:\/|$|\?)/;
export const ProjectsMapKvSection = "ProjectsMap";
export const WorkspaceEnrichmentTtlMs = 60_000;        // 1 min — Refresh re-fetches anyway
export const ProjectsMapMenuLabel = "Projects Map";
export const ProjectsMapMenuIcon = "🗺️";
```

`ProjectId` is captured group 1 of either pattern. Tabs that match
neither are ignored.

---

## 4. Data model (PascalCase per `mem://standards/pascalcase-json-keys`)

The `ProjectKvStore` is a key-value bag, not a relational store. Two
logical "tables" are emulated by two key prefixes inside the
`ProjectsMap` section:

### 4.1 `MacroProject` records — key `Project::<ProjectId>`

```ts
export type MacroProjectRecord = {
  readonly ProjectId: string;
  readonly ProjectName: string;
  readonly WorkspaceId: string;
  readonly TabId: number | null;        // null when not open
  readonly IsOpenNow: boolean;
  readonly LastSeenAt: string;          // ISO-8601 UTC
  readonly Notes?: string;              // optional, user-editable later
};
```

### 4.2 `MacroWorkspace` records — key `Workspace::<WorkspaceId>`

```ts
export type MacroWorkspaceRecord = {
  readonly WorkspaceId: string;
  readonly WorkspaceName: string;
  readonly CreditRemaining: number;
  readonly CreditAvailable: number;     // allocated total for the period
  readonly CreditExpiresAt: string;     // ISO-8601 UTC
  readonly WorkspaceCategoryId: WorkspaceCategoryEnum;
  readonly LastFetchedAt: string;       // ISO-8601 UTC; TTL gate
  readonly LastFetchError?: string;     // populated on failure; cleared on success
};
```

### 4.3 `WorkspaceCategoryEnum` (frozen enum — never magic strings)

```ts
export const enum WorkspaceCategoryEnum {
  Pro = 1,
  Free = 2,
  Expired = 3,
  Cancelled = 4,
  Trial = 5,
  Enterprise = 6,
  Unknown = 99,
}

export const WorkspaceCategoryLabel: Readonly<Record<WorkspaceCategoryEnum, string>> = Object.freeze({
  [WorkspaceCategoryEnum.Pro]: "Pro",
  [WorkspaceCategoryEnum.Free]: "Free",
  [WorkspaceCategoryEnum.Expired]: "Expired",
  [WorkspaceCategoryEnum.Cancelled]: "Cancelled",
  [WorkspaceCategoryEnum.Trial]: "Trial",
  [WorkspaceCategoryEnum.Enterprise]: "Enterprise",
  [WorkspaceCategoryEnum.Unknown]: "Unknown",
});
```

Mapping from the Lovable API response → enum lives in
`projects-map/workspace-category-mapper.ts` and is the **only** place
that touches free-form category strings from the API. All other code
references `WorkspaceCategoryEnum` members.

### 4.4 Why no separate `WorkspaceCategory` lookup table?

The original prompt called for a 3rd lookup table. In an IndexedDB
key-value store, a normalised lookup table is pure overhead — the enum
+ label map above already gives `Code` (enum name) + `Label` and is
the canonical TS representation. If/when the extension migrates to
SQLite for this feature, the lookup table is added then; the schema
above (`WorkspaceCategoryId: number`) is forward-compatible.

---

## 5. Module layout (≤ 100 lines per file, ≤ 8 lines per function)

```
standalone-scripts/macro-controller/src/projects-map/
├── constants.ts                       # patterns, labels, enums
├── types.ts                           # MacroProjectRecord, MacroWorkspaceRecord, enum
├── workspace-category-mapper.ts       # API string → WorkspaceCategoryEnum
├── tab-discovery.ts                   # chrome.tabs.query → matched tabs
├── tab-extractor.ts                   # tab → { ProjectId, ProjectName, WorkspaceId }
├── projects-map-store.ts              # thin wrapper over ProjectKvStore (section=ProjectsMap)
├── workspace-enrichment.ts            # fetch + persist MacroWorkspaceRecord (TTL-gated)
├── projects-map-scan.ts               # orchestrator: discover → store → enrich
├── projects-map-modal.ts              # modal shell (open/close, header, footer)
├── projects-map-render.ts             # group-by-workspace, row HTML
├── projects-map-actions.ts            # Refresh / Reset / focus-tab / open-tab
└── projects-map-css.ts                # scoped styles using shared-state tokens
```

### 5.1 Menu wiring (single point of integration)

In `standalone-scripts/macro-controller/src/ui/menu-builder.ts`, append
a single line in `buildHamburgerMenu()` after the existing `Database`
entry:

```ts
import { ProjectsMapMenuIcon, ProjectsMapMenuLabel } from "../projects-map/constants";
import { showProjectsMapModal } from "../projects-map/projects-map-modal";
// …
menuDropdown.appendChild(
  createMenuItem(menuCtx, ProjectsMapMenuIcon, ProjectsMapMenuLabel,
    "Map of every open Lovable project → workspace + credits",
    function() { showProjectsMapModal(); }),
);
```

No other file in `ui/` needs to change.

---

## 6. Tab discovery + extraction flow

```
[user clicks Projects Map]
        │
        ▼
[chrome.tabs.query({ url: "https://lovable.dev/projects/*" })]
        │
        ▼
[tab-extractor: regex → ProjectId; tab.title → ProjectName;
 tab URL or page-state DOM probe → WorkspaceId]
        │           │
        │           └── unresolved WorkspaceId → enqueue for in-tab
        │               probe via existing nsCallTyped() bridge
        ▼
[projects-map-store: upsert Project::<ProjectId>;
 set IsOpenNow=true, LastSeenAt=now]
        │
        ▼
[mark every existing Project::* whose ProjectId NOT in this scan
 as IsOpenNow=false (LastSeenAt unchanged)]
        │
        ▼
[group by WorkspaceId → enrich each unique workspace]
        │           │
        │           ├── cached + LastFetchedAt within TTL → skip fetch
        │           └── stale or missing → fetch via existing CreditManager
        ▼
[render]
```

### 6.1 WorkspaceId fallback

If the URL alone doesn't carry the workspace ID (Lovable's URLs vary
by view), the extractor calls the existing in-tab namespace bridge
(`nsCallTyped("getCurrentWorkspaceId")` — already implemented in
`workspace-detection.ts`) to ask the page for it. Failure leaves the
project record without enrichment but still listed.

---

## 7. UI — Projects Map modal

Reuses the existing modal scaffold pattern from `ui/about-modal.ts` /
`ui/changelog-modal.ts` (full-screen overlay, dismissible, dark
backdrop). All colors / fonts come from `shared-state.ts` tokens.

### 7.1 Layout

```
┌─────────────────────────────────────────────────────────────┐
│ 🗺️  Projects Map                       [ Refresh ] [ Reset ] [✕] │
├─────────────────────────────────────────────────────────────┤
│ ▸ Workspace: Acme Studio          [Pro]   1 240 / 5 000 cr  │
│   Expires in 12 days · 2026-05-07 14:30 KL                  │
│   ─────────────────────────────────────────────────────     │
│   ● my-app           ID:abc123   open  · seen 2 m ago       │
│   ○ legacy-store     ID:def456   closed · seen 3 d ago      │
│                                                             │
│ ▸ Workspace: Sandbox              [Free]  ⚠ enrichment failed│
│   [ Retry ]                                                 │
│   ─────────────────────────────────────────────────────     │
│   ● demo             ID:ghi789   open                       │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 Behaviour

- **Refresh** → re-runs the full pipeline (§ 6).
- **Reset** → confirm dialog, then `ProjectKvStore.list("ProjectsMap")`
  + delete each.
- **Open project row click**:
  - If `IsOpenNow && TabId != null` → `chrome.tabs.update(tabId, { active: true })` + focus its window.
  - Otherwise → `chrome.tabs.create({ url: "https://lovable.dev/projects/<id>" })`.
- **Project ID** rendered in monospace; click copies to clipboard.
- **Empty state**: no Lovable tabs open + no cached records → centered
  "Open a Lovable project to start mapping" + `Scan Now` button.
- **Per-group error state**: workspace enrichment failure renders an
  inline chip + `Retry` on that group only — other groups still
  render.

---

## 8. Logging

Every operation goes through the existing `logging.ts` `log()` helper
(the same sink that already feeds the Activity panel and CSV export).
Every operation logs three lines:

1. `start` — operation name + scoped data (e.g. `tabs.scanned=12`).
2. `success` or `failure` — outcome + counts/error.
3. `end` (optional, only if multi-second).

Failures inside a `try/catch` ALWAYS pass through `logError(FN, err)`
from `error-utils.ts` so the existing diagnostic dump captures them
in machine-readable form.

---

## 9. Acceptance criteria

| # | Criterion |
|---|-----------|
| AC-1 | `Projects Map` entry appears in the hamburger menu, between `Database` and the Auto-Attach section. |
| AC-2 | Opening it scans every open browser tab and identifies Lovable project tabs without manual input. |
| AC-3 | Each detected project is upserted into IndexedDB under `RiseUpAsia.Projects.MacroController.IndexDb` → section `ProjectsMap` → key `Project::<ProjectId>`. |
| AC-4 | Each unique workspace is enriched with `CreditRemaining`, `CreditAvailable`, `CreditExpiresAt`, and `WorkspaceCategoryId` via the existing Lovable session-cookie bearer token path. |
| AC-5 | The view groups projects by workspace and shows: workspace name, category badge, credit remaining/available, credit expiry (relative + absolute on hover). |
| AC-6 | Project rows show open/closed status; clicking an open project focuses its tab, clicking a closed one opens the URL in a new tab. |
| AC-7 | `Refresh` re-runs scan + enrichment; `Reset` clears stored entries after confirmation. |
| AC-8 | All schema, fields, JSON keys are PascalCase; `WorkspaceCategoryEnum` is the only category surface — no free-text category strings outside `workspace-category-mapper.ts`. |
| AC-9 | All operations log `start` / `success` / `failure`; one workspace's enrichment failure does not block the rest of the view from rendering. |
| AC-10 | Every new file ≤ 100 lines; every new function ≤ 8 lines (max 12–15 only when unavoidable, with a comment justifying it); strict TypeScript — zero `any`, zero `unknown` outside `CaughtError`. |
| AC-11 | Closed tabs do not delete their stored `MacroProjectRecord` — `IsOpenNow=false` only. |
| AC-12 | Modal styling uses only `shared-state.ts` tokens — `grep -nE "#[0-9a-f]{3,6}|rgb\(" projects-map/` returns zero hits. |

---

## 10. Out of scope (future work)

- SQLite-backed mirror of `MacroProjectRecord` / `MacroWorkspaceRecord`
  (current store is IndexedDB key-value only).
- Per-project notes editing UI (`Notes` field is reserved but not surfaced).
- Cross-workspace analytics (totals, charts).
- Auto-poll on a timer — only on-open + manual `Refresh`.

---

## 11. Open questions

| # | Question | Default if unanswered |
|---|----------|-----------------------|
| Q1 | Should `IsOpenNow=false` rows older than N days be auto-purged? | No — retain until user clicks `Reset`. |
| Q2 | Should the modal poll while open, or only fetch on open + manual Refresh? | Only on open + manual Refresh (avoids credit-API spam). |
| Q3 | Where should `ProjectName` come from when the tab title is generic ("Lovable")? | Fall back to `ProjectId`; later phase can probe the page DOM. |
| Q4 | Should `Projects Map` survive a workspace switch in the current tab (tab → new project)? | Yes — every scan re-keys by `ProjectId`. |
