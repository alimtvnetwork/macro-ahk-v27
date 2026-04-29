/**
 * TEMPLATE — spec/26-chrome-extension-generic/12-templates/namespace-logger.template.ts
 *
 * Purpose: Per-namespace logger contract. The single logging surface allowed
 *          in the codebase. Catch blocks MUST use `logger.error(...)` —
 *          never `console.error`. Stack traces are filtered to drop
 *          chunk-*.js / assets/*.js noise.
 *
 * Last reviewed: 2026-04-24
 *
 * Tokens to replace before use:
 *   <ROOT_NAMESPACE> — JS global namespace this logger attaches to.
 */

import { AppError, type AppErrorJSON, type ErrorSeverity } from "./error-model.template";

/* ───────────────────────────── types ───────────────────────────────────── */

export interface LogEntry {
    readonly timestamp: string;
    readonly namespace: string;
    readonly severity: ErrorSeverity;
    readonly message: string;
    readonly error: AppErrorJSON | null;
    readonly context: Record<string, unknown> | null;
}

export interface LogSink {
    write(entry: LogEntry): void;
}

export interface NamespaceLogger {
    readonly namespace: string;
    info(message: string, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
    error(message: string, error: unknown, context?: Record<string, unknown>): void;
    fatal(message: string, error: unknown, context?: Record<string, unknown>): void;
    child(subNamespace: string): NamespaceLogger;
}

/* ───────────────────────────── sinks ──────────────────────────────────── */

const consoleSink: LogSink = {
    write(entry) {
        const head = `[${entry.namespace}] ${entry.message}`;
        const tail = entry.context ?? entry.error ?? undefined;
        switch (entry.severity) {
            case "info": console.log(head, tail ?? ""); break;
            case "warn": console.warn(head, tail ?? ""); break;
            case "error":
            case "fatal": console.error(head, tail ?? ""); break;
        }
    },
};

const broadcastSink: LogSink = {
    write(entry) {
        if (entry.severity !== "error" && entry.severity !== "fatal") return;
        try {
            chrome.runtime
                .sendMessage({ type: "ERROR_COUNT_CHANGED", payload: { entry } })
                .catch(() => { /* SW may be inactive */ });
        } catch {
            // chrome may be undefined in MAIN world — handled at SDK boundary
        }
    },
};

const sinks: LogSink[] = [consoleSink, broadcastSink];

export function registerLogSink(sink: LogSink): () => void {
    sinks.push(sink);
    return () => {
        const idx = sinks.indexOf(sink);
        if (idx >= 0) sinks.splice(idx, 1);
    };
}

/* ───────────────────── stack-trace + error normalisation ───────────────── */

function normaliseError(value: unknown): AppErrorJSON | null {
    if (value === undefined || value === null) return null;
    if (AppError.isAppError(value)) return (value as AppError).toJSON();
    if (value instanceof Error) {
        return new AppError({
            code: "UNCAUGHT_ERROR",
            reason: value.message || "unknown error",
            cause: value,
        }).toJSON();
    }
    return new AppError({
        code: "NON_ERROR_THROWN",
        reason: typeof value === "string" ? value : JSON.stringify(value),
    }).toJSON();
}

/* ───────────────────────────── factory ────────────────────────────────── */

function emit(
    namespace: string,
    severity: ErrorSeverity,
    message: string,
    error: unknown,
    context: Record<string, unknown> | undefined,
): void {
    const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        namespace,
        severity,
        message,
        error: normaliseError(error),
        context: context ?? null,
    };
    for (const sink of sinks) {
        try { sink.write(entry); } catch { /* a broken sink must not break logging */ }
    }
}

export function createLogger(namespace: string): NamespaceLogger {
    return {
        namespace,
        info(message, context) { emit(namespace, "info", message, undefined, context); },
        warn(message, context) { emit(namespace, "warn", message, undefined, context); },
        error(message, error, context) { emit(namespace, "error", message, error, context); },
        fatal(message, error, context) { emit(namespace, "fatal", message, error, context); },
        child(subNamespace) { return createLogger(`${namespace}.${subNamespace}`); },
    };
}

/* ───────────────────── attach to <ROOT_NAMESPACE> ──────────────────────── */

interface RootNamespaceShape {
    Logger: { create: typeof createLogger; registerSink: typeof registerLogSink };
    Projects: Record<string, unknown>;
}

declare global {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    interface Window { ["<ROOT_NAMESPACE>"]?: RootNamespaceShape & Record<string, any>; }
}

export function attachToRootNamespace(): void {
    const w = window as unknown as Record<string, unknown>;
    const existing = (w["<ROOT_NAMESPACE>"] as RootNamespaceShape | undefined) ?? {
        Logger: { create: createLogger, registerSink: registerLogSink },
        Projects: {},
    };
    existing.Logger = { create: createLogger, registerSink: registerLogSink };
    if (!existing.Projects) existing.Projects = {};
    w["<ROOT_NAMESPACE>"] = existing;
}
