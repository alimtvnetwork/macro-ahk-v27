# TS Migration Step 2 — Macro-Looping.ts Splitting Plan

**Source**: `standalone-scripts/macro-controller/src/macro-looping.ts` (4186 lines, 61 functions)
**Goal**: Extract logically cohesive groups into individual files under `src/` and `src/ui/`

---

## Already Extracted (30 files)

Root: auth, controller-registry, credit-api, credit-fetch, dom-helpers, log-manager, logging, loop-engine, shared-state, toast, types, workspace-detection, workspace-management, workspace-rename, xpath-utils
UI: about-modal, auto-attach, countdown, js-executor, menu-helpers, panel-layout, prompt-utils, save-prompt, sections, settings-ui, task-next-ui, template-renderer

---

## Extraction Plan (8 segments)

### Segment A: Workspace UI (ws-selection-ui.ts) ~520 lines
- `handleWsCheckboxClick()` (L305)
- `updateWsSelectionUI()` (L326)
- `showWsContextMenu()` (L361)
- `removeWsContextMenu()` (L386)
- `startInlineRename()` (L391)
- `triggerLoopMoveFromSelection()` (L839)
- `setLoopWsNavIndex()` (L852)
- `buildLoopTooltipText()` (L879)
- `renderLoopWorkspaceList()` (L909)
- `populateLoopWorkspaceDropdown()` (L1087)

### Segment B: Bulk Rename Dialog (ui/bulk-rename.ts) ~400 lines
- `renderBulkRenameDialog()` (L433) + nested drag/vars/preview/eta functions
- `removeBulkRenameDialog()` (L821)

### Segment C: Workspace Observer (workspace-observer.ts) ~370 lines
- `isKnownWorkspaceName()` (L1131)
- `fetchWorkspaceName()` (L1157)
- `fetchWorkspaceNameFromNav()` (L1201)
- `autoDiscoverWorkspaceNavElement()` (L1261)
- `startWorkspaceObserver()` (L1309)
- `triggerCreditCheckOnWorkspaceChange()` (L1424)
- `addWorkspaceChangeEntry()` (L1456)
- `getWorkspaceHistory()` (L1480)
- `clearWorkspaceHistory()` (L1487)

### Segment D: UI Update Functions (ui/ui-updaters.ts) ~250 lines
- `updateUI()` (L1517)
- `updateProjectNameDisplay()` (L1526)
- `updateStatus()` (L1536)
- `updateButtons()` (L1655)
- `updateRecordIndicator()` (L1672)
- `animateBtn()` (L1703)
- `attachButtonHoverFx()` (L1722)
- `setLoopInterval()` (L1739)
- `destroyPanel()` (L1767)

### Segment E: Panel Creation (ui/panel-builder.ts) ~350 lines
- `createUI()` (L1798) — main panel construction
- `resetCheckButtonState()` (L1978)
- `doRunCheck()` (L2044)

### Segment F: Prompt System (ui/prompt-manager.ts) ~600 lines
- `loadPromptsFromJson()` (L2149) + nested helpers
- `getPromptsConfig()` (L2223)
- `renderPromptsDropdown()` (L2282)
- `sendToExtension()` (L2562)
- `openPromptCreationModal()` (L2592)

### Segment G: Force Move & Shortcuts (force-move.ts) ~900 lines
- `setForceMoveInFlight()` (L2877) + force move logic
- `isOnProjectPageForShortcut()` (L3763)
- Keyboard shortcut bindings

### Segment H: Startup & Init (startup.ts) ~300 lines
- `loadWorkspacesOnStartup()` (L3954)
- `scheduleWorkspaceRetry()` (L3986)
- `tryReinject()` (L4064)
- Boot sequence and global API registration

---

## Execution Order

1. **Segment C** (workspace-observer) — self-contained, few deps
2. **Segment D** (ui-updaters) — utility functions, widely referenced
3. **Segment A** (ws-selection-ui) — depends on D
4. **Segment B** (bulk-rename) — self-contained dialog
5. **Segment F** (prompt-manager) — already partially extracted
6. **Segment E** (panel-builder) — depends on D, F
7. **Segment G** (force-move) — large block, some coupling
8. **Segment H** (startup) — final bootstrap, depends on everything

---

## Constraints

- All functions are inside the IIFE closure — they share closure state
- Extraction requires passing shared state via imports from `shared-state.ts`
- Some deeply nested functions (e.g., inside `renderBulkRenameDialog`) may stay nested
- Each extraction must preserve the IIFE build output (single bundle)
