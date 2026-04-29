---
name: E2E manifest-derived extension paths
description: All Playwright E2E specs must navigate to popup/options via shared fixture helpers; hard-coded popup.html / options.html / chrome-extension:// templates banned by scripts/check-no-hardcoded-extension-paths.mjs
type: standard
---

`tests/e2e/fixtures.ts` is the SOLE source of truth for chrome-extension:// URLs in E2E tests. It exports:

- `EXTENSION_PATHS.{popup,options,root}` — manifest-derived paths
- `popupUrl(id)` / `optionsUrl(id)` / `extensionUrl(id, relPath)` — URL builders
- `openPopupPage(ctx, id)` / `openOptionsPage(ctx, id)` / `openExtensionPage(ctx, id, which)` — open + waitForLoadState helpers
- `popup` / `options` Playwright fixtures (auto-injected per test, lazy)

Spec files MUST NOT contain literal `popup.html`, `options.html`, or hand-built `chrome-extension://${id}/...` template strings. The manifest is the single source of truth — vite.config.extension.ts can rename these paths and any spec that bypasses the helpers will silently break the next time the build layout shifts (this is what produced the ERR_FILE_NOT_FOUND wave that motivated this contract).

Enforcement: `scripts/check-no-hardcoded-extension-paths.mjs` (CLI: `pnpm lint:e2e-paths` / `pnpm lint:e2e-paths:json`) scans `tests/e2e/**/*.spec.ts` line-by-line with three rules (literal-popup-html, literal-options-html, manual-chrome-extension-url), exits 1 on any violation, and skips comment lines safely (does NOT use a naive `//` comment stripper that would eat URLs). Escape hatch: `// allow-extension-path-literal` on the line immediately above an intentional literal.

Migration done in v2.92.0+: removed local `POPUP_URL` constants from `cold-start.spec.ts` and `script-injection.spec.ts` (3 occurrences each) and replaced manual `context.newPage() + goto(POPUP_URL(id))` patterns with `openPopupPage(context, extensionId)`.
