# 03 — System Architecture

**Version**: v7.17
**Last Updated**: 2026-02-25

---

## Overview

The Automator is a desktop automation tool built with **AutoHotkey v2** (Windows) that injects **JavaScript controllers** into the Chrome browser via DevTools Console. It automates workspace and project management on the Lovable.dev web IDE.

---

## Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AHK v2 Layer (Desktop)                     │
│                                                               │
│  Automator.ahk ─── Entry point, hotkey registration           │
│       │                                                       │
│       ├── Config.ahk ─── Reads config.ini into global vars    │
│       │     ├── Config/Hotkeys.ahk                            │
│       │     ├── Config/ComboSwitch.ahk                        │
│       │     ├── Config/MacroLoop.ahk                          │
│       │     ├── Config/CreditStatus.ahk                       │
│       │     ├── Config/AhkTiming.ahk                          │
│       │     ├── Config/Gmail.ahk                              │
│       │     ├── Config/General.ahk                            │
│       │     ├── Config/Validate.ahk                           │
│       │     └── Config/Watcher.ahk                            │
│       │                                                       │
│       ├── JsInject.ahk ─── DevTools Console injection         │
│       │     InjectViaDevTools() ─── Full open+paste            │
│       │     InjectJSQuick() ─── Paste-only (Console focused)  │
│       │     ClickPageContent() ─── Context anchoring           │
│       │                                                       │
│       ├── Combo.ahk ─── ComboSwitch orchestration             │
│       │     RunCombo(direction) ─── 3-tier fast path           │
│       │     BuildComboJS() ─── Placeholder replacement         │
│       │                                                       │
│       ├── MacroLoop.ahk ─── MacroLoop orchestration           │
│       │     MacroLoop/Lifecycle.ahk ─── Start/stop/toggle     │
│       │     MacroLoop/Embed.ahk ─── Script injection + bundle │
│       │     MacroLoop/Routing.ahk ─── Smart shortcuts          │
│       │     MacroLoop/Helpers.ahk ─── URL/project extraction  │
│       │                                                       │
│       ├── ExportCompiledJS.ahk ─── Export compiled JS          │
│       │     ExportComboJS() ─── combo.js only                  │
│       │     ExportMacroLoopJS() ─── macro-looping.js only      │
│       │     ExportBundledJS() ─── Full bundle (all 3 scripts)  │
│       │                                                       │
│       └── Utils.ahk ─── Logging (InfoLog, SubLog, etc.)       │
└─────────────────────────────────────────────────────────────┘
                              │
                    Ctrl+V paste into DevTools Console
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 JS Layer (Browser — injected)                 │
│                                                               │
│  combo.js ──────── ComboSwitch controller                     │
│  │  ├── Domain guard (hostname validation)                    │
│  │  ├── Idempotent init (marker element check)                │
│  │  ├── createControllerUI() ─── Floating draggable panel     │
│  │  ├── runComboSwitch(dir) ─── 8-step transfer process       │
│  │  ├── checkCreditsViaApi() ─── API credit fetch             │
│  │  ├── parseApiResponse() ─── Data normalization             │
│  │  ├── moveToWorkspace() ─── PUT /move-to-workspace          │
│  │  ├── autoDetectCurrentWorkspace() ─── XPath-only detection (v7.17)     │
│  │  └── MutationObserver ─── SPA persistence                  │
│  │                                                             │
│  macro-looping.js ── MacroLoop controller                     │
│     ├── Same structure as combo.js                             │
│     ├── runCycle() ─── Timed credit check + auto-move          │
│     ├── moveToAdjacentWorkspace() ─── Smart switching          │
│     ├── exportWorkspacesAsCsv() ─── CSV export                 │
│     ├── 📥 Export button ─── Downloads full bundle (v7.17)     │
│     └── Workspace count label ─── Dynamic filter counter       │
└─────────────────────────────────────────────────────────────┘
                              │
                        fetch() calls
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Lovable API Layer                           │
│                                                               │
│  GET  /user/workspaces ─── List all workspaces + credits      │
│  PUT  /projects/{id}/move-to-workspace ─── Move project       │
│                                                               │
│  Note: POST /mark-viewed REMOVED in v7.17                     │
│  Auth: Bearer token (config → localStorage → cookie fallback) │
│  On 401/403: UI shows token expiry with recovery buttons      │
└─────────────────────────────────────────────────────────────┘
```

---

## Injection Pipeline

```
1. User presses hotkey (e.g., Ctrl+Shift+Down)
2. Automator.ahk → calls Combo.ahk RunCombo() or MacroLoop ToggleMacroLoop()
3. AHK reads combo.js / macro-looping.js from disk
4. BuildComboJS() / BuildMacroLoopJS() replaces __PLACEHOLDER__ tokens with config.ini values
5. JsInject.ahk:
   a. First call: Ctrl+Shift+J (opens DevTools Console)
   b. Subsequent: F12 (close) → ClickPageContent() → Ctrl+Shift+J (reopen on Console)
   c. Ctrl+V (paste compiled JS) → Enter (execute)
6. JS self-embeds: creates marker element + floating UI panel
7. Exposes window.__comboSwitch() / window.__macroLoop*() for AHK fast-path
8. (MacroLoop only) Builds full bundle (xpath-utils + macro-loop + combo) and stores
   as window.__exportBundle for the 📥 Export button
```

### Fast Path (3-Tier Recovery)

```
RunCombo(direction)
  ├── Tier 1: window.__comboSwitch exists? → Direct call (~35 chars)
  ├── Tier 2: sessionStorage cache? → eval() cached source (~200 chars)
  └── Tier 3: Full 40KB injection from disk (last resort)
```

---

## Config Module Architecture

All configuration lives in `config.ini` using dot-notation sections:

```
[Hotkeys]          → Keyboard shortcuts
[ComboSwitch.*]    → XPaths, timing, element IDs, fallback descriptors
[MacroLoop.*]      → Loop timing, URLs, XPaths, element IDs, shortcuts
[CreditStatus.*]   → API URL, auth mode, token, retry config
[AHK.Timing]       → Delays for DevTools operations
[Gmail]            → Gmail search automation
[General]          → Browser exe, version, debug flag
```

Each section has a dedicated loader function in `Config/*.ahk` that reads values into global variables.

---

## Key Design Decisions

1. **Single Embedded Script**: One JS file that self-installs, creates UI, and exposes global functions. No repeated injections.
2. **API-Direct Mode**: JS controllers call Lovable API directly via `fetch()`. No AHK-mediated delegation (deprecated in v7.9.7).
3. **Configurable Everything**: All XPaths, element IDs, timings, and API settings in config.ini.
4. **Domain Guard**: JS validates `window.location.hostname` before executing. Prevents accidental execution in DevTools context.
5. **Idempotent Init**: If the marker element already exists, skip re-initialization. Preserves in-memory state across re-injections.
