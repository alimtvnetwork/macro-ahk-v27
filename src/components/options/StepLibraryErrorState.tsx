/**
 * Marco Extension — Step Library Error State
 *
 * Shared, actionable error card surfaced by both the Step Group
 * Library tree panel and the list panel when `useStepLibrary` fails
 * to bootstrap. Renders the structured `StepLibraryLoadError`:
 *
 *   ┌──────────────────────────────────────────────┐
 *   │  ⚠   Title (kind-specific)                   │
 *   │      Hint — plain-language recovery advice   │
 *   │      ▸ Technical details (collapsible)       │
 *   │      [ Retry ]   [ Reset library ]           │
 *   └──────────────────────────────────────────────┘
 *
 * The Reset action is destructive (wipes localStorage), so it always
 * lives behind an AlertDialog confirmation. Retry is safe to spam —
 * it just bumps the bootstrap nonce in the hook.
 *
 * @see @/hooks/use-step-library — emits `LoadError`
 */

import { useState } from "react";
import { AlertTriangle, Database, RefreshCw, Trash2, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import type { StepLibraryLoadError } from "@/hooks/use-step-library";

export interface StepLibraryErrorStateProps {
    readonly error: StepLibraryLoadError;
    readonly onRetry: () => void;
    readonly onReset: () => void;
}

/**
 * Map each error kind to a short, human title + the icon that best
 * communicates it at a glance. Kept here (not in the hook) so the
 * presentation layer owns the wording.
 */
function titleAndIcon(kind: StepLibraryLoadError["Kind"]): { Title: string; Icon: typeof AlertTriangle } {
    switch (kind) {
        case "SqlJsLoad":
            return { Title: "Couldn't load the SQL engine", Icon: WifiOff };
        case "StorageRead":
            return { Title: "Couldn't read your saved library", Icon: Database };
        case "StorageWrite":
            return { Title: "Couldn't save to browser storage", Icon: Database };
        case "Unknown":
        default:
            return { Title: "Step library failed to open", Icon: AlertTriangle };
    }
}

export default function StepLibraryErrorState({ error, onRetry, onReset }: StepLibraryErrorStateProps) {
    const [showDetails, setShowDetails] = useState(false);
    const [confirmReset, setConfirmReset] = useState(false);
    const { Title, Icon } = titleAndIcon(error.Kind);

    return (
        <div className="flex h-full min-h-[400px] items-center justify-center p-6">
            <Card className="flex w-full max-w-xl flex-col gap-4 p-6">
                <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                        <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                        <h2 className="text-lg font-semibold tracking-tight">{Title}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">{error.Hint}</p>
                    </div>
                </div>

                <div className="rounded border bg-muted/30 px-3 py-2 text-xs">
                    <button
                        type="button"
                        onClick={() => setShowDetails((s) => !s)}
                        className="font-medium text-muted-foreground hover:text-foreground"
                        aria-expanded={showDetails}
                    >
                        {showDetails ? "Hide technical details" : "Show technical details"}
                    </button>
                    {showDetails && (
                        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">
                            {error.Kind}: {error.Message}
                        </pre>
                    )}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                    {/* Reset is the destructive escape hatch — always
                        guarded by a confirmation since it wipes the
                        on-disk DB blob. */}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmReset(true)}
                        title="Wipe the saved library and start fresh"
                    >
                        <Trash2 className="mr-1 h-4 w-4" />
                        Reset library
                    </Button>
                    <Button size="sm" onClick={onRetry}>
                        <RefreshCw className="mr-1 h-4 w-4" />
                        Retry
                    </Button>
                </div>
            </Card>

            <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Reset the step library?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This permanently deletes the saved step-group database from
                            your browser. Any groups, steps, or input data not exported
                            to a ZIP bundle will be lost. The page will reload.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={onReset}
                        >
                            Reset and reload
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
