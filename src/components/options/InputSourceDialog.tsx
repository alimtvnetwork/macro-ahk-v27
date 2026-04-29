/**
 * Marco Extension — Input Source Settings Dialog
 *
 * Configures the project-wide HTTP endpoint that supplies a fresh
 * JSON input bag at the start of every batch run. Backed by
 * `input-source.ts` storage.
 *
 * Sections:
 *   1. Enable toggle + URL + Method + Timeout
 *   2. Headers editor (name/value rows, add/remove)
 *   3. POST body (only shown when Method = POST)
 *   4. Failure policy radio
 *   5. Test fetch button → runs `fetchInputSource` and shows the bag
 *
 * The dialog owns its draft and only persists on Save, so cancel
 * leaves the existing config untouched.
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Globe, Plus, Send, Trash2 } from "lucide-react";

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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

import {
    DEFAULT_INPUT_SOURCE_CONFIG,
    fetchInputSource,
    loadInputSourceConfig,
    saveInputSourceConfig,
    type InputSourceConfig,
    type InputSourceFailurePolicy,
    type InputSourceHeader,
    type InputSourceMethod,
    type FetchInputResult,
} from "@/background/recorder/step-library/input-source";

interface Props {
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
}

export default function InputSourceDialog({ open, onOpenChange }: Props) {
    const [draft, setDraft] = useState<InputSourceConfig>(DEFAULT_INPUT_SOURCE_CONFIG);
    const [busy, setBusy] = useState(false);
    const [lastResult, setLastResult] = useState<FetchInputResult | null>(null);

    useEffect(() => {
        if (open) {
            setDraft(loadInputSourceConfig());
            setLastResult(null);
        }
    }, [open]);

    const updateHeader = (idx: number, patch: Partial<InputSourceHeader>) => {
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
        const saved = saveInputSourceConfig(draft);
        setDraft(saved);
        toast.success("Input source settings saved");
        onOpenChange(false);
    };

    const handleTest = async () => {
        if (draft.Url.trim().length === 0) {
            toast.error("Add a URL before sending a test fetch");
            return;
        }
        setBusy(true);
        // Force-enable for the duration of the test even if Enabled is off.
        const r = await fetchInputSource({
            config: { ...draft, Enabled: true },
        });
        setBusy(false);
        setLastResult(r);
        if (r.Ok && !r.Skipped) {
            const keys = Object.keys(r.Bag);
            toast.success(`Fetched ${keys.length} key(s) (HTTP ${r.Status})`);
        } else if (r.Ok && r.Skipped) {
            toast.warning(`Skipped: ${r.SkipReason}`);
        } else {
            toast.error(`Fetch failed: ${r.Error}`);
        }
    };

    const previewKeys = useMemo<ReadonlyArray<string>>(() => {
        if (lastResult === null || !lastResult.Ok || lastResult.Skipped) return [];
        return Object.keys(lastResult.Bag);
    }, [lastResult]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Globe className="h-4 w-4" />
                        Run-time input source
                    </DialogTitle>
                    <DialogDescription>
                        Fetch a fresh JSON bag from your endpoint at the start of every batch run.
                        The fetched values are merged on top of each group's saved input bag — endpoint
                        keys win on collision.
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="max-h-[60vh] pr-3">
                    <div className="space-y-5">
                        {/* Enable + URL + Method + Timeout */}
                        <section className="space-y-3 rounded-md border p-3">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="src-enabled" className="text-sm font-medium">
                                    Fetch input data at run start
                                </Label>
                                <Switch
                                    id="src-enabled"
                                    checked={draft.Enabled}
                                    onCheckedChange={(v) => setDraft((p) => ({ ...p, Enabled: v }))}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="src-url" className="text-xs text-muted-foreground">
                                    Endpoint URL
                                </Label>
                                <Input
                                    id="src-url"
                                    type="url"
                                    placeholder="https://example.com/api/marco-inputs"
                                    value={draft.Url}
                                    onChange={(e) => setDraft((p) => ({ ...p, Url: e.target.value }))}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-muted-foreground">Method</Label>
                                    <Select
                                        value={draft.Method}
                                        onValueChange={(v) => setDraft((p) => ({
                                            ...p,
                                            Method: v as InputSourceMethod,
                                        }))}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="GET">GET</SelectItem>
                                            <SelectItem value="POST">POST</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="src-timeout" className="text-xs text-muted-foreground">
                                        Timeout (ms)
                                    </Label>
                                    <Input
                                        id="src-timeout"
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

                        {/* POST body */}
                        {draft.Method === "POST" && (
                            <section className="space-y-2 rounded-md border p-3">
                                <Label htmlFor="src-body" className="text-sm font-medium">
                                    Request body (JSON)
                                </Label>
                                <Textarea
                                    id="src-body"
                                    rows={4}
                                    placeholder='{"projectId": 1}'
                                    value={draft.RequestBody}
                                    onChange={(e) => setDraft((p) => ({
                                        ...p,
                                        RequestBody: e.target.value,
                                    }))}
                                    className="font-mono text-xs"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Leave empty to send no body. Content-Type defaults to application/json.
                                </p>
                            </section>
                        )}

                        {/* Failure policy */}
                        <section className="space-y-2 rounded-md border p-3">
                            <Label className="text-sm font-medium">If the endpoint fails</Label>
                            <Select
                                value={draft.OnFailure}
                                onValueChange={(v) => setDraft((p) => ({
                                    ...p,
                                    OnFailure: v as InputSourceFailurePolicy,
                                }))}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Abort">Abort the run</SelectItem>
                                    <SelectItem value="ContinueWithLocal">
                                        Continue with locally-saved inputs
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </section>

                        {/* Test fetch */}
                        <section className="space-y-2 rounded-md border p-3">
                            <div className="flex items-center justify-between">
                                <Label className="text-sm font-medium">Test fetch</Label>
                                <Button size="sm" variant="outline" onClick={handleTest} disabled={busy}>
                                    <Send className="mr-1 h-3.5 w-3.5" />
                                    {busy ? "Fetching…" : "Send test fetch"}
                                </Button>
                            </div>
                            {lastResult === null ? (
                                <p className="text-xs text-muted-foreground">
                                    Run a test to verify the endpoint returns a JSON object.
                                </p>
                            ) : lastResult.Ok && !lastResult.Skipped ? (
                                <div className="space-y-2 text-xs">
                                    <div className="flex items-center gap-2">
                                        <Badge>OK {lastResult.Status}</Badge>
                                        <span className="text-muted-foreground">
                                            {lastResult.DurationMs} ms · {previewKeys.length} key(s)
                                        </span>
                                    </div>
                                    <pre className="max-h-40 overflow-auto rounded bg-muted/40 p-2 font-mono">
                                        {JSON.stringify(lastResult.Bag, null, 2)}
                                    </pre>
                                </div>
                            ) : lastResult.Ok && lastResult.Skipped ? (
                                <p className="text-xs text-muted-foreground">
                                    Skipped: {lastResult.SkipReason}
                                </p>
                            ) : (
                                <div className="space-y-1 text-xs">
                                    <Badge variant="destructive">Fail</Badge>
                                    <p className="text-destructive">{lastResult.Error}</p>
                                </div>
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
    );
}
