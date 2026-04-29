/**
 * ConfigDbTab — ProjectConfig inline editor
 *
 * Thin orchestrator using useConfigDb for state and ConfigSectionList for rendering.
 */

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useConfigDb } from "./useConfigDb";
import { ConfigSectionList } from "./ConfigSectionList";
import { RefreshCw, Loader2, Settings2, Save, RotateCcw } from "lucide-react";

interface ConfigDbTabProps {
  projectSlug: string;
}

export function ConfigDbTab({ projectSlug }: ConfigDbTabProps) {
  const db = useConfigDb(projectSlug);

  return (
    <div className="space-y-3">
      <ConfigToolbar
        rowCount={db.rows.length}
        pendingCount={db.pendingCount}
        loading={db.loading}
        bulkSaving={db.bulkSaving}
        onBulkSave={() => void db.handleBulkSave()}
        onReconstruct={() => void db.handleReconstruct()}
        onRefresh={() => void db.load()}
      />

      {db.loading && db.rows.length === 0 && (
        <div className="flex items-center justify-center py-8 text-muted-foreground text-xs gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading config…
        </div>
      )}

      {!db.loading && db.rows.length === 0 && (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          <Settings2 className="mx-auto h-8 w-8 mb-2 opacity-40" />
          <p>No config rows found.</p>
          <p className="text-xs mt-1">Config is seeded automatically when a script with a config binding is injected.</p>
        </div>
      )}

      <ConfigSectionList
        sections={db.sections}
        edits={db.edits}
        saving={db.saving}
        editKey={db.editKey}
        onEditChange={(ek, val) => db.setEdits((prev) => ({ ...prev, [ek]: val }))}
        onSave={(row) => void db.handleSave(row)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Toolbar                                                            */
/* ------------------------------------------------------------------ */

function ConfigToolbar({
  rowCount, pendingCount, loading, bulkSaving,
  onBulkSave, onReconstruct, onRefresh,
}: {
  rowCount: number;
  pendingCount: number;
  loading: boolean;
  bulkSaving: boolean;
  onBulkSave: () => void;
  onReconstruct: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Settings2 className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold">Config (DB)</span>
        <Badge variant="outline" className="text-[10px]">{rowCount} row{rowCount !== 1 ? "s" : ""}</Badge>
        {pendingCount > 0 && <Badge variant="secondary" className="text-[10px]">{pendingCount} unsaved</Badge>}
      </div>
      <div className="flex gap-1.5">
        {pendingCount > 0 && (
          <Button size="sm" onClick={onBulkSave} disabled={bulkSaving} className="h-7 text-xs gap-1">
            {bulkSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Save All ({pendingCount})
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onReconstruct} disabled={loading} className="h-7 text-xs gap-1" title="Re-seed config from source JSON (overwrites DB)">
          <RotateCcw className="h-3 w-3" /> Re-seed
        </Button>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading} className="h-7 text-xs gap-1">
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Refresh
        </Button>
      </div>
    </div>
  );
}
