/**
 * Marco Extension — Error-Swallowing Audit View
 *
 * Presentation-only panel that renders the contents of
 * `error-swallow-audit.json` (produced by the audit scanner — a
 * separate workstream tracked in plan.md). Items are grouped by
 * severity (P0 / P1 / P2) with file + line links.
 *
 * Data contract — `public/error-swallow-audit.json` (or any URL set in
 * the Options "Audit URL" override):
 *
 *   {
 *     "GeneratedAt": "<ISO timestamp>",
 *     "Items": [
 *       {
 *         "Id":       "<stable hash>",
 *         "Severity": "P0" | "P1" | "P2",
 *         "File":     "src/foo/bar.ts",
 *         "Line":     42,
 *         "Rule":     "<lint rule id>",
 *         "Message":  "<one-line summary>",
 *         "Snippet":  "<source line text>"        // optional
 *       }
 *     ]
 *   }
 *
 * Severity meaning (matches `mem://standards/error-logging-requirements.md`):
 *   - P0  Production-blocking. Errors silently swallowed in critical paths.
 *   - P1  High. Catch blocks that drop diagnostics, no `Logger.error()`.
 *   - P2  Medium. Defensive `?? ""` / empty-catch in non-critical paths.
 *
 * If the JSON is missing or malformed, the panel renders an empty
 * state explaining how to generate it — never silently shows zero.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertOctagon, AlertTriangle, FileWarning, RefreshCw, Info, ExternalLink, Play, Terminal, Copy, Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

const AUDIT_CLI_COMMAND = "node scripts/audit-error-swallow.mjs";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type AuditSeverity = "P0" | "P1" | "P2";

export interface AuditItem {
    readonly Id: string;
    readonly Severity: AuditSeverity;
    readonly File: string;
    readonly Line: number;
    readonly Rule: string;
    readonly Message: string;
    readonly Snippet: string | null;
}

export interface AuditReport {
    readonly GeneratedAt: string;
    readonly Items: ReadonlyArray<AuditItem>;
}

type LoadState =
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "ok"; report: AuditReport }
    | { kind: "missing" }
    | { kind: "error"; message: string };

const DEFAULT_AUDIT_URL = "/error-swallow-audit.json";
const SEVERITY_ORDER: ReadonlyArray<AuditSeverity> = ["P0", "P1", "P2"];

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

function isAuditSeverity(value: string): value is AuditSeverity {
    return value === "P0" || value === "P1" || value === "P2";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validateItem(raw: any, index: number): AuditItem | string {
    if (raw === null || typeof raw !== "object") {
        return `Items[${index}]: not an object`;
    }
    const id = typeof raw.Id === "string" ? raw.Id : null;
    const severity = typeof raw.Severity === "string" && isAuditSeverity(raw.Severity) ? raw.Severity : null;
    const file = typeof raw.File === "string" ? raw.File : null;
    const line = typeof raw.Line === "number" && Number.isInteger(raw.Line) ? raw.Line : null;
    const rule = typeof raw.Rule === "string" ? raw.Rule : null;
    const message = typeof raw.Message === "string" ? raw.Message : null;
    const snippet = typeof raw.Snippet === "string" ? raw.Snippet : null;
    if (id === null || severity === null || file === null || line === null || rule === null || message === null) {
        return `Items[${index}]: missing required field (Id|Severity|File|Line|Rule|Message)`;
    }
    return { Id: id, Severity: severity, File: file, Line: line, Rule: rule, Message: message, Snippet: snippet };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validateReport(raw: any): AuditReport | string {
    if (raw === null || typeof raw !== "object") {
        return "Report root is not an object";
    }
    const generatedAt = typeof raw.GeneratedAt === "string" ? raw.GeneratedAt : null;
    if (generatedAt === null) {
        return "Missing GeneratedAt (ISO timestamp string)";
    }
    if (!Array.isArray(raw.Items)) {
        return "Missing Items array";
    }
    const items: AuditItem[] = [];
    for (let i = 0; i < raw.Items.length; i += 1) {
        const result = validateItem(raw.Items[i], i);
        if (typeof result === "string") {
            return result;
        }
        items.push(result);
    }
    return { GeneratedAt: generatedAt, Items: items };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function severityMeta(severity: AuditSeverity): { label: string; badge: "destructive" | "default" | "outline"; Icon: typeof AlertOctagon; ring: string } {
    if (severity === "P0") return { label: "P0 · Critical", badge: "destructive", Icon: AlertOctagon, ring: "border-destructive/60 bg-destructive/10" };
    if (severity === "P1") return { label: "P1 · High",     badge: "default",     Icon: AlertTriangle, ring: "border-amber-500/40 bg-amber-500/10" };
    return                        { label: "P2 · Medium",   badge: "outline",     Icon: FileWarning,   ring: "border-muted-foreground/30 bg-muted/20" };
}

function buildEditorLink(file: string, line: number): string {
    // VS Code URI handler — works inside both Lovable preview and locally
    // installed VS Code; degrades to a plain anchor otherwise.
    return `vscode://file/${file}:${line}`;
}

function formatTimestamp(iso: string): string {
    try {
        return new Date(iso).toLocaleString();
    } catch {
        return iso;
    }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line max-lines-per-function
export default function ErrorSwallowAuditView() {
    const [state, setState] = useState<LoadState>({ kind: "idle" });
    const [severityFilter, setSeverityFilter] = useState<"all" | AuditSeverity>("all");

    const load = useCallback(async () => {
        setState({ kind: "loading" });
        try {
            const res = await fetch(DEFAULT_AUDIT_URL, { cache: "no-store" });
            if (res.status === 404) {
                setState({ kind: "missing" });
                return;
            }
            if (!res.ok) {
                setState({ kind: "error", message: `HTTP ${res.status} ${res.statusText}` });
                return;
            }
            const raw = await res.json();
            const validated = validateReport(raw);
            if (typeof validated === "string") {
                setState({ kind: "error", message: `Malformed audit report — ${validated}` });
                return;
            }
            setState({ kind: "ok", report: validated });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            // Network failures in dev (no file present) commonly surface as
            // "Failed to fetch" or syntax errors when the dev server returns
            // an HTML 404 — treat both as "missing" so the page degrades to
            // the actionable empty state instead of a scary error banner.
            if (/Failed to fetch|NetworkError|Unexpected token/.test(message)) {
                setState({ kind: "missing" });
                return;
            }
            setState({ kind: "error", message });
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const grouped = useMemo(() => {
        const empty: Record<AuditSeverity, AuditItem[]> = { P0: [], P1: [], P2: [] };
        if (state.kind !== "ok") return empty;
        for (const item of state.report.Items) {
            empty[item.Severity].push(item);
        }
        return empty;
    }, [state]);

    const counts = useMemo(() => ({
        P0: grouped.P0.length,
        P1: grouped.P1.length,
        P2: grouped.P2.length,
        all: grouped.P0.length + grouped.P1.length + grouped.P2.length,
    }), [grouped]);

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                    <h2 className="text-lg font-bold tracking-tight">Error-swallowing audit</h2>
                    <p className="text-xs text-muted-foreground max-w-2xl">
                        Catch blocks and defensive accessors that hide errors from{" "}
                        <code className="rounded bg-muted px-1 py-0.5 text-[11px]">Logger.error()</code>.
                        Each item links to its source file and line.
                    </p>
                </div>
                <Button size="sm" variant="default" onClick={() => void load()} disabled={state.kind === "loading"}>
                    <Play className={`mr-1 h-3.5 w-3.5 ${state.kind === "loading" ? "animate-pulse" : ""}`} />
                    Run audit
                </Button>
            </div>

            <AuditSummaryPanel state={state} onReload={() => void load()} />

            {state.kind === "ok" && state.report.Items.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter audit items by severity">
                    {([
                        { key: "all" as const, label: "All",      count: counts.all, activeClass: "bg-foreground text-background border-foreground" },
                        { key: "P0"  as const, label: "P0",       count: counts.P0,  activeClass: "bg-destructive/20 text-destructive border-destructive/60" },
                        { key: "P1"  as const, label: "P1",       count: counts.P1,  activeClass: "bg-amber-500/20 text-amber-300 border-amber-500/60" },
                        { key: "P2"  as const, label: "P2",       count: counts.P2,  activeClass: "bg-muted text-foreground border-muted-foreground/60" },
                    ]).map((chip) => {
                        const active = severityFilter === chip.key;
                        const disabled = chip.key !== "all" && chip.count === 0;
                        return (
                            <button
                                key={chip.key}
                                type="button"
                                onClick={() => setSeverityFilter(chip.key)}
                                disabled={disabled}
                                aria-pressed={active}
                                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${active ? chip.activeClass : "border-border bg-transparent text-muted-foreground hover:bg-muted/40"}`}
                            >
                                {chip.label}
                                <span className={`rounded-full px-1 text-[10px] ${active ? "bg-background/30" : "bg-muted/60"}`}>
                                    {chip.count}
                                </span>
                            </button>
                        );
                    })}
                    <span className="ml-auto text-[11px] text-muted-foreground">
                        Generated {formatTimestamp(state.report.GeneratedAt)}
                    </span>
                </div>
            )}

            {state.kind === "loading" && (
                <p className="text-sm text-muted-foreground">Loading audit report…</p>
            )}

            {state.kind === "error" && (
                <div className="rounded-md border border-destructive/60 bg-destructive/10 p-3 text-sm">
                    <p className="font-medium text-destructive">Failed to load audit report</p>
                    <p className="mt-1 text-xs text-destructive/90">{state.message}</p>
                </div>
            )}

            {state.kind === "missing" && <MissingReportEmptyState />}

            {state.kind === "ok" && state.report.Items.length === 0 && (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
                    <p className="font-medium text-emerald-300">No swallowed errors detected</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        The scanner ran cleanly. Generated {formatTimestamp(state.report.GeneratedAt)}.
                    </p>
                </div>
            )}

            {state.kind === "ok" && state.report.Items.length > 0 && (
                <ScrollArea className="max-h-[60vh] pr-3">
                    <div className="space-y-4">
                        {SEVERITY_ORDER.filter((sev) => severityFilter === "all" || severityFilter === sev).map((severity) => (
                            <SeverityGroup key={severity} severity={severity} items={grouped[severity]} />
                        ))}
                    </div>
                </ScrollArea>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function SeverityGroup({ severity, items }: { severity: AuditSeverity; items: ReadonlyArray<AuditItem> }) {
    const meta = severityMeta(severity);
    if (items.length === 0) {
        return (
            <section className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/10 p-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                    <meta.Icon className="h-4 w-4" aria-hidden />
                    {meta.label}
                    <span className="text-xs font-normal">— none</span>
                </h3>
            </section>
        );
    }
    return (
        <section className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
                <meta.Icon className="h-4 w-4" aria-hidden />
                {meta.label}
                <Badge variant={meta.badge}>{items.length}</Badge>
            </h3>
            <ul className="space-y-1.5">
                {items.map((item) => (
                    <AuditRow key={item.Id} item={item} ringClass={meta.ring} />
                ))}
            </ul>
        </section>
    );
}

function AuditRow({ item, ringClass }: { item: AuditItem; ringClass: string }) {
    return (
        <li className={`rounded-md border ${ringClass} px-3 py-2 text-xs`}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                    <p className="font-medium text-foreground break-words">{item.Message}</p>
                    <p className="text-[11px] text-muted-foreground font-mono break-all">
                        {item.File}:{item.Line}
                        <span className="ml-2 rounded bg-muted px-1 py-0.5 text-[10px] uppercase tracking-wide">
                            {item.Rule}
                        </span>
                    </p>
                    {item.Snippet !== null && (
                        <pre className="mt-1 overflow-x-auto rounded bg-background/60 px-2 py-1 text-[11px] font-mono whitespace-pre-wrap break-words">
                            {item.Snippet}
                        </pre>
                    )}
                </div>
                <a
                    href={buildEditorLink(item.File, item.Line)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted/40"
                    title="Open in VS Code"
                >
                    <ExternalLink className="h-3 w-3" />
                    Open
                </a>
            </div>
        </li>
    );
}

function MissingReportEmptyState() {
    return (
        <div className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/10 p-4 text-sm">
            <div className="flex items-start gap-3">
                <Info className="h-4 w-4 mt-0.5 text-muted-foreground" aria-hidden />
                <div className="space-y-2">
                    <p className="font-medium">No audit report generated yet</p>
                    <p className="text-xs text-muted-foreground">
                        This page reads <code className="rounded bg-muted px-1 py-0.5 text-[11px]">public/error-swallow-audit.json</code>.
                        The scanner that produces the file is tracked in <code>plan.md</code> as a follow-up
                        workstream and is not yet implemented.
                    </p>
                    <p className="text-xs text-muted-foreground">Expected JSON shape:</p>
                    <pre className="overflow-x-auto rounded bg-background/60 px-2 py-1 text-[11px] font-mono">
{`{
  "GeneratedAt": "2026-04-27T12:00:00+08:00",
  "Items": [
    {
      "Id":       "abc123",
      "Severity": "P0",
      "File":     "src/foo/bar.ts",
      "Line":     42,
      "Rule":     "no-empty-catch",
      "Message":  "Empty catch block swallows error",
      "Snippet":  "} catch { /* swallowed */ }"
    }
  ]
}`}
                    </pre>
                </div>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Summary panel                                                      */
/* ------------------------------------------------------------------ */

function computeTopFiles(items: ReadonlyArray<AuditItem>, limit: number): Array<{ file: string; count: number }> {
    const tally = new Map<string, number>();
    for (const item of items) {
        tally.set(item.File, (tally.get(item.File) ?? 0) + 1);
    }
    return Array.from(tally.entries())
        .map(([file, count]) => ({ file, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
}

function computeTopRules(items: ReadonlyArray<AuditItem>, limit: number): Array<{ rule: string; count: number }> {
    const tally = new Map<string, number>();
    for (const item of items) {
        tally.set(item.Rule, (tally.get(item.Rule) ?? 0) + 1);
    }
    return Array.from(tally.entries())
        .map(([rule, count]) => ({ rule, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
}

// eslint-disable-next-line max-lines-per-function
function AuditSummaryPanel({ state, onReload }: { state: LoadState; onReload: () => void }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(() => {
        void navigator.clipboard.writeText(AUDIT_CLI_COMMAND).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        });
    }, []);

    const items = useMemo<ReadonlyArray<AuditItem>>(
        () => (state.kind === "ok" ? state.report.Items : []),
        [state],
    );
    const counts = useMemo(() => {
        const c = { P0: 0, P1: 0, P2: 0 };
        for (const it of items) c[it.Severity] += 1;
        return c;
    }, [items]);
    const topFiles = useMemo(() => computeTopFiles(items, 5), [items]);
    const topRules = useMemo(() => computeTopRules(items, 3), [items]);
    const total = items.length;

    return (
        <section className="rounded-md border border-border bg-muted/10 p-3 space-y-3">
            <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                    <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                        <Terminal className="h-3.5 w-3.5" aria-hidden />
                        Audit summary
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                        {state.kind === "ok"
                            ? `${total} item(s) — generated ${formatTimestamp(state.report.GeneratedAt)}`
                            : "Run the CLI command below, then click Run audit to refresh."}
                    </p>
                </div>
                <Button size="sm" variant="outline" onClick={onReload} disabled={state.kind === "loading"}>
                    <RefreshCw className={`mr-1 h-3.5 w-3.5 ${state.kind === "loading" ? "animate-spin" : ""}`} />
                    Refresh
                </Button>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center">
                <StatTile label="Total"  value={total}     tone="default" />
                <StatTile label="P0"     value={counts.P0} tone="destructive" />
                <StatTile label="P1"     value={counts.P1} tone="warn" />
                <StatTile label="P2"     value={counts.P2} tone="muted" />
            </div>

            <div className="rounded-md border border-border/60 bg-background/40 p-2 flex items-center justify-between gap-2">
                <code className="text-[11px] font-mono text-foreground/90 break-all">{AUDIT_CLI_COMMAND}</code>
                <Button size="sm" variant="ghost" onClick={handleCopy} className="h-6 px-2 shrink-0">
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    <span className="ml-1 text-[11px]">{copied ? "Copied" : "Copy"}</span>
                </Button>
            </div>

            {state.kind === "ok" && total > 0 && (
                <div className="grid gap-3 md:grid-cols-2">
                    <div>
                        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Top files</h4>
                        <ul className="space-y-1">
                            {topFiles.map(({ file, count }) => (
                                <li key={file} className="flex items-center justify-between gap-2 text-[11px] font-mono">
                                    <span className="truncate text-foreground/90" title={file}>{file}</span>
                                    <Badge variant="outline" className="shrink-0">{count}</Badge>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div>
                        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Top rules</h4>
                        <ul className="space-y-1">
                            {topRules.map(({ rule, count }) => (
                                <li key={rule} className="flex items-center justify-between gap-2 text-[11px] font-mono">
                                    <span className="truncate text-foreground/90" title={rule}>{rule}</span>
                                    <Badge variant="outline" className="shrink-0">{count}</Badge>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}
        </section>
    );
}

function StatTile({ label, value, tone }: { label: string; value: number; tone: "default" | "destructive" | "warn" | "muted" }) {
    const toneClass =
        tone === "destructive" ? "border-destructive/60 bg-destructive/10 text-destructive"
        : tone === "warn"      ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
        : tone === "muted"     ? "border-muted-foreground/30 bg-muted/30 text-muted-foreground"
        :                        "border-border bg-background/40 text-foreground";
    return (
        <div className={`rounded-md border px-2 py-1.5 ${toneClass}`}>
            <div className="text-base font-bold leading-none">{value}</div>
            <div className="text-[10px] uppercase tracking-wide mt-0.5">{label}</div>
        </div>
    );
}
