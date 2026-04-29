# UI & Design System

**Version:** 1.0.0
**Updated:** 2026-04-24
**Status:** Placeholder — to be authored
**AI Confidence:** Low (placeholder)
**Ambiguity:** Low

> *Generic blueprint — no project-specific identifiers. If you find one, file an issue.*

---

## Overview

Defines the HSL semantic token system (never raw colors in JSX), the dark-only default theme, typography & spacing scales, the shadcn-style component library with cva variants, the Options page shell, the Popup shell, the injected controller UI pattern, the SDK-side notification system, and per-project customization hooks.

---

## Files in this folder

| # | File | Description |
|---|------|-------------|
| 01 | [01-design-tokens.md](./01-design-tokens.md) | HSL semantic tokens in index.css + tailwind.config
| 02 | [02-dark-only-theme.md](./02-dark-only-theme.md) | Justification, palette, contrast targets
| 03 | [03-typography-spacing.md](./03-typography-spacing.md) | Type scale, spacing scale, layout grid
| 04 | [04-component-library.md](./04-component-library.md) | shadcn-style primitives, variants via cva
| 05 | [05-options-page-shell.md](./05-options-page-shell.md) | Sidebar + animated content area + ThemeProvider
| 06 | [06-popup-shell.md](./06-popup-shell.md) | 360×600 baseline, action log, debug panel
| 07 | [07-injected-controller-ui.md](./07-injected-controller-ui.md) | Floating draggable widget, sentinel CSS, drag handle, dropdown menu
| 08 | [08-notification-system.md](./08-notification-system.md) | SDK-side toast: dedupe window, max-3, copy-to-clipboard diagnostic
| 09 | [09-customization-hooks.md](./09-customization-hooks.md) | Per-project CSS injection slots, theme overrides via CSS variables

---

## Cross-References

| Reference | Location |
|-----------|----------|
| Parent overview | `../00-overview.md` |
| Folder structure rules | `../../01-spec-authoring-guide/01-folder-structure.md` |
