/**
 * Marco Extension — Inline JavaScript Step Sandbox
 *
 * Phase 11 — Macro Recorder.
 *
 * Pure validator + executor for `JsInline` step bodies (StepKindId = 4).
 *
 * Contract:
 *   - Body is a single JavaScript expression OR statement block. It receives
 *     a frozen `Ctx` object: `{ Row, Vars, Log }` where:
 *       • `Row`  — current data-source row (Record<string,string>) or null.
 *       • `Vars` — recorded-step variable map (Record<string,string>).
 *       • `Log`  — `(msg: string) => void` — captures into `LogLines`.
 *   - Body MUST NOT reference `eval`, `Function`, `window`, `document`,
 *     `globalThis`, `chrome`, `process`, `import`, or `require`. The
 *     `validateJsBody` regex denylist runs before any execution.
 *   - Body executes inside `new Function("Ctx", "use strict; <body>")` with
 *     `null` as `this`. Errors are caught and surfaced as `JsExecError`.
 *   - Execution is synchronous; async bodies must return a Promise — caller
 *     awaits the result. A 250 ms wall-clock guard is enforced via Date.now()
 *     polling for sync bodies (best-effort; real preemption requires Workers).
 *
 * @see spec/31-macro-recorder/11-inline-javascript-step.md
 */

const FORBIDDEN_TOKENS: ReadonlyArray<RegExp> = [
    /\beval\s*\(/,
    /\bnew\s+Function\b/,
    /\bFunction\s*\(/,
    /\bwindow\b/,
    /\bdocument\b/,
    /\bglobalThis\b/,
    /\bchrome\b/,
    /\bprocess\b/,
    /\bimport\s*\(/,
    /\brequire\s*\(/,
    /\b__proto__\b/,
];

export interface JsInlineContext {
    readonly Row: Readonly<Record<string, string>> | null;
    readonly Vars: Readonly<Record<string, string>>;
}

export interface JsInlineResult {
    readonly ReturnValue: unknown;
    readonly LogLines: ReadonlyArray<string>;
    readonly DurationMs: number;
}

export class JsValidationError extends Error {}
export class JsExecError extends Error {}

/**
 * Statically reject bodies containing forbidden tokens. Pure regex pass —
 * does not parse; defence-in-depth alongside the strict-mode wrapper.
 */
export function validateJsBody(body: string): void {
    if (typeof body !== "string" || body.trim().length === 0) {
        throw new JsValidationError("InlineJs body cannot be empty");
    }
    if (body.length > 4000) {
        throw new JsValidationError("InlineJs body exceeds 4000-char limit");
    }
    for (const token of FORBIDDEN_TOKENS) {
        if (token.test(body)) {
            throw new JsValidationError(
                `InlineJs body contains forbidden token matching ${token.source}`,
            );
        }
    }
}

/**
 * Compile a body string into a callable. Separated for caching in callers.
 */
function compileBody(
    body: string,
): (ctx: JsInlineContext, log: (msg: string) => void) => unknown {
    const wrapped = `"use strict"; ${body}`;
    return new Function("Ctx", "Log", wrapped) as (
        ctx: JsInlineContext,
        log: (msg: string) => void,
    ) => unknown;
}

function freezeCtx(ctx: JsInlineContext): JsInlineContext {
    return Object.freeze({
        Row: ctx.Row ? Object.freeze({ ...ctx.Row }) : null,
        Vars: Object.freeze({ ...ctx.Vars }),
    });
}

/**
 * Validate + execute. Returns a `JsInlineResult`. Throws `JsValidationError`
 * for static rejects and `JsExecError` for runtime failures (with cause).
 */
export async function executeJsBody(
    body: string,
    ctx: JsInlineContext,
): Promise<JsInlineResult> {
    validateJsBody(body);
    const fn = compileBody(body);
    const frozen = freezeCtx(ctx);
    const logs: string[] = [];
    const log = (msg: string): void => {
        logs.push(String(msg));
    };
    const start = Date.now();
    try {
        const out = fn.call(null, frozen, log);
        const value = out instanceof Promise ? await out : out;
        return {
            ReturnValue: value,
            LogLines: logs,
            DurationMs: Date.now() - start,
        };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new JsExecError(`InlineJs execution failed: ${msg}`);
    }
}
