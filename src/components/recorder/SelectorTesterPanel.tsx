/**
 * Marco Extension — Mini Selector Tester
 *
 * Tiny inline tool: paste a CSS or XPath selector and immediately see the
 * match count, the first matched element, and any syntax error. Auto-
 * detects kind from the leading character but exposes a manual override.
 *
 * Pure presentation around `testSelector` (background module). Defaults to
 * the live `document` but accepts an injectable `doc` for tests.
 */

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Crosshair, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import {
    testSelector,
    detectSelectorKind,
    type SelectorTestKind,
} from "@/background/recorder/selector-tester";
import type { DomContext } from "@/background/recorder/failure-logger";

interface SelectorTesterPanelProps {
    /** Defaults to `document`. Inject a sandbox doc in tests. */
    readonly doc?: Document;
}

function elementSummary(el: DomContext | null): string {
    if (el === null) return "no match";
    const attrs: string[] = [];
    if (el.Id !== null)        attrs.push(`#${el.Id}`);
    if (el.ClassName !== null) attrs.push(`.${el.ClassName.split(/\s+/).filter(Boolean).join(".")}`);
    const head = `<${el.TagName}${attrs.length > 0 ? ` ${attrs.join("")}` : ""}>`;
    if (el.TextSnippet.length === 0) return head;
    return `${head} "${el.TextSnippet}"`;
}

const KIND_OPTIONS: ReadonlyArray<{ readonly value: SelectorTestKind; readonly label: string }> = [
    { value: "Auto",  label: "Auto"  },
    { value: "Css",   label: "CSS"   },
    { value: "XPath", label: "XPath" },
];

export function SelectorTesterPanel({ doc }: SelectorTesterPanelProps = {}) {
    const [expression, setExpression] = useState("");
    const [kind, setKind] = useState<SelectorTestKind>("Auto");
    const targetDoc = doc ?? (typeof document !== "undefined" ? document : null);

    const result = useMemo(() => {
        if (targetDoc === null || expression.trim().length === 0) return null;
        return testSelector(expression, targetDoc, kind);
    }, [expression, kind, targetDoc]);

    const detectedKind = expression.trim().length > 0
        ? (kind === "Auto" ? detectSelectorKind(expression) : kind)
        : null;

    const matched = result !== null && result.Error === null && result.MatchCount > 0;
    const errored = result !== null && result.Error !== null;

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Crosshair className="h-4 w-4 text-primary" />
                    Selector Tester
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex gap-2">
                    <Input
                        value={expression}
                        onChange={(e) => setExpression(e.target.value)}
                        placeholder="#go    or    //button[@id='go']"
                        className="font-mono text-xs"
                        aria-label="Selector expression"
                        spellCheck={false}
                    />
                    <div className="flex rounded-md border border-border overflow-hidden shrink-0">
                        {KIND_OPTIONS.map((o) => (
                            <Button
                                key={o.value}
                                type="button"
                                variant={kind === o.value ? "default" : "ghost"}
                                size="sm"
                                className="rounded-none h-9 px-2 text-[11px]"
                                onClick={() => setKind(o.value)}
                            >
                                {o.label}
                            </Button>
                        ))}
                    </div>
                </div>

                {detectedKind !== null && (
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {detectedKind}
                        </Badge>
                        {kind === "Auto" && <span>auto-detected</span>}
                    </div>
                )}

                {result === null ? (
                    <p className="text-xs text-muted-foreground italic py-2 text-center">
                        Paste a CSS or XPath selector to test it against the current page.
                    </p>
                ) : errored ? (
                    <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>{result.Error}</span>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            {matched
                                ? <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />
                                : <XCircle className="h-4 w-4 text-destructive" aria-hidden />}
                            <Badge
                                variant={matched ? "secondary" : "destructive"}
                                className="text-[10px] px-1.5 py-0"
                            >
                                {result.MatchCount} match{result.MatchCount === 1 ? "" : "es"}
                            </Badge>
                        </div>
                        <div className="rounded-md border border-border bg-card px-2.5 py-2 text-xs">
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                                First match
                            </div>
                            <code className={`break-all ${matched ? "text-foreground" : "text-muted-foreground italic"}`}>
                                {elementSummary(result.FirstMatch)}
                            </code>
                            {result.FirstMatch !== null && result.FirstMatch.OuterHtmlSnippet.length > 0 && (
                                <pre className="mt-1.5 text-[11px] text-muted-foreground whitespace-pre-wrap break-all">
                                    {result.FirstMatch.OuterHtmlSnippet}
                                </pre>
                            )}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
