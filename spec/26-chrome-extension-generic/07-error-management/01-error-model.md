# AppError Model

**Version:** 1.0.0
**Updated:** 2026-04-24
**Status:** Authored
**AI Confidence:** High
**Ambiguity:** Low

> *Generic blueprint — no project-specific identifiers. If you find one, file an issue.*

---

## Concept

`AppError` is the **single error type** carried across every world of the
extension: background service worker, content scripts (ISOLATED world),
options page, popup, devtools, and the page-injected SDK (MAIN world). It
extends the native `Error` class so existing `try/catch` and stack collection
keep working, but adds five mandatory diagnostic fields and a JSON
serialisation contract for cross-world transport (`postMessage`,
`chrome.runtime.sendMessage`, broadcast channels).

The model is intentionally **flat and primitive-only**. Every field is a
string, number, boolean, or `null` so the same instance can be:

1. Logged to console with full fidelity.
2. Serialised to JSON for the diagnostic ZIP export (`07-diagnostic-export.md`).
3. Inserted into a SQLite `Errors` table without further normalisation.
4. Replayed in another world via `AppError.fromJSON(...)`.

Anything that cannot be represented as a primitive (DOM nodes, class
instances, `Map`, `Set`, function references) MUST be summarised into the
`context` map as a string before construction. This is the rule that keeps
errors transportable.

---

## Canonical shape

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `"AppError"` (literal) | yes | Discriminator for `instanceof`-equivalent checks across worlds. |
| `code` | `string` (SCREAMING_SNAKE_CASE) | yes | Stable identifier from the registry (see `02-error-code-registry.md`). |
| `severity` | `"info" \| "warn" \| "error" \| "fatal"` | yes | Drives logger sink + UI badge colour. Defaults to `"error"`. |
| `message` | `string` | yes (auto) | Human-readable line: `` `[${code}] ${reason}` ``. Built by the constructor. |
| `reason` | `string` | yes | Plain-English cause, ≤ 140 chars, no stack noise. |
| `path` | `string \| null` | conditional | **CODE-RED** — required for any FS / storage / DB error. See `03-file-path-error-rule.md`. |
| `missing` | `string \| null` | conditional | **CODE-RED** — what was expected but absent (`"file"`, `"key:userToken"`, `"table:Sessions"`). |
| `timestamp` | `string` (ISO-8601 UTC) | yes (auto) | Set by constructor; immutable thereafter. |
| `stack` | `string \| null` | yes (filtered) | Native stack with `chunk-*.js` / `assets/*.js` frames removed (`06-stack-trace-filtering.md`). |
| `context` | `Record<string, string \| number \| boolean \| null> \| null` | optional | Free-form diagnostics — **no PII, no secrets, no objects**. |

`AppErrorJSON` mirrors the runtime shape one-for-one. There is no extra wire
schema — the JSON form *is* the canonical form.

---

## TypeScript signatures

```ts
export type ErrorSeverity = "info" | "warn" | "error" | "fatal";

export interface AppErrorContext {
    readonly [key: string]: string | number | boolean | null;
}

export interface AppErrorJSON {
    readonly name: "AppError";
    readonly code: string;
    readonly severity: ErrorSeverity;
    readonly message: string;
    readonly reason: string;
    readonly path: string | null;
    readonly missing: string | null;
    readonly timestamp: string;
    readonly stack: string | null;
    readonly context: AppErrorContext | null;
}

export class AppError extends Error {
    readonly name: "AppError";
    readonly code: string;
    readonly severity: ErrorSeverity;
    readonly reason: string;
    readonly path: string | null;
    readonly missing: string | null;
    readonly timestamp: string;
    readonly context: AppErrorContext | null;

    constructor(input: {
        code: string;
        reason: string;
        severity?: ErrorSeverity;
        path?: string | null;
        missing?: string | null;
        context?: AppErrorContext | null;
        cause?: unknown;
    });

    static fromFsFailure(input: {
        code: string;
        path: string;        // mandatory
        missing: string;     // mandatory
        reason: string;
        severity?: ErrorSeverity;
        context?: AppErrorContext;
        cause?: unknown;
    }): AppError;

    static fromJSON(json: AppErrorJSON): AppError;
    static isAppError(value: unknown): value is AppError;
    toJSON(): AppErrorJSON;
}
```

Reference implementation lives in
`12-templates/error-model.template.ts` — copy that file verbatim into
`src/types/error-model.ts` of any new project.

---

## Construction patterns

```ts
// 1. Generic logic error (no FS involvement) — context optional.
throw new AppError({
    code: "AUTH_TOKEN_MISSING",
    reason: "Bearer token resolver returned null after readiness gate.",
    severity: "error",
    context: { source: "background", attempt: 1 },
});

// 2. CODE-RED filesystem / storage failure — MUST use the helper.
//    The helper's `path` and `missing` parameters are non-nullable,
//    which is how the type system enforces the rule.
throw AppError.fromFsFailure({
    code: "STORAGE_KEY_MISSING",
    path: "chrome.storage.local",
    missing: "key:userPreferences",
    reason: "Expected user preferences after onboarding completion.",
});

// 3. Wrapping a foreign error from a library — preserve the cause.
try {
    await db.exec(sql);
} catch (cause) {
    throw new AppError({
        code: "DB_QUERY_FAILED",
        reason: "Sessions table insert rejected.",
        path: "sqlite:Sessions",
        missing: null,
        cause,
    });
}
```

---

## Cross-world transport rules

1. **Serialise on send.** Every world that posts an error MUST call
   `error.toJSON()` first. Sending the raw instance via `postMessage` is
   allowed (structured clone copies own properties) but the receiver loses
   methods and the discriminator. JSON is the contract.
2. **Rehydrate on receive.** The receiving world calls
   `AppError.fromJSON(payload)` to restore the instance, which restores the
   filtered stack and original timestamp.
3. **Never mutate after construction.** All public fields are `readonly`.
   To add diagnostics, build a *new* `AppError` with a richer `context`.
4. **No nested errors in `context`.** Use `cause` (native `Error.cause`) for
   the underlying error and let the registry code disambiguate.

---

## Common pitfalls

| Pitfall | Why it breaks | Fix |
|---------|---------------|-----|
| Throwing `new Error("something failed")` | No code, no severity, no transport contract — diagnostic export drops it. | Always throw `AppError` (or wrap at the boundary). |
| Putting a `Map` / DOM node in `context` | Structured clone fails; postMessage rejects the payload. | Stringify summaries: `{ tagName: el.tagName, mapSize: m.size }`. |
| Storing tokens or PII in `reason` / `context` | Diagnostic ZIP is shareable; secrets leak. | Replace with placeholders: `{ tokenPresent: true }`. |
| Setting `severity: "info"` for a thrown error | Loggers route info to console only; the error is lost from the badge count. | Throw with `error` or `fatal`; reserve `info`/`warn` for non-thrown logs. |
| Using `path: ""` instead of `null` | Empty strings pass truthy checks downstream and corrupt the diagnostic export. | Use `null` when not applicable; the helper enforces non-empty for FS errors. |
| Calling `JSON.stringify(error)` directly | Native `Error` serialises to `{}` — fields are non-enumerable. | Always go through `error.toJSON()`. |

---

## DO / DO NOT / VERIFY

**DO**
- Construct every error through `AppError` (or `AppError.fromFsFailure` for FS / storage / DB).
- Serialise with `toJSON()` before any cross-world send.
- Filter the stack via the built-in helper — never ship raw stacks.
- Treat `code` as a public API: changing one is a breaking change.

**DO NOT**
- Throw bare `Error`, string literals, or POJOs.
- Mutate `code`, `reason`, `path`, `missing`, `timestamp`, or `stack` after construction.
- Place class instances, functions, or unbounded blobs in `context`.
- Log secrets, tokens, or PII anywhere on the error.

**VERIFY**
- `AppError.isAppError(value)` returns `true` after a round-trip through `toJSON` → `fromJSON`.
- Every CODE-RED throw site has non-null `path` *and* `missing` (TypeScript will fail the build if you used `fromFsFailure`).
- `error.stack` contains no `chunk-*.js` or `assets/*.js` frames.
- The diagnostic export ZIP includes the error in `logs.txt` with all nine fields populated.

---

## Cross-References

| Reference | Location |
|-----------|----------|
| Reference implementation | `../12-templates/error-model.template.ts` |
| Error code registry | `./02-error-code-registry.md` |
| CODE-RED FS rule | `./03-file-path-error-rule.md` |
| Logger contract | `./04-namespace-logger.md` |
| Stack-trace filtering | `./06-stack-trace-filtering.md` |
| Diagnostic export | `./07-diagnostic-export.md` |
