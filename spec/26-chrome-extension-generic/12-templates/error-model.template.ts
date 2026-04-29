/**
 * TEMPLATE — spec/26-chrome-extension-generic/12-templates/error-model.template.ts
 *
 * Purpose: AppError class + serialisation helpers. The single error type used
 *          across background, content, options, popup, and the page-injected
 *          SDK. Designed for cross-world transport (postMessage / sendMessage).
 *
 * Last reviewed: 2026-04-24
 *
 * Tokens to replace before use: none.
 *
 * CODE-RED rule: every filesystem / chrome.storage / IndexedDB / SQLite error
 * MUST include `path`, `missing`, and `reason`. Helpers below enforce the
 * shape — use `AppError.fromFsFailure(...)` to guarantee compliance.
 */

export type ErrorSeverity = "info" | "warn" | "error" | "fatal";

export interface AppErrorContext {
    /** Free-form key/value diagnostics (no PII, no secrets). */
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
    public readonly name = "AppError" as const;
    public readonly code: string;
    public readonly severity: ErrorSeverity;
    public readonly reason: string;
    public readonly path: string | null;
    public readonly missing: string | null;
    public readonly timestamp: string;
    public readonly context: AppErrorContext | null;

    constructor(input: {
        code: string;
        reason: string;
        severity?: ErrorSeverity;
        path?: string | null;
        missing?: string | null;
        context?: AppErrorContext | null;
        cause?: unknown;
    }) {
        super(`[${input.code}] ${input.reason}`);
        this.code = input.code;
        this.severity = input.severity ?? "error";
        this.reason = input.reason;
        this.path = input.path ?? null;
        this.missing = input.missing ?? null;
        this.context = input.context ?? null;
        this.timestamp = new Date().toISOString();
        if (input.cause !== undefined) (this as unknown as { cause: unknown }).cause = input.cause;
    }

    /** Construct an FS / storage / DB error with mandatory CODE-RED fields. */
    static fromFsFailure(input: {
        code: string;
        path: string;
        missing: string;
        reason: string;
        severity?: ErrorSeverity;
        context?: AppErrorContext;
        cause?: unknown;
    }): AppError {
        return new AppError({ ...input, severity: input.severity ?? "error" });
    }

    /** Filter chunk-*.js / assets/*.js noise from the stack — useless frames. */
    private static filterStack(raw: string | undefined): string | null {
        if (!raw) return null;
        return raw
            .split("\n")
            .filter((line) => !/\/(?:chunks?|assets)\/[^/]+-[a-z0-9]+\.js/i.test(line))
            .join("\n");
    }

    toJSON(): AppErrorJSON {
        return {
            name: this.name,
            code: this.code,
            severity: this.severity,
            message: this.message,
            reason: this.reason,
            path: this.path,
            missing: this.missing,
            timestamp: this.timestamp,
            stack: AppError.filterStack(this.stack),
            context: this.context,
        };
    }

    static fromJSON(json: AppErrorJSON): AppError {
        const restored = new AppError({
            code: json.code,
            severity: json.severity,
            reason: json.reason,
            path: json.path,
            missing: json.missing,
            context: json.context,
        });
        if (json.stack !== null) (restored as unknown as { stack: string }).stack = json.stack;
        (restored as unknown as { timestamp: string }).timestamp = json.timestamp;
        return restored;
    }

    static isAppError(value: unknown): value is AppError {
        return value instanceof AppError ||
            (typeof value === "object" && value !== null &&
                (value as { name?: unknown }).name === "AppError");
    }
}
