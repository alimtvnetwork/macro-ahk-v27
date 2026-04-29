---
name: No type casting in standalone scripts
description: Forbid `as T`, `as unknown as T`, and `<T>x` casts; fix the upstream type instead
type: constraint
---

In any file under `standalone-scripts/`, the following are forbidden:

- `expression as T` (other than `as const`)
- `expression as unknown as T`
- `<T>expression` (angle-bracket cast)

If the type system says the expression is wrong, the **upstream type** is wrong — fix it there. Examples of correct fixes:

- DOM lookup returning `Element | null` when caller wants `HTMLElement`: add a typed helper `queryHtmlElement(selector): HTMLElement | undefined` to the SDK and use it.
- Message payload typed as `JsonValue`: add a typed `RiseupAsiaMessage<TPayload>` and have the dispatcher narrow on a `kind` discriminator.
- Third-party API returning `any`: write a typed wrapper and import that wrapper from a single file.

**Why**: Casts are the single largest source of runtime drift. They tell the compiler to stop helping. The 2026-04-24 banner-hider RCA found `as HTMLElement` and `as unknown as X` used to satisfy `tsc` instead of fixing the function signatures.

**How to apply**: Pre-merge grep on the changed file for `\bas [A-Z]` (excluding `as const`). Any hit must be justified in the PR description with a link to the type that needs fixing — and that type fix must be in the same PR.
