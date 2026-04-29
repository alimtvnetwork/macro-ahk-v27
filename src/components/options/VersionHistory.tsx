/**
 * Marco Extension — Version History Component
 *
 * Timeline view for SharedAsset version history with content hash diffs
 * and rollback functionality.
 *
 * @see spec/21-app/02-features/misc-features/cross-project-sync.md §VersionHistory
 */

import { useState, useEffect, useCallback } from "react";
import { sendMessage } from "@/lib/message-client";
import { Button } from "@/components/ui/button";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  History,
  RotateCcw,
  ChevronDown,
  Hash,
  Loader2,
  Clock,
  GitCommit,
} from "lucide-react";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AssetVersion {
  Id: number;
  SharedAssetId: number;
  Version: string;
  ContentJson: string;
  ContentHash: string;
  ChangedBy: string;
  CreatedAt: string;
}

interface VersionHistoryProps {
  assetId: number;
  currentHash: string;
  currentVersion: string;
  onRollback: () => void;
}

/* ------------------------------------------------------------------ */
/*  ChangedBy label mapping                                            */
/* ------------------------------------------------------------------ */

const CHANGE_LABELS: Record<string, { label: string; className: string }> = {
  create: { label: "Created", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  user: { label: "Edited", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  promote: { label: "Promoted", className: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
  replace: { label: "Replaced", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  rollback: { label: "Rollback", className: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  "pre-rollback": { label: "Pre-rollback", className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
};

function getChangeLabel(changedBy: string) {
  return CHANGE_LABELS[changedBy] ?? { label: changedBy, className: "bg-muted text-muted-foreground border-border" };
}

/* ------------------------------------------------------------------ */
/*  VersionRow                                                         */
/* ------------------------------------------------------------------ */

interface VersionRowProps {
  version: AssetVersion;
  isCurrent: boolean;
  isFirst: boolean;
  isLast: boolean;
  prevHash: string | null;
  onRollback: (versionId: number) => void;
}

// eslint-disable-next-line max-lines-per-function -- cohesive timeline row with badges and collapsible
function VersionRow({ version, isCurrent, isFirst, isLast, prevHash, onRollback }: VersionRowProps) {
  const [expanded, setExpanded] = useState(false);
  const { label, className } = getChangeLabel(version.ChangedBy);
  const hashChanged = prevHash !== null && prevHash !== version.ContentHash;

  return (
    <div className="relative flex gap-3">
      {/* Timeline line */}
      <div className="flex flex-col items-center shrink-0 w-5">
        <div className={`w-0.5 flex-1 ${isFirst ? "bg-transparent" : "bg-border"}`} />
        <div className={`w-3 h-3 rounded-full border-2 shrink-0 ${
          isCurrent
            ? "border-primary bg-primary"
            : "border-muted-foreground/40 bg-background"
        }`} />
        <div className={`w-0.5 flex-1 ${isLast ? "bg-transparent" : "bg-border"}`} />
      </div>

      {/* Content */}
      <div className="flex-1 pb-4 min-w-0">
        <Collapsible open={expanded} onOpenChange={setExpanded}>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
              v{version.Version}
            </Badge>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${className}`}>
              {label}
            </Badge>
            {isCurrent && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-primary/15 text-primary border-primary/30">
                Current
              </Badge>
            )}
            {hashChanged && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-400 border-amber-500/20 gap-0.5">
                <Hash className="h-2.5 w-2.5" />
                Changed
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(version.CreatedAt).toLocaleString()}
            </span>
            <code className="font-mono text-[10px] truncate max-w-[120px]">
              {version.ContentHash.slice(0, 12)}…
            </code>
          </div>

          <div className="flex items-center gap-1.5 mt-1.5">
            <CollapsibleTrigger className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
              <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-0" : "-rotate-90"}`} />
              {expanded ? "Hide content" : "Show content"}
            </CollapsibleTrigger>
            {!isCurrent && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground gap-1"
                onClick={() => onRollback(version.Id)}
              >
                <RotateCcw className="h-2.5 w-2.5" />
                Rollback
              </Button>
            )}
          </div>

          <CollapsibleContent>
            <pre className="mt-2 text-[11px] font-mono bg-muted/30 rounded p-3 overflow-x-auto max-h-[200px] border border-border/40">
              {formatContent(version.ContentJson)}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}

function formatContent(json: string): string {
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}

/* ------------------------------------------------------------------ */
/*  VersionHistory (main export)                                       */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line max-lines-per-function -- timeline with rollback dialog, splitting would break state cohesion
export function VersionHistory({ assetId, currentHash, currentVersion, onRollback }: VersionHistoryProps) {
  const [versions, setVersions] = useState<AssetVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [rollbackTarget, setRollbackTarget] = useState<number | null>(null);
  const [rolling, setRolling] = useState(false);

  const loadVersions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await sendMessage<{ versions: AssetVersion[] }>({
        type: "LIBRARY_GET_VERSIONS" as never,
        assetId,
      } as never);
      setVersions(res.versions ?? []);
    } catch (err) {
      toast.error("Failed to load history: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => { loadVersions(); }, [loadVersions]);

  const handleRollback = useCallback(async () => {
    if (rollbackTarget === null) return;
    setRolling(true);
    try {
      const result = await sendMessage<{ rolledBackTo: string }>({
        type: "LIBRARY_ROLLBACK_VERSION" as never,
        assetId,
        versionId: rollbackTarget,
      } as never);
      toast.success(`Rolled back to v${result.rolledBackTo}`);
      setRollbackTarget(null);
      loadVersions();
      onRollback();
    } catch (err) {
      toast.error("Rollback failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setRolling(false);
    }
  }, [rollbackTarget, assetId, loadVersions, onRollback]);

  const targetVersion = rollbackTarget !== null
    ? versions.find(v => v.Id === rollbackTarget)
    : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Version History
        </h3>
        <Badge variant="outline" className="text-[10px] px-1 py-0">
          {versions.length}
        </Badge>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6 text-muted-foreground gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-xs">Loading history…</span>
        </div>
      ) : versions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-muted-foreground gap-2">
          <GitCommit className="h-6 w-6 opacity-30" />
          <p className="text-xs">No version history yet.</p>
        </div>
      ) : (
        <ScrollArea className="max-h-[400px]">
          <div className="pr-2">
            {versions.map((v, i) => (
              <VersionRow
                key={v.Id}
                version={v}
                isCurrent={v.ContentHash === currentHash && v.Version === currentVersion}
                isFirst={i === 0}
                isLast={i === versions.length - 1}
                prevHash={i < versions.length - 1 ? versions[i + 1].ContentHash : null}
                onRollback={setRollbackTarget}
              />
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Rollback confirmation */}
      <AlertDialog open={rollbackTarget !== null} onOpenChange={(v) => { if (!v) setRollbackTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rollback to v{targetVersion?.Version}?</AlertDialogTitle>
            <AlertDialogDescription>
              The asset content will be restored to this version. A new version will be created with the rolled-back content.
              The current state is preserved as a "pre-rollback" snapshot.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rolling}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRollback} disabled={rolling}>
              {rolling ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RotateCcw className="h-3.5 w-3.5 mr-1" />}
              Rollback
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
