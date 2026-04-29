---
name: Screen-scoped variables rule
description: Per-screen XPath/selector configs (e.g. HomepageDashboardVariables) must never collide across screens; each screen owns an isolated namespace
type: constraint
---

## Rule

Every screen-specific config object (XPath maps, selector tables, layout enums) MUST be:

1. **Named after the screen** — e.g. `HomepageDashboardVariables`, `MacroControllerVariables`, `OptionsPageVariables`.
2. **Isolated** — no key in one screen's config may also exist in another screen's config with a different value/meaning.
3. **Imported only by code scoped to that screen** — no cross-screen imports of these configs.

## Why

The Lovable extension overlays UI on multiple distinct screens (home, dashboard, project view, macro controller, options). Sharing a single XPath/selector table caused silent collisions where one screen's update broke another. Screen-scoped configs make the blast radius of a DOM change exactly one screen.

## How to apply

- New screen feature → new `<ScreenName>Variables` object in `src/content/<screen>/`.
- Never put screen XPaths in a shared `selectors.ts`.
- If two screens genuinely share a node (e.g. global header), each screen still keeps its own entry — duplicated values are acceptable, shared keys are not.

## Reference

First spec to formalize this: `spec/21-app/01-chrome-extension/home-screen-modification/03-homepage-dashboard-variables.md`.
