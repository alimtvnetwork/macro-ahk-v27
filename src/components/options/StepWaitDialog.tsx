/**
 * Marco Extension — Step Wait Selector Dialog
 *
 * Configure (or clear) the post-step wait condition for a single Step.
 * Wraps the pure helpers in `step-wait.ts` so the dialog stays
 * presentation-only.
 *
 * UX:
 *   - Selector field with live auto-detect badge (Css / XPath).
 *   - "Override" radio lets the user pin Kind when auto-detect picks
 *     the wrong language.
 *   - Condition select (Appears / Disappears / Visible).
 *   - Timeout in ms (clamped 250–60 000).
 *   - Save / Clear / Cancel.
 *
 * The dialog never persists until the user clicks Save, and always
 * round-trips through the sanitiser in `writeStepWait`.
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Eye, EyeOff, MousePointer2, SearchCheck, Trash2, XCircle } from "lucide-react";

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
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

import {
    DEFAULT_WAIT_CONFIG,
    clearStepWait,
    detectSelectorKind,
    evaluateSelector,
    readStepWait,
    validateSelector,
    writeStepWait,
    type ElementLike,
    type SelectorKind,
    type WaitCondition,
    type WaitConfig,
} from "@/background/recorder/step-library/step-wait";

/**
 * Result of clicking "Test selector" — counts matches in the current
 * options-page document so the user can see whether their expression
 * resolves anything before saving.
 *
 * Note: this only probes the page hosting the options UI, not the
 * recorder's target tab. It still catches the most common authoring
 * mistakes (typos, wrong axis, missing brackets) and proves the
 * expression compiles.
 */
interface TestResult {
    readonly Kind: SelectorKind;
    readonly TotalCount: number;
    readonly VisibleCount: number;
    readonly DurationMs: number;
    readonly Error: string | null;
}

function countVisible(matches: ReadonlyArray<ElementLike>): number {
    let n = 0;
    for (const el of matches) {
        const w = typeof el.offsetWidth === "number" ? el.offsetWidth : 0;
        const h = typeof el.offsetHeight === "number" ? el.offsetHeight : 0;
        if (w > 0 || h > 0) { n += 1; continue; }
        if (typeof el.getClientRects === "function" && el.getClientRects().length > 0) {
            n += 1;
        }
    }
    return n;
}

interface Props {
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
    readonly stepId: number | null;
    readonly stepLabel: string | null;
    /** Notifies the parent to refresh its "has wait" badge state. */
    readonly onChange?: () => void;
}

type KindMode = "Auto" | "Css" | "XPath";

const CONDITION_LABELS: Record<WaitCondition, string> = {
    Appears: "Element appears in DOM",
    Disappears: "Element disappears from DOM",
    Visible: "Element is visible (has layout)",
};

const CONDITION_ICON: Record<WaitCondition, typeof Eye> = {
    Appears: MousePointer2,
    Disappears: EyeOff,
    Visible: Eye,
};

export default function StepWaitDialog(props: Props) {
    const { open, onOpenChange, stepId, stepLabel, onChange } = props;

    const [selector, setSelector] = useState("");
    const [kindMode, setKindMode] = useState<KindMode>("Auto");
    const [condition, setCondition] = useState<WaitCondition>(DEFAULT_WAIT_CONFIG.Condition);
    const [timeoutMs, setTimeoutMs] = useState<number>(DEFAULT_WAIT_CONFIG.TimeoutMs);
    const [hasExisting, setHasExisting] = useState(false);
    const [testResult, setTestResult] = useState<TestResult | null>(null);

    useEffect(() => {
        if (!open || stepId === null) return;
        const existing = readStepWait(stepId);
        if (existing === null) {
            setSelector("");
            setKindMode("Auto");
            setCondition(DEFAULT_WAIT_CONFIG.Condition);
            setTimeoutMs(DEFAULT_WAIT_CONFIG.TimeoutMs);
            setHasExisting(false);
        } else {
            setSelector(existing.Selector);
            setKindMode(existing.Kind);
            setCondition(existing.Condition);
            setTimeoutMs(existing.TimeoutMs);
            setHasExisting(true);
        }
        setTestResult(null);
    }, [open, stepId]);

    // Invalidate stale test results whenever the inputs change.
    useEffect(() => {
        setTestResult(null);
    }, [selector, kindMode]);

    const detected: SelectorKind = useMemo(
        () => detectSelectorKind(selector),
        [selector],
    );
    const effectiveKind: SelectorKind =
        kindMode === "Auto" ? detected : kindMode;

    const validation = useMemo(
        () => selector.trim().length === 0
            ? { Ok: true as const, Kind: effectiveKind }
            : validateSelector(selector, effectiveKind),
        [selector, effectiveKind],
    );

    const handleSave = () => {
        if (stepId === null) return;
        if (selector.trim().length === 0) {
            toast.error("Selector is required");
            return;
        }
        if (!validation.Ok) {
            toast.error(validation.Reason);
            return;
        }
        const next: WaitConfig = {
            Selector: selector.trim(),
            Kind: effectiveKind,
            Condition: condition,
            TimeoutMs: timeoutMs,
        };
        try {
            writeStepWait(stepId, next);
            toast.success("Wait condition saved");
            onChange?.();
            onOpenChange(false);
        } catch (e) {
            const detail = e instanceof Error ? e.message : "Unknown error";
            toast.error(`Could not save: ${detail}`);
        }
    };

    const handleTest = () => {
        if (selector.trim().length === 0) {
            toast.error("Enter a selector first");
            return;
        }
        if (!validation.Ok) {
            setTestResult({
                Kind: effectiveKind,
                TotalCount: 0,
                VisibleCount: 0,
                DurationMs: 0,
                Error: validation.Reason,
            });
            return;
        }
        const startedAt = performance.now();
        try {
            const matches = evaluateSelector({
                Selector: selector.trim(),
                Kind: effectiveKind,
            });
            const elapsed = Math.max(0, Math.round(performance.now() - startedAt));
            setTestResult({
                Kind: effectiveKind,
                TotalCount: matches.length,
                VisibleCount: countVisible(matches),
                DurationMs: elapsed,
                Error: null,
            });
        } catch (e) {
            const detail = e instanceof Error ? e.message : "Unknown evaluation error";
            setTestResult({
                Kind: effectiveKind,
                TotalCount: 0,
                VisibleCount: 0,
                DurationMs: Math.max(0, Math.round(performance.now() - startedAt)),
                Error: detail,
            });
        }
    };

    const handleClear = () => {
        if (stepId === null) return;
        clearStepWait(stepId);
        toast.success("Wait condition cleared");
        onChange?.();
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Wait after this step</DialogTitle>
                    <DialogDescription>
                        {stepLabel === null || stepLabel.length === 0
                            ? "After this step runs, wait for the selector below to satisfy the chosen condition before continuing."
                            : `After "${stepLabel}" runs, wait for this selector before continuing.`}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Selector */}
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="wait-selector" className="text-sm font-medium">
                                Selector
                            </Label>
                            {selector.trim().length > 0 && (
                                <Badge variant={kindMode === "Auto" ? "secondary" : "outline"}>
                                    {kindMode === "Auto" ? `Auto · ${detected}` : effectiveKind}
                                </Badge>
                            )}
                        </div>
                        <Input
                            id="wait-selector"
                            placeholder="#submit-confirmation, .loading, //div[@id='ok']"
                            value={selector}
                            onChange={(e) => setSelector(e.target.value)}
                            className="font-mono text-sm"
                        />
                        {!validation.Ok && (
                            <p className="text-xs text-destructive">{validation.Reason}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                            Auto-detect picks XPath when the expression starts with <code>/</code>,
                            <code> ./</code>, <code>(/</code>, <code>(./</code>, or contains <code>//</code>.
                        </p>

                        {/* Test selector against the live document */}
                        <div className="flex items-center gap-2 pt-1">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleTest}
                                disabled={selector.trim().length === 0}
                            >
                                <SearchCheck className="mr-1 h-3.5 w-3.5" />
                                Test selector
                            </Button>
                            {testResult !== null && testResult.Error === null && (
                                <span
                                    className={
                                        testResult.TotalCount > 0
                                            ? "flex items-center gap-1 text-xs text-emerald-500"
                                            : "flex items-center gap-1 text-xs text-amber-500"
                                    }
                                >
                                    {testResult.TotalCount > 0
                                        ? <CheckCircle2 className="h-3.5 w-3.5" />
                                        : <XCircle className="h-3.5 w-3.5" />}
                                    {testResult.TotalCount} match
                                    {testResult.TotalCount === 1 ? "" : "es"}
                                    {testResult.TotalCount > 0 && (
                                        <span className="text-muted-foreground">
                                            · {testResult.VisibleCount} visible
                                        </span>
                                    )}
                                    <span className="text-muted-foreground">
                                        · {testResult.DurationMs} ms
                                    </span>
                                </span>
                            )}
                            {testResult !== null && testResult.Error !== null && (
                                <span className="flex items-center gap-1 text-xs text-destructive">
                                    <XCircle className="h-3.5 w-3.5" />
                                    {testResult.Error}
                                </span>
                            )}
                        </div>
                        {testResult !== null && testResult.Error === null && testResult.TotalCount === 0 && (
                            <p className="text-xs text-muted-foreground">
                                No elements matched on the current options page. The selector
                                will still be evaluated against the recorder's target tab at run
                                time — this preview only catches typos and compile errors.
                            </p>
                        )}
                    </div>

                    {/* Kind override */}
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Selector type</Label>
                        <Select
                            value={kindMode}
                            onValueChange={(v) => setKindMode(v as KindMode)}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Auto">Auto-detect</SelectItem>
                                <SelectItem value="Css">Force CSS</SelectItem>
                                <SelectItem value="XPath">Force XPath</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Condition */}
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Condition</Label>
                        <Select
                            value={condition}
                            onValueChange={(v) => setCondition(v as WaitCondition)}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {(["Appears", "Visible", "Disappears"] as const).map((c) => {
                                    const Icon = CONDITION_ICON[c];
                                    return (
                                        <SelectItem key={c} value={c}>
                                            <span className="flex items-center gap-2">
                                                <Icon className="h-3.5 w-3.5" />
                                                {CONDITION_LABELS[c]}
                                            </span>
                                        </SelectItem>
                                    );
                                })}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Timeout */}
                    <div className="space-y-1.5">
                        <Label htmlFor="wait-timeout" className="text-xs text-muted-foreground">
                            Timeout (ms, 250 – 60 000)
                        </Label>
                        <Input
                            id="wait-timeout"
                            type="number"
                            min={250}
                            max={60000}
                            step={250}
                            value={timeoutMs}
                            onChange={(e) => setTimeoutMs(
                                Number.parseInt(e.target.value, 10) || timeoutMs,
                            )}
                        />
                    </div>
                </div>

                <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
                    <div>
                        {hasExisting && (
                            <Button variant="ghost" onClick={handleClear}>
                                <Trash2 className="mr-1 h-4 w-4" />
                                Remove wait
                            </Button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Button variant="ghost" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSave}>Save</Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
