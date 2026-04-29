/**
 * Marco Extension — Form Snapshot Table
 *
 * Pure presentational view of a {@link FormSnapshot}. Renders a compact
 * table of every captured field with type, required marker, sensitive
 * mask icon, and (when verbose) the captured value.
 *
 * Used in three surfaces (per
 * mem://features/form-snapshot-capture):
 *   1. Inline on each recorded step card whose `FormSnapshot` is non-null.
 *   2. Inside `FailureDetailsPanel` when the failing step carries one.
 *   3. As an icon-only badge on `SelectorReplayTracePanel` rows (separate
 *      tiny `<FormSnapshotBadge>` export).
 *
 * Pure: no DOM mutation, no chrome.*, no async. Renders whatever the
 * caller passes; absent fields collapse silently.
 */

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    ClipboardList,
    Lock,
    Asterisk,
    EyeOff,
} from "lucide-react";
import type { FormSnapshot, FormFieldMeta } from "@/background/recorder/form-snapshot";

interface FormSnapshotTableProps {
    readonly snapshot: FormSnapshot;
    /** Hide the surrounding section/border — useful inside another card. */
    readonly embedded?: boolean;
    /** Override the section heading. */
    readonly title?: string;
}

export function FormSnapshotTable({ snapshot, embedded, title }: FormSnapshotTableProps) {
    const valueByName = new Map<string, { Value: string; Masked: boolean }>();
    if (snapshot.Values !== null) {
        for (const v of snapshot.Values) {
            valueByName.set(v.Name, { Value: v.Value, Masked: v.Masked });
        }
    }

    const heading = title ?? "Form snapshot";
    const verboseTone = snapshot.Verbose
        ? "border-amber-500/40 bg-amber-500/5"
        : "border-border bg-muted/20";

    const body = (
        <div className="space-y-2" data-testid="form-snapshot-table">
            <header className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                <ClipboardList className="h-3 w-3" aria-hidden />
                <span className="font-medium">{heading}</span>
                <Badge variant="secondary" className="text-[10px]">
                    {snapshot.Fields.length} field{snapshot.Fields.length === 1 ? "" : "s"}
                </Badge>
                {snapshot.Form.Id !== null && (
                    <span className="text-[11px] text-muted-foreground normal-case tracking-normal">
                        #{snapshot.Form.Id}
                    </span>
                )}
                {snapshot.Verbose ? (
                    <Badge variant="default" className="ml-auto text-[10px]" title="Captured under verbose logging — values included (sensitive fields masked)">
                        VALUES
                    </Badge>
                ) : (
                    <Badge variant="outline" className="ml-auto text-[10px]" title="Verbose logging was OFF — only field names + types captured">
                        <EyeOff className="h-2.5 w-2.5 mr-1" aria-hidden />
                        NAMES ONLY
                    </Badge>
                )}
            </header>

            <ScrollArea className="max-h-56 pr-2">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
                            <th className="text-left font-medium py-1 pr-2">Field</th>
                            <th className="text-left font-medium py-1 pr-2">Type</th>
                            {snapshot.Verbose && (
                                <th className="text-left font-medium py-1">Value</th>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {snapshot.Fields.map((f, i) => (
                            <FieldRow
                                key={`${f.Name}-${i}`}
                                field={f}
                                value={valueByName.get(f.Name) ?? null}
                                showValue={snapshot.Verbose}
                            />
                        ))}
                    </tbody>
                </table>
            </ScrollArea>
        </div>
    );

    if (embedded === true) return body;

    return (
        <section
            aria-label="Form snapshot"
            data-testid="form-snapshot-section"
            data-verbose={snapshot.Verbose}
            className={`rounded-md border ${verboseTone} p-2.5`}
        >
            {body}
        </section>
    );
}

function FieldRow({
    field, value, showValue,
}: {
    readonly field: FormFieldMeta;
    readonly value: { Value: string; Masked: boolean } | null;
    readonly showValue: boolean;
}) {
    return (
        <tr
            data-testid="form-snapshot-row"
            data-name={field.Name}
            data-sensitive={field.Sensitive}
            className="border-b border-border/40 last:border-0"
        >
            <td className="py-1 pr-2 align-top">
                <div className="flex items-center gap-1 flex-wrap">
                    <code className="font-mono text-foreground">{field.Name}</code>
                    {field.Required && (
                        <Asterisk className="h-2.5 w-2.5 text-destructive" aria-label="required" />
                    )}
                    {field.Sensitive && (
                        <Lock className="h-2.5 w-2.5 text-amber-500" aria-label="sensitive" />
                    )}
                </div>
            </td>
            <td className="py-1 pr-2 align-top">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                    {field.Type}
                </Badge>
            </td>
            {showValue && (
                <td className="py-1 align-top">
                    {value === null ? (
                        <span className="text-muted-foreground italic">—</span>
                    ) : (
                        <code
                            className={`font-mono break-all ${value.Masked ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}
                            data-masked={value.Masked}
                        >
                            {value.Value.length === 0 ? <span className="italic text-muted-foreground">empty</span> : value.Value}
                        </code>
                    )}
                </td>
            )}
        </tr>
    );
}

/**
 * Compact pill version — just "snapshot: N fields", optional sensitive
 * count. Used in the Selector Replay Trace rows so the user knows the
 * step carries form data without expanding the full panel.
 */
export function FormSnapshotBadge({ snapshot }: { readonly snapshot: FormSnapshot }) {
    const sensitive = snapshot.Fields.filter((f) => f.Sensitive).length;
    const label = `snapshot: ${snapshot.Fields.length} field${snapshot.Fields.length === 1 ? "" : "s"}`;
    const title = snapshot.Verbose
        ? `Form snapshot captured with values (${sensitive} sensitive masked)`
        : `Form snapshot — names + types only (verbose OFF)`;

    return (
        <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0 inline-flex items-center gap-1"
            data-testid="form-snapshot-badge"
            data-verbose={snapshot.Verbose}
            title={title}
        >
            <ClipboardList className="h-2.5 w-2.5" aria-hidden />
            {label}
            {sensitive > 0 && <Lock className="h-2.5 w-2.5 text-amber-500" aria-hidden />}
        </Badge>
    );
}
