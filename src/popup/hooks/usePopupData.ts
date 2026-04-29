/**
 * Marco Extension — React Popup: Popup Data Hook
 *
 * Fetches status, health, project, and error data from
 * the background service worker via PlatformAdapter.
 */

import { useState, useEffect, useCallback } from "react";
import { getPlatform } from "../../platform";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface BootErrorContext {
    sql: string | null;
    migrationVersion: number | null;
    migrationDescription: string | null;
    scope: string | null;
}

export interface WasmProbeResult {
    url: string;
    status: number | null;
    contentLength: string | null;
    headError: string | null;
    ok: boolean;
    at: string;
}

export interface StatusData {
    connection: "online" | "offline" | "degraded";
    token: { status: string; expiresIn: string | null };
    config: { status: string; source: string };
    loggingMode: string;
    version: string;
    bootStep: string;
    persistenceMode: string;
    bootTimings: Array<{ step: string; durationMs: number }>;
    totalBootMs: number;
    /** Underlying error message if boot failed; null/undefined when boot succeeded. */
    bootError?: string | null;
    /** Underlying error stack trace if boot failed; null/undefined when unavailable. */
    bootErrorStack?: string | null;
    /** Structured operation context (failing SQL/migration step), null/undefined when unavailable. */
    bootErrorContext?: BootErrorContext | null;
    /** Snapshot of the upfront HEAD probe against the bundled WASM asset. */
    wasmProbe?: WasmProbeResult | null;
}

export interface HealthData {
    state: string;
    details: string[];
}

export interface ScriptEntry {
    id?: string;
    name?: string;
    path: string;
    order: number;
    isEnabled?: boolean;
    configBinding?: string | null;
    runAt?: string;
}

export interface ProjectData {
    activeProject: {
        id: string;
        name: string;
        version: string;
        scripts?: ScriptEntry[];
    } | null;
    matchedRule: { name: string; matchMode: string } | null;
    allProjects: Array<{ id: string; name: string; version: string }>;
    injectedScripts: Record<string, { status: string }>;
    scriptStates?: Record<string, { id: string; isEnabled: boolean }>;
}

export interface ErrorData {
    errors: string[];
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line max-lines-per-function
export function usePopupData() {
    const [status, setStatus] = useState<StatusData | null>(null);
    const [health, setHealth] = useState<HealthData | null>(null);
    const [project, setProject] = useState<ProjectData | null>(null);
    const [errors, setErrors] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [fatalError, setFatalError] = useState<string | null>(null);

    const platform = getPlatform();

    const loadData = useCallback(async () => {
        try {
            const [statusRes, healthRes, projectRes, errorsRes] =
                await Promise.all([
                    platform.sendMessage<StatusData>({ type: "GET_STATUS" }),
                    platform.sendMessage<HealthData>({ type: "GET_HEALTH_STATUS" }),
                    platform.sendMessage<ProjectData>({ type: "GET_ACTIVE_PROJECT" }),
                    platform.sendMessage<ErrorData>({ type: "GET_ACTIVE_ERRORS" }),
                ]);

            setStatus(statusRes);
            setHealth(healthRes);
            setProject(projectRes);
            setErrors(errorsRes.errors ?? []);
            setFatalError(null);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setFatalError(message);
        } finally {
            setIsLoading(false);
        }
    }, [platform]);

    // PERF-7 (2026-04-25): pause polling while the popup tab/window is
    // hidden. The popup can be detached into its own window, in which
    // case it would otherwise fan out 4 sendMessage calls every 30s
    // forever (waking the SW each time).
    useEffect(() => {
        void loadData();

        let intervalId: ReturnType<typeof setInterval> | null = null;
        const startPolling = () => {
            if (intervalId !== null) return;
            intervalId = setInterval(() => void loadData(), 30_000);
        };
        const stopPolling = () => {
            if (intervalId !== null) { clearInterval(intervalId); intervalId = null; }
        };
        const onVisChange = () => {
            if (document.hidden) {
                stopPolling();
            } else {
                // Refresh immediately on becoming visible to catch up on missed ticks.
                void loadData();
                startPolling();
            }
        };

        if (!document.hidden) startPolling();
        document.addEventListener("visibilitychange", onVisChange);

        return () => {
            stopPolling();
            document.removeEventListener("visibilitychange", onVisChange);
        };
    }, [loadData]);

    return {
        status,
        health,
        project,
        errors,
        isLoading,
        fatalError,
        reload: loadData,
    };
}
