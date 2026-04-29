---
name: Standalone scripts CSS in its own file
description: Every standalone script ships its CSS as a sibling .css file referenced from instruction.assets.css — never inline
type: preference
---

A standalone script that needs CSS MUST:

1. Place the rules in `standalone-scripts/<name>/css/<name>.css` (or a folder of `.css` files when multiple stylesheets are warranted).
2. Reference it from `instruction.ts` via `assets.css: [{ file: "css/<name>.css", injectInto: AssetInjectTarget.Head }]`.
3. NOT use inline `<style>` blobs, `cssText` assignments, or template literals injected at runtime.
4. Hide / show by toggling a class on a stable `data-*` hook — never by writing inline styles from JS.

Example layout:

```
standalone-scripts/payment-banner-hider/
├── css/
│   └── payment-banner-hider.css       ← .marco-banner-hider--hidden { opacity: 0; transition: opacity .2s ease; }
├── src/
│   ├── index.ts                       ← class + class.element.classList.add("marco-banner-hider--hidden")
│   └── instruction.ts                 ← assets.css: [{ file: "css/payment-banner-hider.css", injectInto: AssetInjectTarget.Head }]
```

**Why**: Inline CSS bypasses the build pipeline (no LESS compile, no autoprefixer, no minification, no source map), encourages `!important`, and makes theming impossible. Other standalone scripts (`macro-controller`, `xpath`) already follow the file-on-disk pattern; the banner-hider deviated.

**How to apply**: Pre-merge grep on the file for `<style` and `cssText` — any hit blocks the merge.
