# Standalone Scripts — Global Instruction Types

**Status**: 🟢 Locked for Q1–Q4 (2026-04-24). Q5 still open — does not block the 19-file build-out.
**Owner**: Riseup Asia LLC
**Source folder**: `standalone-scripts/types/instruction/`
**Driving conversation**: 2026-04-24 chat with reviewer (logged here in full so nothing is lost).

---

## 1. Problem statement

Today every standalone script (`marco-sdk`, `xpath`, `macro-controller`, `payment-banner-hider`) declares **its own** `ProjectInstruction` interface inside its local `src/instruction.ts`. The shapes have already drifted:

- `world: "MAIN" | "ISOLATED"` is repeated as a string union in four files.
- `runAt: "document_idle" | "document_end"` is sometimes typed, sometimes left as `string`.
- `assets.scripts` uses an in-place array element type (`Array<{ file; order; isIife? }>`) — every script copy-pastes a slightly different version.
- XPath storage is ad-hoc: most scripts hard-code selectors inside their bundle. There is no shared way to declare grouped or relative XPaths.
- `interface` and `type` keywords are mixed across the codebase.
- The runtime namespace types (`riseup-namespace.d.ts`) still surface `unknown` in `Logger.error`, `Logger.console`, `Logger.stackTrace` — these escape the policy because the policy only forbids `unknown` *in code*, not in `.d.ts` ambient declarations.

## 2. Reviewer requirements (verbatim, distilled)

> "We should have a globally defined class or type which everyone should inherit … just like the instruction, instruction could have like additional parameters."

→ Single `ProjectInstruction<TSettings>` shared by every script. Project-specific parts flow through generics.

> "Not the world as main or isolated, but have like proper enum."

→ Replace `"MAIN" | "ISOLATED"` with `enum InjectionWorld`. Same treatment for `runAt`, XPath kind, match type, and asset inject target.

> "Rather than just mentioning the array in-place type, try to have a specific and other types."

→ Every array element type lives in its own named file: `CssAsset`, `ConfigAsset`, `ScriptAsset`, `TemplateAsset`, `PromptAsset`, `TargetUrl`, `CookieSpec`, `ProjectDependency`, `XPathEntry`, `XPathGroup`.

> "There should be one display name, another is the name."

→ Keep `name` (Identifier, kebab-case) and `displayName` (human-readable) as separate fields — already correct, formalised here.

> "The XPath section could have grouped XPath. That means in that case, you'll have a name of the group, and then inside that, that would have a wrapping XPath. So for the XPath, it could have like two ways. One would be the direct XPath … There could be relative XPath, so relative to what? So there would be another like root variable along with that, it would be combining with."

→ Discriminated union `XPathEntry = XPathDirectEntry | XPathRelativeEntry`. Direct entries carry a complete XPath. Relative entries carry a fragment plus a `relativeTo: Identifier` pointing at the parent entry (resolved at runtime). `XPathGroup` carries a `name`, an optional `wrappingXPath`, and a list of `XPathEntry`. `XPathRegistry` aggregates top-level entries plus groups.

> "Standard scripts, there should be something called global types, project … types I believe."

→ Lives at `standalone-scripts/types/` (already present). New `instruction/` subfolder hosts these types so the existing `riseup-namespace.d.ts` and `project-namespace-shape.d.ts` are not disturbed.

> "Each one of the types should be its own file."

→ One file per type. Folder layout in `instruction/00-readme.md`.

> "Make sure that we do not type the definitions in place. The definitions should be in other files, not in place."

→ Every type used as a property type, generic parameter, array element, or function parameter MUST be imported by name. Inline object types are forbidden.

> "Do not name things like FN. If it is function name, write the full form."

→ ESLint `id-denylist` rule banning `fn`, `cb`, `el`, `msg`, `cfg`, `ctx`, `obj`, `arr`, `str`, `num`, `tmp`, `val`. Renames in this draft: `isIife` → `isImmediatelyInvokedFunction`, `world` → `injectionWorld`, `inject` → `injectInto`.

> "Either use interface or use types. Don't use a mixture of it … let's go with the type rather than interface."

→ Every file in `standalone-scripts/types/instruction/` uses `type`. ESLint `@typescript-eslint/consistent-type-definitions: ["error", "type"]` will be enabled scoped to this folder once the migration completes.

> "Do not have any unknown. Inside the namespace log API, I do see lots of unknowns."

→ Tracked as a follow-up: `Logger.error(functionName, message, error?: CaughtError)`, `Logger.console(functionName, message, ...args: ReadonlyArray<JsonValue>)`, `Logger.stackTrace(functionName, message, error?: CaughtError)`. `CaughtError` and `JsonValue` already exist in the codebase.

> "Why the linter is not finding it or breaking it, that is another question."

→ Root cause: the `unknown` policy ESLint rule is registered on `.ts` files but excludes `.d.ts`. Fix: extend the same rule to ambient declarations under `standalone-scripts/types/`. Tracked as a separate plan item.

## 3. File-by-file inventory

See `standalone-scripts/types/instruction/00-readme.md` for the full tree. Highlights:

- **`enums/`** — `InjectionWorld`, `InjectionRunAt`, `MatchType`, `XPathKind`, `AssetInjectTarget`. All `const enum` with explicit string values for JSON compatibility.
- **`primitives/`** — `Identifier`, `VersionString`, `UrlPattern`. Branded strings to prevent accidental cross-assignment.
- **`xpath/`** — `XPathDirectEntry`, `XPathRelativeEntry`, `XPathEntry` (union), `XPathGroup`, `XPathRegistry`.
- **`assets/`** — `CssAsset`, `ConfigAsset`, `ScriptAsset`, `TemplateAsset`, `PromptAsset`, `AssetBundle`.
- **`seed/`** — `TargetUrl`, `CookieBinding`, `CookieSpec`, `EmptySettings`, `SeedBlock<TSettings>`.
- **`dependency/`** — `ProjectDependency`.
- **`project-instruction.ts`** — `ProjectInstruction<TSettings>` composing all of the above.

## 4. Migration impact (no code touched yet)

| Project | Local type to delete | Replacement |
|---|---|---|
| `marco-sdk/src/instruction.ts` | `ProjectInstruction`, `SeedBlock` | `ProjectInstruction<EmptySettings>`, `SeedBlock<EmptySettings>` |
| `xpath/src/instruction.ts` | local `ProjectInstruction` | `ProjectInstruction<EmptySettings>` |
| `macro-controller/src/instruction.ts` | local `ProjectInstruction`, settings inline shape | `ProjectInstruction<MacroControllerSettings>` (settings type added next to controller) |
| `payment-banner-hider/src/instruction.ts` | local `ProjectInstruction` | `ProjectInstruction<EmptySettings>` |

`scripts/compile-instruction.mjs` reads `instruction.ts` via `tsx` and writes `instruction.json`. The JSON shape on disk must stay byte-identical post-migration so the runtime loader and `check-standalone-dist.mjs` keep passing. Field-rename mapping (`world` → `injectionWorld`, `isIife` → `isImmediatelyInvokedFunction`, `inject` → `injectInto`) is opt-in: `compile-instruction.mjs` will emit the legacy keys for one release cycle so the runtime can be migrated independently.

## 5. Decisions (Q1–Q4 locked 2026-04-24)

These answers are binding for the 19-file build-out. Q5 is the only item still open and does **not** block migration.

### Q1 — `const enum` (✅ chosen) over `as const` literal unions

**Decision**: Use `export const enum Name { Member = "value" }` for every closed string set (`InjectionWorld`, `InjectionRunAt`, `MatchType`, `XPathKind`, `AssetInjectTarget`).

**Why**:
1. Zero runtime cost — `const enum` members are inlined by `tsc`, identical bundle size to a string literal.
2. Reverse-lookup not needed (we never go from `"MAIN"` back to `InjectionWorld.Main`), so the classic `enum` runtime-object footprint is avoided by `const`.
3. Member access (`InjectionWorld.Main`) reads as a typed identifier in editors; `as const` literal unions force `"MAIN"` magic-strings at every call site, which the standards memo `mem://standards/no-type-casting` and the reviewer's "magic strings should be enums" rule both ban.
4. Matches the existing pattern already shipped in `enums/injection-world.ts`, `enums/injection-run-at.ts`, `enums/match-type.ts`.

**Required tsconfig**: `"isolatedModules": true` projects must use `preserveConstEnums: true` (already set in `tsconfig.macro.json`). Confirmed safe.

### Q2 — `ProjectInstruction.xpaths` is **optional** (✅)

**Decision**: `xpaths?: XPathRegistry` — optional.

**Why**:
1. `marco-sdk` and `payment-banner-hider` legitimately have **zero** XPaths. Forcing `xpaths: { entries: [], groups: [] }` everywhere is noise.
2. Optionality maps cleanly to the existing `assets.css: []` / `assets.prompts: []` pattern — empty collections are allowed, missing collections mean "not applicable".
3. Consumers must use `instruction.xpaths?.entries ?? []` — already the project's defensive-property-access standard (`mem://standards/formatting-and-logic`).
4. A required field would force a sentinel value and break the rule "no in-place definitions" (the empty literal would be in-place).

### Q3 — `EmptySettings` named alias (✅) over inline `Record<string, never>`

**Decision**: Keep `EmptySettings = Record<string, never>` as a named alias in `seed/empty-settings.ts`.

**Why**:
1. Reviewer's hard rule: "do not type the definitions in place." Inline `Record<string, never>` at every settings-less script's call site violates this directly.
2. Named alias gives a single search target — `grep EmptySettings` instantly lists every script with no settings, which is the audit query CI/scaffolders need.
3. Self-documenting at the call site: `SeedBlock<EmptySettings>` reads as "this script intentionally has no settings", whereas `SeedBlock<Record<string, never>>` reads as a TypeScript trick.
4. Cost is one file, one line — already authored.

### Q4 — Rename `world` → `injectionWorld`, `runAt` → `injectionRunAt`, `isIife` → `isImmediatelyInvokedFunction`, `inject` → `injectInto` (✅)

**Decision**: All four renames go in. The new global types use the long names. Per-script `instruction.ts` files map the old names through during migration via a thin adapter (`scripts/compile-instruction.mjs`, plan item 0.2) so existing seed IDs do not change.

**Why**:
1. Reviewer's hard rule: "Do not name things like FN. If it is function name, write the full form." `isIife` is the textbook violation.
2. `world` is ambiguous in a Chrome-extension codebase — there is also "execution context", "isolation boundary", "page context". `injectionWorld` is unambiguous and grep-stable.
3. `runAt` collides with Chrome's own `chrome.scripting.RegisteredContentScript.runAt` field — keeping the short name forces every reader to disambiguate "ours" vs. "Chrome's". `injectionRunAt` is ours.
4. `inject: "head"` is a verb where a noun is expected. `injectInto: AssetInjectTarget.Head` reads as "inject into HEAD" and the enum gives extensibility (`Body`, `BeforeBodyClose`).
5. Migration is mechanical (string replace) and gated by ESLint `id-denylist` for the old names once the migration completes (plan item 0.10).

### Q5 — Runtime `StandaloneScript` base class (🟡 still open)

**Status**: Deferred. Not required for the 19-file types build-out. Will be answered after the `PaymentBannerHider` class rewrite (plan item 0.11) gives us a concrete reference implementation to extract a base from. Tracked in `plan.md` as a separate item; do not block on it.

## 6. Out of scope for this spec

- The runtime `PaymentBannerHider` class refactor (separate plan item — covered by the prior banner RCA).
- The Logger `unknown` cleanup in `riseup-namespace.d.ts` (separate plan item — depends on `CaughtError`/`JsonValue` audit).
- The standalone-script scaffolder CLI (separate plan item).

---

## 11. Class architecture (added 2026-04-24)

Every standalone script entry point MUST follow the class shape captured in `mem://standards/class-based-standalone-scripts`:

```ts
// standalone-scripts/payment-banner-hider/src/index.ts
import { PaymentBannerSelectors } from "./payment-banner-selectors";
import { PaymentBannerView } from "./payment-banner-view";

export default class PaymentBannerHider {
    private readonly selectors: PaymentBannerSelectors;
    private readonly view: PaymentBannerView;

    constructor(
        selectors: PaymentBannerSelectors = new PaymentBannerSelectors(),
        view: PaymentBannerView = new PaymentBannerView(),
    ) {
        this.selectors = selectors;
        this.view = view;
    }

    public start(): void { /* ... */ }
    public stop(): void { /* ... */ }
}

new PaymentBannerHider().start();
```

Constraints:

- Single default class export.
- Cohesive sub-responsibilities (selector resolution, view, telemetry, settings IO) become their own classes injected through the constructor with default instances — so tests can substitute fakes.
- No top-level free functions for behaviour. Top-level allowed: the default class, the bootstrap `new …().start()`, and `type` re-exports.

## 12. CSS in its own file (added 2026-04-24)

Every script that needs styling ships a sibling CSS file (`mem://standards/standalone-scripts-css-in-own-file`):

```
standalone-scripts/payment-banner-hider/
├── css/
│   └── payment-banner-hider.css
└── src/
    └── instruction.ts   ← assets.css: [{ file: "css/payment-banner-hider.css", injectInto: AssetInjectTarget.Head }]
```

Hide / show MUST be implemented as a class toggle on a stable `data-marco-banner-hider` attribute, paired with a CSS `transition`. Example:

```css
[data-marco-banner-hider] {
    transition: opacity 200ms ease;
}

[data-marco-banner-hider].marco-banner-hider--hidden {
    opacity: 0;
    pointer-events: none;
}

[data-marco-banner-hider].marco-banner-hider--removed {
    display: none;
}
```

`!important` is forbidden (`mem://standards/no-css-important`). If specificity is losing, fix the selector — never escalate.

## 13. Enums live in the global types folder (added 2026-04-24)

Any closed-set string used by a standalone script MUST be declared as an enum in `standalone-scripts/types/` and imported by name. Examples:

- `BannerLifecyclePhase { Visible, Hiding, Hidden, Removed }` — replaces `"fading"` / `"hidden"` magic strings.
- `BannerEventName { BannerDetected, BannerHidden, BannerRestored }` — replaces ad-hoc message strings.

These join the existing instruction-side enums (`InjectionWorld`, `XPathKind`, `MatchType`, `AssetInjectTarget`, `InjectionRunAt`) under `standalone-scripts/types/instruction/enums/` and a new sibling `standalone-scripts/types/runtime/enums/` for purely runtime concepts.

## 14. No type casts (added 2026-04-24)

`as T`, `as unknown as T`, and `<T>x` are forbidden in `standalone-scripts/` (`mem://standards/no-type-casting`). If a cast feels necessary, the upstream type is wrong. Concretely for the banner-hider:

| Wrong | Right |
|---|---|
| `document.querySelector(sel) as HTMLElement` | `RiseupAsiaMacroExt.Dom.queryHtmlElement(sel): HTMLElement \| undefined` (added once, reused everywhere) |
| `(payload as unknown as BannerMessage)` | `RiseupAsiaMessage<BannerMessage>` discriminated by `kind: BannerEventName` |
| `(window as Window & { … })` | Extend `RiseupAsiaMacroExtNamespace` in the global `.d.ts` |

Every cast removed in the migration must be replaced with a typed helper that lives in the SDK or the global types.

## 15. No error swallowing (added 2026-04-24)

Every `catch` block in a standalone script must call `RiseupAsiaMacroExt.Logger?.error(functionName, message, caught)` and either rethrow or return a typed `Result.err(...)`. Returning `null` / `undefined` / a fallback object is forbidden (`mem://standards/no-error-swallowing`).

Blank line before `return` is required (`mem://standards/blank-line-before-return`).

## 16. Hide strategy (added 2026-04-24)

The banner hide flow is a CSS class toggle plus a `transitionend` listener. No `requestAnimationFrame`. No JS state machine. Pseudocode:

```ts
public hide(element: HTMLElement): void {
    element.classList.add("marco-banner-hider--hidden");
    element.addEventListener(
        "transitionend",
        () => element.classList.add("marco-banner-hider--removed"),
        { once: true },
    );
}
```

Three CSS rules + one method = full feature. `Q5` in §5 covers whether a generic `StandaloneScript` runtime base class should standardise this lifecycle across scripts.

## 17. Pre-write standards check (added 2026-04-24)

Per `mem://standards/pre-write-check`, the agent MUST, before writing any standalone-script file:

1. List `.lovable/memory/standards/` and read every standard whose name overlaps the change.
2. Read at least one sibling file in the target folder to inherit local pattern.
3. Restate in the response which standards apply and how the new file complies.

This precondition exists because the 2026-04-24 banner-hider RCA traced every defect to a memory rule the agent already had access to but did not consult.
