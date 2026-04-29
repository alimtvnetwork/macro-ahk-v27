/**
 * Session Storage viewer — read-only table with search filtering.
 */

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Archive, Search, X, Download } from "lucide-react";
import { toast } from "sonner";
import type { SessionEntry } from "@/hooks/use-storage-surfaces";

interface SessionStorageTableProps {
  entries: SessionEntry[];
  loading: boolean;
  onRefresh: () => void;
  /** External search term from parent */
  searchTerm?: string;
}

// eslint-disable-next-line max-lines-per-function
export function SessionStorageTable({ entries, loading, onRefresh, searchTerm = "" }: SessionStorageTableProps) {
  const [localSearch, setLocalSearch] = useState("");
  const spinClass = loading ? "animate-spin" : "";

  const effectiveSearch = searchTerm || localSearch;

  const filtered = useMemo(() => {
    if (!effectiveSearch.trim()) return entries;
    const q = effectiveSearch.toLowerCase();
    return entries.filter(
      (e) => e.key.toLowerCase().includes(q) || e.valuePreview.toLowerCase().includes(q),
    );
  }, [entries, effectiveSearch]);

  const handleExport = () => {
    const data = Object.fromEntries(entries.map((e) => [e.key, e.valuePreview]));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "session-storage-export.json";
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${entries.length} entries`);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          <Archive className="inline h-4 w-4 mr-1.5" />
          Session Storage
          <Badge variant="secondary" className="ml-2 text-[10px]">{filtered.length} keys</Badge>
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={handleExport} disabled={entries.length === 0} title="Export JSON">
            <Download className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${spinClass}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {!searchTerm && (
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Filter keys or values…"
              className="h-7 text-xs pl-7 pr-7"
            />
            {localSearch && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocalSearch("")}
                className="absolute right-0.5 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Read-only — session storage is transient and resets when the browser closes.
        </p>
        <div className="rounded-md border overflow-auto max-h-[420px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">Key</TableHead>
                <TableHead className="min-w-[260px]">Value</TableHead>
                <TableHead className="w-20 text-right">Size</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length > 0 ? filtered.map((e) => (
                <TableRow key={e.key}>
                  <TableCell className="text-xs font-mono break-all">{e.key}</TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground max-w-[300px] truncate">
                    {e.valuePreview}
                  </TableCell>
                  <TableCell className="text-xs text-right tabular-nums">
                    {formatSize(e.sizeBytes)}
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                    {loading ? "Loading…" : effectiveSearch ? "No matches" : "No session storage entries"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
