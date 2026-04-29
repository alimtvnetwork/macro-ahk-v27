---
name: No unjustified requestAnimationFrame
description: requestAnimationFrame is default-deny in standalone scripts; each use requires a justifying comment
type: constraint
---

`requestAnimationFrame` (and `cancelAnimationFrame`) MUST NOT appear in `standalone-scripts/**` unless the line immediately above carries a comment explaining:

1. **Why** the effect cannot be achieved by a CSS transition declared on the target class.
2. **Why** a single class toggle on a stable `data-*` hook is insufficient.

Acceptable reasons: per-frame canvas/WebGL drawing, scroll-driven layout calculation that must read measurements after the next paint, throttling of high-frequency input. "Force a paint before changing a class" is **not** an acceptable reason — declare the transition on the class instead.

```ts
// ✅ ok — justified
// rAF used to read computed bounding box AFTER React paints the new layout,
// then schedule the scroll snap. CSS transition cannot read post-layout coords.
requestAnimationFrame(() => snapTo(measureRow(rowEl)));

// ❌ wrong — "force a paint"
requestAnimationFrame(() => {
    requestAnimationFrame(() => {
        el.setAttribute("data-state", "hiding");   // a CSS transition would do this
    });
});
```

**Why**: 2026-04-24 banner-hider RCA — double-nested `rAF` was added before a class change to "force a paint." The CSS transition on the target class already handles the timing. The `rAF` calls were dead complexity that masked the real fix (declare the transition on the class).

**How to apply**: Pre-merge grep on changed files for `requestAnimationFrame` — every hit must have a justifying comment on the previous line.
