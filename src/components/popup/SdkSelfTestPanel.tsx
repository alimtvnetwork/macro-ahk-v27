/**
 * Marco Extension — SDK Self-Test Panel
 *
 * Renders the latest result of `runSdkSelfTest()` and its three round-trips
 * (KV / FILES / GKV) as a 4-row ✅/❌ grid with the last-run timestamp per
 * surface. Backed by `chrome.storage.local["marco_sdk_selftest"]`, which is
 * written by `src/background/handlers/sdk-selftest-handler.ts` whenever an
 * SDK-injected page reports a fresh result.
 *
 * @see standalone-scripts/marco-sdk/src/self-test.ts
 * @see src/background/handlers/sdk-selftest-handler.ts
 */

import { useEffect, useState, useCallback } from "react";
import { CheckCircle2, XCircle, Activity, RefreshCw } from "lucide-react";
import { sendMessage } from "@/lib/message-client";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Surface = "sync" | "kv" | "files" | "gkv";

interface SdkSelfTestRow {
    surface: Surface;
    pass: boolean;
    failures: string[];
    at: string;
    version: string;
}

interface SdkSelfTestSnapshot {
    sync: SdkSelfTestRow | null;
    kv: SdkSelfTestRow | null;
    files: SdkSelfTestRow | null;
    gkv: SdkSelfTestRow | null;
    updatedAt: string | null;
}

const ROWS: Array<{ key: Surface; label: string; description: string }> = [
    { key: "sync",  label: "SDK shape",   description: "Namespace + meta + .kv.list() Promise contract" },
    { key: "kv",    label: "KV",          description: "set → get → delete → verify-cleared round-trip" },
    { key: "files", label: "Files",       description: "save → list → read → delete → list round-trip" },
    { key: "gkv",   label: "Grouped KV",  description: "set → get → delete → verify-cleared round-trip" },
];

/* ------------------------------------------------------------------ */
/*  Time formatting                                                    */
/* ------------------------------------------------------------------ */

function formatRelative(iso: string): string {
    if (!iso) return "—";
    const then = Date.parse(iso);
    if (Number.isNaN(then)) return "—";
    const diffMs = Date.now() - then;
    const sec = Math.round(diffMs / 1000);
    if (sec < 5) return "just now";
    if (sec < 60) return `${sec}s ago`;
    const min = Math.round(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.round(hr / 24);
    return `${day}d ago`;
}

function formatAbsolute(iso: string): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleTimeString("en-US", { hour12: false });
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line max-lines-per-function
export function SdkSelfTestPanel() {
    const [snapshot, setSnapshot] = useState<SdkSelfTestSnapshot | null>(null);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        try {
            const res = await sendMessage<{ snapshot: SdkSelfTestSnapshot }>({
                type: "GET_SDK_SELFTEST",
            });
            setSnapshot(res.snapshot);
        } catch {
            setSnapshot(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const hasAnyData = snapshot !== null && (
        snapshot.sync !== null
        || snapshot.kv !== null
        || snapshot.files !== null
        || snapshot.gkv !== null
    );

    return (
        <section className="rounded-md border border-border bg-card/40">
            <header className="flex items-center justify-between px-3 py-2 border-b border-border">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Activity className="h-3.5 w-3.5 text-primary" />
                    <span>SDK Self-Test</span>
                    {snapshot?.updatedAt && (
                        <span className="text-[10px] text-muted-foreground/70">
                            · last activity {formatRelative(snapshot.updatedAt)}
                        </span>
                    )}
                </div>
                <button
                    type="button"
                    onClick={() => void refresh()}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title="Refresh self-test snapshot"
                >
                    <RefreshCw className="h-3.5 w-3.5" />
                </button>
            </header>

            {loading && !snapshot && (
                <div className="px-3 py-3 text-xs text-muted-foreground">
                    Loading self-test snapshot…
                </div>
            )}

            {!loading && !hasAnyData && (
                <div className="px-3 py-3 text-xs text-muted-foreground">
                    No SDK self-test results yet — open a tab where the Marco SDK is injected.
                </div>
            )}

            {hasAnyData && (
                <ul className="divide-y divide-border text-xs">
                    {ROWS.map((row) => {
                        const result = snapshot?.[row.key] ?? null;
                        return (
                            <li
                                key={row.key}
                                className="flex items-center gap-2 px-3 py-1.5"
                            >
                                <SelfTestIcon row={result} />
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <span className="font-medium text-foreground/90 min-w-[90px]">
                                            {row.label}
                                        </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="right" className="max-w-[260px]">
                                        <p className="text-xs">{row.description}</p>
                                    </TooltipContent>
                                </Tooltip>
                                <span className="flex-1 truncate text-muted-foreground">
                                    {result === null
                                        ? "no report yet"
                                        : result.pass
                                            ? "PASS"
                                            : `FAIL — ${result.failures[0] ?? "unknown"}`}
                                </span>
                                <span
                                    className="text-[10px] text-muted-foreground/70 shrink-0 tabular-nums"
                                    title={result?.at ? formatAbsolute(result.at) : undefined}
                                >
                                    {result?.at ? formatRelative(result.at) : "—"}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}

function SelfTestIcon({ row }: { row: SdkSelfTestRow | null }) {
    if (row === null) {
        return <span className="inline-block h-3.5 w-3.5 rounded-full bg-muted shrink-0" />;
    }
    if (row.pass) {
        return <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--success))] shrink-0" />;
    }
    return <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />;
}
