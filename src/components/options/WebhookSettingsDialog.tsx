/**
 * Marco Extension — Webhook Settings Dialog
 *
 * Configures the per-project HTTP endpoint that receives execution
 * and recording results. Backed by `result-webhook.ts` storage.
 *
 * Sections:
 *   1. Enable toggle + URL + Timeout
 *   2. Headers editor (name/value rows, add/remove)
 *   3. Event subscriptions (4 toggles)
 *   4. Test ping button → fires a synthetic GroupRunSucceeded
 *   5. Last 20 delivery attempts (newest first)
 *
 * The dialog is fully self-contained: it owns its draft state, only
 * persists on Save, and reads back from `loadWebhookConfig()` when
 * reopened so cancel ⇒ original config remains intact.
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Copy, Download, Plus, RefreshCw, Search, Send, Trash2, Webhook, Wrench, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
    ALL_WEBHOOK_EVENTS,
    DEFAULT_WEBHOOK_CONFIG,
    clearDeliveryLog,
    dispatchWebhook,
    getDeliveryLog,
    loadWebhookConfig,
    repairDeliveryLog,
    saveWebhookConfig,
    type WebhookConfig,
    type WebhookEventKind,
    type WebhookHeader,
    type WebhookDeliveryResult,
    type WebhookDeliverySuccess,
    type WebhookDeliverySkipped,
    type WebhookDeliveryFailure,
    isWebhookFailure,
    isWebhookSkipped,
    isWebhookSuccess,
} from "@/background/recorder/step-library/result-webhook";

/**
 * A delivery-log entry is a "corrupt placeholder" when the loader could not
 * validate the original row and substituted a synthetic failure (see
 * `buildCorruptPlaceholder` in `result-webhook.ts`). We detect them by the
 * stable error-message prefix so the Repair button can show an accurate count
 * without leaking a brittle Kind discriminator.
 */
const CORRUPT_PLACEHOLDER_PREFIX = "Corrupt webhook log entry";

function isCorruptPlaceholder(entry: WebhookDeliveryResult): boolean {
    return isWebhookFailure(entry) && entry.Error.startsWith(CORRUPT_PLACEHOLDER_PREFIX);
}

interface Props {
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
}

const EVENT_LABELS: Record<WebhookEventKind, string> = {
    GroupRunSucceeded: "Group run succeeded",
    GroupRunFailed: "Group run failed",
    BatchComplete: "Batch run complete",
    RecordingStopped: "Recording stopped",
};

function formatTime(iso: string): string {
    try {
        return new Date(iso).toLocaleTimeString();
    } catch {
        return iso;
    }
}

function formatPayloadJson(entry: WebhookDeliveryResult): string | null {
    if (entry.Payload === null || entry.Payload === undefined) return null;
    try {
        return JSON.stringify(entry.Payload, null, 2);
    } catch (err) {
        return `// Failed to serialise payload: ${err instanceof Error ? err.message : String(err)}`;
    }
}

function describeSuccess(entry: WebhookDeliverySuccess): string {
    return `Status: OK (HTTP ${entry.Status})`;
}

function describeSkipped(entry: WebhookDeliverySkipped): string {
    return `Status: Skipped\nSkip reason: ${entry.SkipReason}`;
}

function describeFailure(entry: WebhookDeliveryFailure): string {
    const httpPart = entry.Status !== null ? ` (HTTP ${entry.Status})` : "";
    return `Status: Failed${httpPart}\nError: ${entry.Error}`;
}

type VariantBadgeVariant = "default" | "secondary" | "outline" | "destructive";

interface VariantPresentation {
    readonly badgeLabel: string;
    readonly badgeVariant: VariantBadgeVariant;
    readonly badgeExtraClass: string;
    readonly rowClass: string;
    readonly hoverClass: string;
    readonly summaryDetail: string | null;
    readonly summaryDetailClass: string;
    readonly eventClass: string;
}

const ROW_SUCCESS = "rounded-md border border-emerald-500/30 bg-emerald-500/5 text-xs";
const ROW_SKIPPED = "rounded-md border border-dashed border-muted-foreground/40 bg-muted/10 text-xs";
const ROW_FAILED  = "rounded-md border border-destructive/60 bg-destructive/10 text-xs shadow-[0_0_0_1px_hsl(var(--destructive)/0.35)]";

function presentSuccess(entry: WebhookDeliverySuccess): VariantPresentation {
    return {
        badgeLabel: `OK ${entry.Status}`,
        badgeVariant: "default",
        badgeExtraClass: "",
        rowClass: ROW_SUCCESS,
        hoverClass: "hover:bg-emerald-500/10",
        summaryDetail: `HTTP ${entry.Status}`,
        summaryDetailClass: "text-emerald-300/90",
        eventClass: "",
    };
}

function presentSkipped(entry: WebhookDeliverySkipped): VariantPresentation {
    return {
        badgeLabel: "Skipped",
        badgeVariant: "outline",
        badgeExtraClass: "",
        rowClass: ROW_SKIPPED,
        hoverClass: "hover:bg-muted/30",
        summaryDetail: entry.SkipReason && entry.SkipReason.length > 0 ? entry.SkipReason : "(no reason recorded)",
        summaryDetailClass: "text-muted-foreground",
        eventClass: "",
    };
}

function presentFailure(entry: WebhookDeliveryFailure): VariantPresentation {
    const statusSuffix = entry.Status !== null ? ` ${entry.Status}` : "";
    const errorText = entry.Error && entry.Error.length > 0 ? entry.Error : "(no error message)";
    const httpPrefix = entry.Status !== null ? `HTTP ${entry.Status} — ` : "";
    return {
        badgeLabel: `Failed${statusSuffix}`,
        badgeVariant: "destructive",
        badgeExtraClass: "uppercase tracking-wide font-bold ring-1 ring-destructive/60 shadow-sm",
        rowClass: ROW_FAILED,
        hoverClass: "hover:bg-destructive/15",
        summaryDetail: `${httpPrefix}${errorText}`,
        summaryDetailClass: "text-destructive/90 font-medium",
        eventClass: "text-destructive font-semibold",
    };
}

function presentVariant(entry: WebhookDeliveryResult): VariantPresentation {
    if (isWebhookSuccess(entry)) return presentSuccess(entry);
    if (isWebhookSkipped(entry)) return presentSkipped(entry);
    return presentFailure(entry);
}

const CLIP_SEPARATOR = "─".repeat(48);
const CLIP_EOL = "\r\n";

function variantHeader(entry: WebhookDeliveryResult): string {
    if (isWebhookSkipped(entry)) return "[SKIPPED] Webhook Delivery";
    if (isWebhookSuccess(entry)) return "[SUCCESS] Webhook Delivery";
    return "[FAILURE] Webhook Delivery";
}

function variantStatusBlock(entry: WebhookDeliveryResult): string {
    if (isWebhookSkipped(entry)) return describeSkipped(entry);
    if (isWebhookSuccess(entry)) return describeSuccess(entry);
    if (isWebhookFailure(entry)) return describeFailure(entry);
    return "Status: <unknown>";
}

function buildLogClipboardText(entry: WebhookDeliveryResult): string {
    const sections: string[] = [];
    sections.push(CLIP_SEPARATOR);
    sections.push(variantHeader(entry));
    sections.push(CLIP_SEPARATOR);
    sections.push(
        [
            `Event:    ${entry.Event ?? "<missing>"}`,
            `Emitted:  ${entry.EmittedAt ?? "<missing>"}`,
            `Duration: ${entry.DurationMs ?? 0} ms`,
        ].join(CLIP_EOL),
    );
    sections.push(CLIP_SEPARATOR);
    sections.push(variantStatusBlock(entry));
    const payloadJson = formatPayloadJson(entry);
    if (payloadJson !== null) {
        sections.push(CLIP_SEPARATOR);
        sections.push("Payload:");
        sections.push(payloadJson);
    }
    sections.push(CLIP_SEPARATOR);
    // Normalise any embedded \n inside subsections to CRLF for a single
    // consistent line ending throughout the clipboard payload.
    return sections.join(CLIP_EOL).replace(/\r?\n/g, CLIP_EOL);
}

async function copyLogEntry(entry: WebhookDeliveryResult): Promise<void> {
    const text = buildLogClipboardText(entry);
    try {
        await navigator.clipboard.writeText(text);
        toast.success("Webhook details copied");
    } catch (err) {
        toast.error(`Copy failed: ${err instanceof Error ? err.message : String(err)}`);
    }
}

function entryStatusLabel(entry: WebhookDeliveryResult): string {
    if (isWebhookSkipped(entry)) return "Skipped";
    if (isWebhookSuccess(entry)) return "Success";
    return "Failure";
}

function entryStatusCode(entry: WebhookDeliveryResult): number | null {
    if (isWebhookSkipped(entry)) return null;
    return entry.Status ?? null;
}

function entryDetail(entry: WebhookDeliveryResult): string {
    if (isWebhookSkipped(entry)) return entry.SkipReason;
    if (isWebhookFailure(entry)) return entry.Error;
    return "";
}

function csvCell(value: string | number | null): string {
    if (value === null || value === undefined) return "";
    const s = String(value);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

function buildJsonExport(entries: ReadonlyArray<WebhookDeliveryResult>): string {
    return JSON.stringify(
        {
            ExportedAt: new Date().toISOString(),
            Count: entries.length,
            Entries: entries,
        },
        null,
        2,
    );
}

function buildCsvExport(entries: ReadonlyArray<WebhookDeliveryResult>): string {
    const headers = ["Event", "EmittedAt", "Status", "HttpStatus", "DurationMs", "Detail", "PayloadJson"];
    const rows: string[] = [headers.join(",")];
    for (const entry of entries) {
        const payload = formatPayloadJson(entry);
        rows.push([
            csvCell(entry.Event ?? ""),
            csvCell(entry.EmittedAt ?? ""),
            csvCell(entryStatusLabel(entry)),
            csvCell(entryStatusCode(entry)),
            csvCell(entry.DurationMs ?? null),
            csvCell(entryDetail(entry)),
            csvCell(payload ?? ""),
        ].join(","));
    }
    return rows.join("\n");
}

function downloadFile(filename: string, mimeType: string, content: string): void {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exportFilteredLog(entries: ReadonlyArray<WebhookDeliveryResult>, format: "json" | "csv"): void {
    if (entries.length === 0) {
        toast.error("No entries match the current filters");
        return;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    if (format === "json") {
        downloadFile(`webhook-log-${stamp}.json`, "application/json", buildJsonExport(entries));
    } else {
        downloadFile(`webhook-log-${stamp}.csv`, "text/csv", buildCsvExport(entries));
    }
    toast.success(`Exported ${entries.length} ${entries.length === 1 ? "entry" : "entries"} as ${format.toUpperCase()}`);
}

export default function WebhookSettingsDialog({ open, onOpenChange }: Props) {
    const [draft, setDraft] = useState<WebhookConfig>(DEFAULT_WEBHOOK_CONFIG);
    const [log, setLog] = useState<ReadonlyArray<WebhookDeliveryResult>>([]);
    const [busy, setBusy] = useState(false);
    const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
    const [payloadOpenIdx, setPayloadOpenIdx] = useState<number | null>(null);
    const [statusFilter, setStatusFilter] = useState<"all" | "success" | "skipped" | "failure">("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [repairConfirmOpen, setRepairConfirmOpen] = useState(false);
    const [repairBusy, setRepairBusy] = useState(false);

    useEffect(() => {
        if (open) {
            setDraft(loadWebhookConfig());
            setLog(getDeliveryLog());
            setSearchQuery("");
        }
    }, [open]);

    const eventSet = useMemo(() => new Set(draft.Events), [draft.Events]);

    const logCounts = useMemo(() => {
        let success = 0;
        let skipped = 0;
        let failure = 0;
        for (const entry of log) {
            if (isWebhookSkipped(entry)) skipped += 1;
            else if (isWebhookSuccess(entry)) success += 1;
            else failure += 1;
        }
        return { all: log.length, success, skipped, failure };
    }, [log]);

    const filteredLog = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return log.filter((entry) => {
            if (statusFilter === "skipped" && !isWebhookSkipped(entry)) return false;
            if (statusFilter === "success" && !isWebhookSuccess(entry)) return false;
            if (statusFilter === "failure" && (isWebhookSkipped(entry) || isWebhookSuccess(entry))) return false;
            if (query.length === 0) return true;
            const event = entry.Event?.toLowerCase() ?? "";
            const emitted = entry.EmittedAt?.toLowerCase() ?? "";
            const statusValue = isWebhookSkipped(entry) ? null : entry.Status;
            const status = statusValue === null || statusValue === undefined ? "" : String(statusValue);
            return event.includes(query) || emitted.includes(query) || status.includes(query);
        });
    }, [log, statusFilter, searchQuery]);

    const toggleEvent = (kind: WebhookEventKind, on: boolean) => {
        setDraft((prev) => {
            const next = new Set(prev.Events);
            if (on) next.add(kind); else next.delete(kind);
            return {
                ...prev,
                Events: ALL_WEBHOOK_EVENTS.filter((k) => next.has(k)),
            };
        });
    };

    const updateHeader = (idx: number, patch: Partial<WebhookHeader>) => {
        setDraft((prev) => ({
            ...prev,
            Headers: prev.Headers.map((h, i) => (i === idx ? { ...h, ...patch } : h)),
        }));
    };

    const addHeader = () => {
        setDraft((prev) => ({
            ...prev,
            Headers: [...prev.Headers, { Name: "", Value: "" }],
        }));
    };

    const removeHeader = (idx: number) => {
        setDraft((prev) => ({
            ...prev,
            Headers: prev.Headers.filter((_, i) => i !== idx),
        }));
    };

    const handleSave = () => {
        const saved = saveWebhookConfig(draft);
        setDraft(saved);
        toast.success("Webhook settings saved");
        onOpenChange(false);
    };

    const handleTest = async () => {
        const cfgToUse = saveWebhookConfig({ ...draft, Enabled: true });
        setDraft(cfgToUse);
        if (cfgToUse.Url.trim().length === 0) {
            toast.error("Add a URL before sending a test ping");
            return;
        }
        setBusy(true);
        const result = await dispatchWebhook(
            "GroupRunSucceeded",
            {
                ProjectId: 0,
                GroupId: 0,
                GroupName: "Webhook Test Ping",
                DurationMs: 0,
                StepsExecuted: 0,
                Outcome: "Succeeded",
                IsTest: true,
            },
            { config: cfgToUse },
        );
        setBusy(false);
        setLog(getDeliveryLog());
        if (isWebhookSkipped(result)) {
            toast.warning(`Skipped: ${result.SkipReason}`);
        } else if (isWebhookSuccess(result)) {
            toast.success(`Webhook reached endpoint (HTTP ${result.Status})`);
        } else {
            toast.error(`Webhook failed: ${result.Error}`);
        }
    };

    const handleClearLog = () => {
        clearDeliveryLog();
        setLog([]);
        setExpandedIdx(null);
        setPayloadOpenIdx(null);
    };

    const refreshLog = () => {
        setLog(getDeliveryLog());
    };

    const corruptCount = useMemo(
        () => log.reduce((acc, entry) => acc + (isCorruptPlaceholder(entry) ? 1 : 0), 0),
        [log],
    );

    const handleRepair = () => {
        setRepairBusy(true);
        try {
            const report = repairDeliveryLog();
            setLog(getDeliveryLog());
            setExpandedIdx(null);
            setPayloadOpenIdx(null);

            if (report.Removed === 0 && report.Errors.length === 0) {
                toast.success("No corrupted entries found — log is clean");
            } else if (report.Removed === 0 && report.Errors.length > 0) {
                // Storage-level corruption (unparsable JSON / wrong shape) — key was reset
                toast.success(`Reset corrupted webhook log storage (${report.Errors[0]})`);
            } else {
                toast.success(
                    `Repaired webhook log — removed ${report.Removed} corrupted entr${report.Removed === 1 ? "y" : "ies"}, kept ${report.Kept}`,
                );
            }
        } catch (err) {
            toast.error(`Repair failed: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setRepairBusy(false);
            setRepairConfirmOpen(false);
        }
    };

    return (
        <>
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Webhook className="h-4 w-4" />
                        Result webhook
                    </DialogTitle>
                    <DialogDescription>
                        Send group-run, batch-run, and recording results to an external HTTP endpoint
                        as JSON. Leave disabled to opt out entirely.
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="max-h-[60vh] pr-3">
                    <div className="space-y-5">
                        {/* Enable + URL + timeout */}
                        <section className="space-y-3 rounded-md border p-3">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="hook-enabled" className="text-sm font-medium">
                                    Send results to webhook
                                </Label>
                                <Switch
                                    id="hook-enabled"
                                    checked={draft.Enabled}
                                    onCheckedChange={(v) => setDraft((p) => ({ ...p, Enabled: v }))}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="hook-url" className="text-xs text-muted-foreground">
                                    Endpoint URL — supports {"{{GroupId}}"}, {"{{GroupName}}"}, {"{{Event}}"} tokens
                                </Label>
                                <Input
                                    id="hook-url"
                                    type="url"
                                    placeholder="https://example.com/webhooks/marco"
                                    value={draft.Url}
                                    onChange={(e) => setDraft((p) => ({ ...p, Url: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="hook-timeout" className="text-xs text-muted-foreground">
                                    Timeout (ms, 1 000 – 60 000)
                                </Label>
                                <Input
                                    id="hook-timeout"
                                    type="number"
                                    min={1000}
                                    max={60000}
                                    step={500}
                                    value={draft.TimeoutMs}
                                    onChange={(e) => setDraft((p) => ({
                                        ...p,
                                        TimeoutMs: Number.parseInt(e.target.value, 10) || p.TimeoutMs,
                                    }))}
                                />
                            </div>
                        </section>

                        {/* Headers */}
                        <section className="space-y-2 rounded-md border p-3">
                            <div className="flex items-center justify-between">
                                <Label className="text-sm font-medium">Custom headers</Label>
                                <Button size="sm" variant="outline" onClick={addHeader}>
                                    <Plus className="mr-1 h-3.5 w-3.5" />
                                    Add header
                                </Button>
                            </div>
                            {draft.Headers.length === 0 ? (
                                <p className="text-xs text-muted-foreground">
                                    No custom headers. Add one for bearer tokens, signing keys, etc.
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {draft.Headers.map((h, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <Input
                                                placeholder="Header name"
                                                value={h.Name}
                                                onChange={(e) => updateHeader(i, { Name: e.target.value })}
                                                className="flex-1"
                                            />
                                            <Input
                                                placeholder="Header value"
                                                value={h.Value}
                                                onChange={(e) => updateHeader(i, { Value: e.target.value })}
                                                className="flex-[2]"
                                            />
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                onClick={() => removeHeader(i)}
                                                aria-label={`Remove header ${h.Name || i + 1}`}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>

                        {/* Events */}
                        <section className="space-y-2 rounded-md border p-3">
                            <Label className="text-sm font-medium">Send on these events</Label>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {ALL_WEBHOOK_EVENTS.map((kind) => (
                                    <label
                                        key={kind}
                                        className="flex cursor-pointer items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5 text-sm"
                                    >
                                        <Checkbox
                                            checked={eventSet.has(kind)}
                                            onCheckedChange={(v) => toggleEvent(kind, v === true)}
                                        />
                                        <span className="truncate">{EVENT_LABELS[kind]}</span>
                                    </label>
                                ))}
                            </div>
                            {draft.Events.length === 0 && (
                                <p className="text-xs text-destructive">
                                    No events selected — webhook will never fire.
                                </p>
                            )}
                        </section>

                        {/* Delivery log */}
                        <section className="space-y-2 rounded-md border p-3">
                            <div className="flex items-center justify-between">
                                <Label className="text-sm font-medium">
                                    Recent deliveries
                                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                        ({log.length}/20)
                                    </span>
                                </Label>
                                <div className="flex items-center gap-2">
                                    <Button size="sm" variant="ghost" onClick={refreshLog} title="Refresh log">
                                        <RefreshCw className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={handleTest} disabled={busy}>
                                        <Send className="mr-1 h-3.5 w-3.5" />
                                        {busy ? "Sending…" : "Send test ping"}
                                    </Button>
                                    {corruptCount > 0 && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => setRepairConfirmOpen(true)}
                                            disabled={repairBusy}
                                            title={`Remove ${corruptCount} corrupted entr${corruptCount === 1 ? "y" : "ies"} from the log`}
                                            className="border-destructive/60 text-destructive hover:bg-destructive/10"
                                        >
                                            <Wrench className="mr-1 h-3.5 w-3.5" />
                                            {repairBusy ? "Repairing…" : `Repair (${corruptCount})`}
                                        </Button>
                                    )}
                                    {log.length > 0 && (
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={filteredLog.length === 0}
                                                    title="Export filtered results"
                                                >
                                                    <Download className="mr-1 h-3.5 w-3.5" />
                                                    Export ({filteredLog.length})
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="text-xs">
                                                <DropdownMenuItem onSelect={() => exportFilteredLog(filteredLog, "json")}>
                                                    Download as JSON
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onSelect={() => exportFilteredLog(filteredLog, "csv")}>
                                                    Download as CSV
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    )}
                                    {log.length > 0 && (
                                        <Button size="sm" variant="ghost" onClick={handleClearLog}>
                                            Clear
                                        </Button>
                                    )}
                                </div>
                            </div>
                            {log.length > 0 && (
                                <div className="relative">
                                    <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                                    <Input
                                        type="search"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Filter by event, time, or status…"
                                        aria-label="Filter webhook deliveries by event, emitted time, or status"
                                        className="h-8 pl-7 pr-7 text-xs"
                                    />
                                    {searchQuery.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setSearchQuery("")}
                                            aria-label="Clear search"
                                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                </div>
                            )}
                            {log.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter deliveries by status">
                                    {([
                                        { key: "all", label: "All", count: logCounts.all, activeClass: "bg-foreground text-background border-foreground" },
                                        { key: "success", label: "OK", count: logCounts.success, activeClass: "bg-emerald-500/20 text-emerald-300 border-emerald-500/60" },
                                        { key: "skipped", label: "Skipped", count: logCounts.skipped, activeClass: "bg-muted text-foreground border-muted-foreground/60" },
                                        { key: "failure", label: "Failed", count: logCounts.failure, activeClass: "bg-destructive/20 text-destructive border-destructive/60" },
                                    ] as const).map((chip) => {
                                        const active = statusFilter === chip.key;
                                        const disabled = chip.key !== "all" && chip.count === 0;
                                        return (
                                            <button
                                                key={chip.key}
                                                type="button"
                                                onClick={() => setStatusFilter(chip.key)}
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
                                </div>
                            )}
                            {log.length === 0 ? (
                                <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-muted-foreground/30 bg-muted/10 px-4 py-6 text-center">
                                    <Webhook className="h-6 w-6 text-muted-foreground/60" aria-hidden />
                                    <p className="text-sm font-medium text-foreground">No deliveries yet</p>
                                    <p className="text-xs text-muted-foreground max-w-xs">
                                        {draft.Enabled && draft.Url.trim().length > 0
                                            ? "The last 20 webhook attempts will appear here, newest first. Use \"Send test ping\" to verify your endpoint."
                                            : "Enable the webhook and set an endpoint URL above, then run a group or use \"Send test ping\" to see delivery results here."}
                                    </p>
                                </div>
                            ) : filteredLog.length === 0 ? (
                                <p className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/10 px-3 py-4 text-center text-xs text-muted-foreground">
                                    {searchQuery.trim().length > 0
                                        ? <>No deliveries match search “{searchQuery}”{statusFilter !== "all" ? <> in “{statusFilter}”</> : null}. </>
                                        : <>No deliveries match the “{statusFilter}” filter. </>}
                                    <button
                                        type="button"
                                        className="underline underline-offset-2 hover:text-foreground"
                                        onClick={() => { setStatusFilter("all"); setSearchQuery(""); }}
                                    >
                                        Show all
                                    </button>
                                </p>
                            ) : (
                                <ul className="space-y-1.5">
                                    {filteredLog.map((entry, i) => {
                                        const presentation = presentVariant(entry);
                                        const hasSummaryDetail = presentation.summaryDetail !== null;
                                        // Every entry has at least Event/Emitted/Duration + a status block
                                        // (HTTP status for success, SkipReason for skipped, Error for failure),
                                        // so all rows are clickable to reveal the detail panel.
                                        const isExpandable = true;
                                        const isOpen = expandedIdx === i;
                                        return (
                                            <li
                                                key={`${entry.EmittedAt}-${i}`}
                                                className={presentation.rowClass}
                                            >
                                                <button
                                                    type="button"
                                                    className={`flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left ${presentation.hoverClass}`}
                                                    onClick={() => isExpandable && setExpandedIdx(isOpen ? null : i)}
                                                    aria-expanded={isOpen}
                                                    aria-controls={`hook-log-detail-${i}`}
                                                    disabled={!isExpandable}
                                                >
                                                    <div className="flex min-w-0 items-center gap-2">
                                                        <Badge
                                                            variant={presentation.badgeVariant}
                                                            className={`shrink-0 ${presentation.badgeExtraClass}`}
                                                        >
                                                            {presentation.badgeLabel}
                                                        </Badge>
                                                        <span className={`shrink-0 font-mono ${presentation.eventClass}`}>{entry.Event}</span>
                                                        {hasSummaryDetail && (
                                                            <span className={`truncate ${presentation.summaryDetailClass}`}>
                                                                — {presentation.summaryDetail}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
                                                        <span>{formatTime(entry.EmittedAt)} · {entry.DurationMs} ms</span>
                                                        {isExpandable && (
                                                            <ChevronDown
                                                                className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
                                                            />
                                                        )}
                                                    </span>
                                                </button>
                                                {isOpen && isExpandable && (
                                                    <div
                                                        id={`hook-log-detail-${i}`}
                                                        className="border-t px-2 py-1.5"
                                                    >
                                                        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
                                                            <dt className="text-muted-foreground">Emitted</dt>
                                                            <dd className="font-mono">{entry.EmittedAt}</dd>
                                                            <dt className="text-muted-foreground">Duration</dt>
                                                            <dd className="font-mono">{entry.DurationMs} ms</dd>
                                                            {/* Consistent "HTTP <status>" row across all variants. Skipped entries
                                                                have no Status; failures may have null. Variant guards drive null handling. */}
                                                            {(() => {
                                                                let httpText: string;
                                                                let httpClass = "font-mono";
                                                                if (isWebhookSuccess(entry)) {
                                                                    httpText = `${entry.Status}`;
                                                                } else if (isWebhookSkipped(entry)) {
                                                                    httpText = "— (not sent)";
                                                                    httpClass = "font-mono text-muted-foreground";
                                                                } else if (isWebhookFailure(entry)) {
                                                                    httpText = entry.Status !== null ? `${entry.Status}` : "— (no response)";
                                                                    httpClass = entry.Status !== null
                                                                        ? "font-mono text-destructive"
                                                                        : "font-mono text-muted-foreground";
                                                                } else {
                                                                    httpText = "—";
                                                                    httpClass = "font-mono text-muted-foreground";
                                                                }
                                                                return (
                                                                    <>
                                                                        <dt className="text-muted-foreground">HTTP</dt>
                                                                        <dd className={httpClass}>{httpText}</dd>
                                                                    </>
                                                                );
                                                            })()}
                                                            {isWebhookSkipped(entry) && (
                                                                <>
                                                                    <dt className="text-muted-foreground">Skip reason</dt>
                                                                    <dd className="whitespace-pre-wrap break-words font-mono">
                                                                        {entry.SkipReason && entry.SkipReason.length > 0
                                                                            ? entry.SkipReason
                                                                            : "(no reason recorded)"}
                                                                    </dd>
                                                                </>
                                                            )}
                                                            {isWebhookFailure(entry) && (
                                                                <>
                                                                    <dt className="text-muted-foreground">Error</dt>
                                                                    <dd className="whitespace-pre-wrap break-words font-mono text-destructive">
                                                                        {entry.Error && entry.Error.length > 0
                                                                            ? entry.Error
                                                                            : "(no error message)"}
                                                                    </dd>
                                                                </>
                                                            )}
                                                        </dl>
                                                        {(() => {
                                                            const payloadJson = formatPayloadJson(entry);
                                                            const payloadOpen = payloadOpenIdx === i;
                                                            return (
                                                                <div className="mt-2 space-y-2">
                                                                    <div className="flex items-center justify-between gap-2">
                                                                        <button
                                                                            type="button"
                                                                            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                                                                            onClick={() => setPayloadOpenIdx(payloadOpen ? null : i)}
                                                                            disabled={payloadJson === null}
                                                                            aria-expanded={payloadOpen}
                                                                            aria-controls={`hook-log-payload-${i}`}
                                                                        >
                                                                            <ChevronDown
                                                                                className={`h-3 w-3 transition-transform ${payloadOpen ? "rotate-180" : ""}`}
                                                                            />
                                                                            {payloadJson === null
                                                                                ? "Raw JSON payload (not captured)"
                                                                                : payloadOpen ? "Hide raw JSON payload" : "Show raw JSON payload"}
                                                                        </button>
                                                                        <Button
                                                                            size="sm"
                                                                            variant="outline"
                                                                            onClick={() => void copyLogEntry(entry)}
                                                                        >
                                                                            <Copy className="mr-1 h-3.5 w-3.5" />
                                                                            Copy details
                                                                        </Button>
                                                                    </div>
                                                                    {payloadOpen && payloadJson !== null && (
                                                                        <pre
                                                                            id={`hook-log-payload-${i}`}
                                                                            className="max-h-64 overflow-auto rounded-md border bg-background/60 p-2 text-[11px] font-mono whitespace-pre-wrap break-words"
                                                                        >
                                                                            {payloadJson}
                                                                        </pre>
                                                                    )}
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </section>
                    </div>
                </ScrollArea>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSave}>Save settings</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <AlertDialog open={repairConfirmOpen} onOpenChange={setRepairConfirmOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <Wrench className="h-4 w-4 text-destructive" />
                        Repair corrupted webhook log?
                    </AlertDialogTitle>
                    <AlertDialogDescription asChild>
                        <div className="space-y-2 text-sm">
                            <p>
                                This will scan the locally stored webhook delivery log and
                                permanently remove every entry that fails validation
                                (missing/wrong fields, unparsable JSON, or wrong shape).
                            </p>
                            <p>
                                <span className="font-semibold text-destructive">{corruptCount}</span>{" "}
                                corrupted entr{corruptCount === 1 ? "y" : "ies"} will be removed.
                                Valid history is preserved.
                            </p>
                            <p className="text-xs text-muted-foreground">
                                This action cannot be undone.
                            </p>
                        </div>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={repairBusy}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e) => {
                            e.preventDefault();
                            handleRepair();
                        }}
                        disabled={repairBusy}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                        {repairBusy ? "Repairing…" : "Repair log"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        </>
    );
}
