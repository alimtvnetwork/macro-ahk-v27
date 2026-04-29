# 10 — Coding Guidelines Reference (NON-NEGOTIABLE)

Every file in this spec MUST reference this document. Implementing AI MUST read this before generating any code in `src/` for the home-screen feature.

## Hard limits

1. **File ≤ 100 lines** (including imports, blank lines, comments).
2. **Function ≤ 8 lines** (signature line excluded; body counted).

## Control flow

3. Keep `if/else` minimal. Prefer early-return.
4. **No negative conditions in `if` blocks.** Invert the predicate and early-return.
   - Bad: `if (!shouldActivate()) return;`
   - Good: `if (shouldActivate()) { mount(); return; }`

## Naming and constants

5. **No magic strings.** Every literal used more than once, or carrying semantic meaning, becomes an enum or constant.
6. **Enums first**, constants second. String unions only when an enum would force runtime overhead.
7. Constant naming: `SCREAMING_SNAKE_CASE` per memory `constant-naming-convention` (`ID_`, `SEL_`, `ATTR_`, `CSS_`).

## I/O policy

8. Every read, write, save, lookup, message-pass, `document.evaluate`, `scrollIntoView`, `dispatchEvent` is wrapped in `try/catch`.
9. Every `catch` calls `RiseupAsiaMacroExt.Logger.error("HomeScreen.<scope>", caught)` — never bare `console.log` for errors (memory `error-logging-via-namespace-logger`).
10. File/path/XPath errors follow CODE RED format: exact path, what was missing, reason (memory `file-path-error-logging-code-red`).

## Modularity

11. Group by responsibility — one folder, one concern:
    ```
    src/content/home-screen/
        ├── allowed-home-url.enum.ts
        ├── homepage-dashboard-variables.ts
        ├── url-guard.ts
        ├── workspace-dictionary.ts
        ├── search-bar.ts
        ├── focus-selected.ts
        ├── credit-append.ts
        ├── nav-controls.ts
        ├── macro-sync.ts
        └── index.ts (mount/unmount only)
    ```
12. Each module exports a tiny surface (1–3 functions). No god-modules.

## Type safety

13. No explicit `unknown` except in `CaughtError` (memory `unknown-usage-policy`).
14. Defensive property access — `?.` and `??` everywhere external data is consumed (memory `formatting-and-logic`).

## Forbidden

15. No Supabase (memory `no-supabase`).
16. No retry/backoff loops (memory `no-retry-policy`).
17. No `localStorage` for tokens or auth state.
18. No light-mode styles (memory `dark-only-theme`).

## Lint

19. Zero ESLint warnings, zero errors (memory `linting-policy`).

---

## Acknowledgement block (paste at end of every implementation file)

Per user preference (kept), the executing AI must include the following block at the end of the implementation file's commit summary or doc comment:

```text
Do you understand? Always add this part at the end of the writing inside the code block.
Do you understand? Can you please do that?
```
