/**
 * Token Seeder Diagnostics Panel
 *
 * Detailed error summary view for the JWT token seeder. Displays every
 * tab Chrome currently refuses to script, the exact detected reason,
 * and a live cooldown timer for the user-selected tab so the operator
 * knows when the next seed attempt will fire.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldAlert, Play, Loader2, Timer, Check, Copy, AlertTriangle } from "lucide-react";
import { sendMessage } from "@/lib/message-client";
import {
    loadDiagnosticsCache,
    saveDiagnosticsCache,
} from "./token-seeder-diagnostics-cache";

type AccessDeniedCode =
    | "RESPECTIVE_HOST_PERMISSION"
    | "MISSING_HOST_PERMISSION"
    | "PAGE_CONTENTS_BLOCKED"
    | "EXTENSIONS_GALLERY_BLOCKED"
    | "RESTRICTED_SCHEME"
    | "NO_HOST_PATTERN"
    | "PERMISSION_NOT_GRANTED"
    | "GENERIC_CANNOT_SCRIPT"
    | "UNKNOWN";

interface InaccessibleSeedTarget {
    tabId: number;
    tabUrl: string;
    reason: string;
    code: AccessDeniedCode;
    firstFailureAt: number;
    lastFailureAt: number;
    attemptCount: number;
    cooldownMs: number;
}

interface TokenSeederDiagnostics {
    targets: InaccessibleSeedTarget[];
    cooldownMs: number;
    capturedAt: string;
}

const CODE_LABELS: Record<AccessDeniedCode, { label: string; hint: string }> = {
    RESPECTIVE_HOST_PERMISSION: {
        label: "Host permission missing",
        hint: "manifest.json must request access to the tab's origin (e.g. via host_permissions or activeTab).",
    },
    MISSING_HOST_PERMISSION: {
        label: "Host permission missing",
        hint: "Chrome reports the extension lacks runtime host permission for this tab.",
    },
    PAGE_CONTENTS_BLOCKED: {
        label: "Page contents blocked",
        hint: "Chrome blocks scripting on this page (cross-origin frame, restricted view, or pre-navigation tab).",
    },
    EXTENSIONS_GALLERY_BLOCKED: {
        label: "Web Store blocked",
        hint: "Scripts cannot run on the Chrome Web Store gallery — this tab will always be skipped.",
    },
    RESTRICTED_SCHEME: {
        label: "Restricted URL scheme",
        hint: "chrome://, about://, devtools://, and chrome-extension:// pages cannot be scripted.",
    },
    NO_HOST_PATTERN: {
        label: "Invalid origin",
        hint: "Could not derive an origin pattern from the tab URL — the URL is malformed.",
    },
    PERMISSION_NOT_GRANTED: {
        label: "Permission not granted",
        hint: "User has not granted optional host permission for this origin.",
    },
    GENERIC_CANNOT_SCRIPT: {
        label: "Tab cannot be scripted",
        hint: "Chrome reports a generic scripting block for this tab.",
    },
    UNKNOWN: {
        label: "Unknown reason",
        hint: "Reason did not match any known Chrome error pattern. Inspect the raw message.",
    },
};

function formatTime(epochMs: number): string {
    return new Date(epochMs).toLocaleTimeString("en-GB", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
}

function formatRemaining(ms: number): string {
    if (ms <= 0) return "expired";
    const seconds = Math.ceil(ms / 1000);
    return `${seconds}s`;
}

// eslint-disable-next-line max-lines-per-function -- single cohesive diagnostics view
export function TokenSeederDiagnosticsPanel() {
    const [data, setData] = useState<TokenSeederDiagnostics | null>(
        () => loadDiagnosticsCache() as TokenSeederDiagnostics | null,
    );
    const [loading, setLoading] = useState(false);
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [now, setNow] = useState<number>(() => Date.now());
    const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const res = await sendMessage<TokenSeederDiagnostics>({
                type: "GET_TOKEN_SEEDER_DIAGNOSTICS",
            });
            setData(res);
            saveDiagnosticsCache(res);
            setNow(Date.now());
        } catch {
            setData(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (tickRef.current) clearInterval(tickRef.current);
        tickRef.current = setInterval(() => setNow(Date.now()), 500);
        return () => {
            if (tickRef.current) clearInterval(tickRef.current);
        };
    }, []);

    const targets = useMemo(() => data?.targets ?? [], [data]);

    const selected = useMemo<InaccessibleSeedTarget | null>(() => {
        if (selectedKey === null) return targets[0] ?? null;
        return targets.find((t) => `${t.tabId}::${t.tabUrl}` === selectedKey) ?? targets[0] ?? null;
    }, [targets, selectedKey]);

    const cooldownRemainingMs = selected
        ? Math.max(0, selected.cooldownMs - (now - selected.lastFailureAt))
        : 0;
    const cooldownPct = selected && selected.cooldownMs > 0
        ? Math.min(100, Math.max(0, Math.round((cooldownRemainingMs / selected.cooldownMs) * 100)))
        : 0;
    const isExpired = selected !== null && cooldownRemainingMs <= 0;

    const handleCopy = useCallback(async () => {
        if (!selected) return;
        const codeMeta = CODE_LABELS[selected.code];
        const lines = [
            "=== Token Seeder — Inaccessible Tab ===",
            `Tab ID:           ${selected.tabId}`,
            `Tab URL:          ${selected.tabUrl}`,
            `Code:             ${selected.code} (${codeMeta.label})`,
            `Hint:             ${codeMeta.hint}`,
            `Reason:           ${selected.reason}`,
            `Attempts:         ${selected.attemptCount}`,
            `First failure:    ${formatTime(selected.firstFailureAt)}`,
            `Last failure:     ${formatTime(selected.lastFailureAt)}`,
            `Cooldown:         ${selected.cooldownMs}ms`,
            `Cooldown left:    ${formatRemaining(cooldownRemainingMs)}`,
            `Captured at:      ${data?.capturedAt ?? "n/a"}`,
        ];
        await navigator.clipboard.writeText(lines.join("\n"));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [selected, cooldownRemainingMs, data]);

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                        <CardTitle className="text-sm font-semibold">Token Seeder — Access-Denied Tabs</CardTitle>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void refresh()}
                        disabled={loading}
                    >
                        {loading
                            ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                            : <Play className="h-3.5 w-3.5 mr-1" />}
                        {loading ? "Loading…" : "Refresh"}
                    </Button>
                </div>
                <CardDescription>
                    Tabs Chrome refused to script during JWT seeding. Click a row to see the
                    exact detected reason and live cooldown timer.
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
                {!data && !loading && (
                    <p className="text-xs text-muted-foreground text-center py-4">
                        Click "Refresh" to load the current inaccessible-tab snapshot.
                    </p>
                )}

                {data && targets.length === 0 && (
                    <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
                        ✓ No inaccessible tabs are currently throttled. The seeder has clear access to every supported tab.
                    </div>
                )}

                {targets.length > 0 && (
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-16">Tab</TableHead>
                                    <TableHead>URL</TableHead>
                                    <TableHead className="w-44">Code</TableHead>
                                    <TableHead className="w-20 text-right">Tries</TableHead>
                                    <TableHead className="w-24 text-right">Cooldown</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {targets.map((t) => {
                                    const key = `${t.tabId}::${t.tabUrl}`;
                                    const remaining = Math.max(0, t.cooldownMs - (now - t.lastFailureAt));
                                    const isSelected = (selected && `${selected.tabId}::${selected.tabUrl}` === key) ?? false;
                                    return (
                                        <TableRow
                                            key={key}
                                            data-selected={isSelected}
                                            className={`cursor-pointer ${isSelected ? "bg-primary/10" : ""}`}
                                            onClick={() => setSelectedKey(key)}
                                        >
                                            <TableCell className="font-mono text-xs">{t.tabId}</TableCell>
                                            <TableCell className="text-xs max-w-72 truncate" title={t.tabUrl}>
                                                {t.tabUrl}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="text-[10px] font-mono">
                                                    {t.code}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right text-xs font-mono">
                                                {t.attemptCount}
                                            </TableCell>
                                            <TableCell className="text-right text-xs font-mono">
                                                {formatRemaining(remaining)}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                )}

                {selected && (
                    <div className="rounded-md border bg-muted/30 p-3 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2 min-w-0">
                                <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold">
                                        {CODE_LABELS[selected.code].label}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground mt-0.5">
                                        {CODE_LABELS[selected.code].hint}
                                    </p>
                                </div>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => void handleCopy()}>
                                {copied
                                    ? <Check className="h-3.5 w-3.5" />
                                    : <Copy className="h-3.5 w-3.5" />}
                            </Button>
                        </div>

                        {/* Reason — the exact Chrome message */}
                        <div className="space-y-1">
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                Detected reason
                            </p>
                            <pre className="text-[11px] leading-relaxed font-mono bg-background border rounded p-2 whitespace-pre-wrap break-words select-all">
                                {selected.reason}
                            </pre>
                        </div>

                        {/* Live cooldown */}
                        <div className="space-y-1">
                            <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
                                <span className="flex items-center gap-1">
                                    <Timer className="h-3 w-3" />
                                    Cooldown until next seed attempt
                                </span>
                                <span className="font-mono">
                                    {isExpired ? "ready" : formatRemaining(cooldownRemainingMs)} / {Math.round(selected.cooldownMs / 1000)}s
                                </span>
                            </div>
                            <div className="h-2 rounded-full bg-muted overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all ${isExpired ? "bg-primary" : "bg-destructive/70"}`}
                                    style={{ width: `${isExpired ? 100 : 100 - cooldownPct}%` }}
                                />
                            </div>
                        </div>

                        {/* Stats grid */}
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                            <div className="space-y-0.5">
                                <p className="text-muted-foreground">Tab ID</p>
                                <p className="font-mono">{selected.tabId}</p>
                            </div>
                            <div className="space-y-0.5">
                                <p className="text-muted-foreground">Attempts</p>
                                <p className="font-mono">{selected.attemptCount}</p>
                            </div>
                            <div className="space-y-0.5">
                                <p className="text-muted-foreground">First failure</p>
                                <p className="font-mono">{formatTime(selected.firstFailureAt)}</p>
                            </div>
                            <div className="space-y-0.5">
                                <p className="text-muted-foreground">Last failure</p>
                                <p className="font-mono">{formatTime(selected.lastFailureAt)}</p>
                            </div>
                            <div className="col-span-2 space-y-0.5">
                                <p className="text-muted-foreground">Tab URL</p>
                                <p className="font-mono break-all">{selected.tabUrl}</p>
                            </div>
                        </div>
                    </div>
                )}

                {data && (
                    <p className="text-[10px] text-muted-foreground text-right">
                        Snapshot captured: {new Date(data.capturedAt).toLocaleTimeString("en-GB", {
                            hour12: false,
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                        })}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}

export default TokenSeederDiagnosticsPanel;
