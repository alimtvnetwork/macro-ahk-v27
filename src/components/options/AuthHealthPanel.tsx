/**
 * Auth Health Panel — React component for GlobalDiagnosticsView
 *
 * Displays auth strategy waterfall results with per-strategy
 * timing bars, overall status, and diagnostics copy.
 */

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Shield, Play, Copy, Check, Loader2 } from "lucide-react";
import { sendMessage } from "@/lib/message-client";

interface AuthStrategyResult {
    name: string;
    tier: number;
    success: boolean;
    durationMs: number;
    detail: string;
}

interface AuthHealthData {
    status: "authenticated" | "degraded" | "unauthenticated";
    resolvedVia: string | null;
    totalMs: number;
    strategies: AuthStrategyResult[];
    checkedAt: string;
}

const STATUS_CONFIG: Record<string, { icon: string; variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
    authenticated: { icon: "🟢", variant: "default", label: "Authenticated" },
    degraded: { icon: "🟡", variant: "secondary", label: "Degraded" },
    unauthenticated: { icon: "🔴", variant: "destructive", label: "Unauthenticated" },
};

// eslint-disable-next-line max-lines-per-function
export function AuthHealthPanel() {
    const [data, setData] = useState<AuthHealthData | null>(null);
    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(false);

    const runCheck = useCallback(async () => {
        setLoading(true);
        try {
            const res = await sendMessage<AuthHealthData>({ type: "GET_AUTH_HEALTH" });
            setData(res);
        } catch {
            setData(null);
        } finally {
            setLoading(false);
        }
    }, []);

    const handleCopy = useCallback(async () => {
        if (!data) return;
        const lines = [
            "=== Auth Health Report ===",
            `Status: ${data.status}`,
            `Resolved via: ${data.resolvedVia ?? "none"}`,
            `Total: ${data.totalMs}ms`,
            `Checked: ${data.checkedAt}`,
            "",
            "── Strategies ──",
            ...data.strategies.map(s =>
                `  [T${s.tier}] ${s.name.padEnd(32)} ${s.success ? "✓" : "✗"}  ${String(s.durationMs).padStart(5)}ms  ${s.detail}`
            ),
        ];
        await navigator.clipboard.writeText(lines.join("\n"));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [data]);

    const statusConfig = data ? STATUS_CONFIG[data.status] ?? STATUS_CONFIG.unauthenticated : null;

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        <CardTitle className="text-sm font-semibold">Auth Strategy Health</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                        {data && (
                            <Button variant="ghost" size="sm" onClick={() => void handleCopy()}>
                                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                            </Button>
                        )}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void runCheck()}
                            disabled={loading}
                        >
                            {loading ? (
                                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                            ) : (
                                <Play className="h-3.5 w-3.5 mr-1" />
                            )}
                            {loading ? "Running…" : "Run Check"}
                        </Button>
                    </div>
                </div>
                <CardDescription>
                    Tests all 5 auth strategy tiers with per-strategy timing.
                </CardDescription>
            </CardHeader>

            <CardContent>
                {!data && !loading && (
                    <p className="text-xs text-muted-foreground text-center py-4">
                        Click "Run Check" to test the auth waterfall.
                    </p>
                )}

                {data && statusConfig && (
                    <div className="space-y-3">
                        {/* Status bar */}
                        <div className="flex items-center gap-3 text-sm">
                            <Badge variant={statusConfig.variant}>
                                {statusConfig.icon} {statusConfig.label}
                            </Badge>
                            {data.resolvedVia && (
                                <span className="text-xs text-muted-foreground">
                                    via <span className="font-medium text-foreground">{data.resolvedVia}</span>
                                </span>
                            )}
                            <span className="text-xs text-muted-foreground ml-auto">
                                {data.totalMs}ms total
                            </span>
                        </div>

                        {/* Strategy table */}
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-12">Tier</TableHead>
                                        <TableHead>Strategy</TableHead>
                                        <TableHead className="w-12 text-center">OK</TableHead>
                                        <TableHead className="w-28">Time</TableHead>
                                        <TableHead>Detail</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.strategies.map((s) => {
                                        const barWidth = data.totalMs > 0
                                            ? Math.min(100, Math.round((s.durationMs / data.totalMs) * 100))
                                            : 0;
                                        return (
                                            <TableRow key={s.tier} className={s.success ? "bg-primary/5" : ""}>
                                                <TableCell className="font-mono text-xs">T{s.tier}</TableCell>
                                                <TableCell className="text-xs font-medium">{s.name}</TableCell>
                                                <TableCell className="text-center">
                                                    {s.success ? (
                                                        <span className="text-primary">✓</span>
                                                    ) : (
                                                        <span className="text-destructive">✗</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-xs font-mono w-10 text-right">{s.durationMs}ms</span>
                                                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                                            <div
                                                                className={`h-full rounded-full transition-all ${s.success ? "bg-primary" : "bg-destructive/50"}`}
                                                                style={{ width: `${barWidth}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-xs text-muted-foreground max-w-48 truncate" title={s.detail}>
                                                    {s.detail}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>

                        {/* Footer */}
                        <p className="text-[10px] text-muted-foreground text-right">
                            Last checked: {new Date(data.checkedAt).toLocaleTimeString("en-GB", {
                                hour12: false,
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                            })}
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
