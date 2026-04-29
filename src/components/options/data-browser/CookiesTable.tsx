/**
 * Cookies viewer — read-only table with search filtering.
 */

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Cookie, Search, X, Download } from "lucide-react";
import { toast } from "sonner";
import type { CookieEntry } from "@/hooks/use-storage-surfaces";

interface CookiesTableProps {
  entries: CookieEntry[];
  loading: boolean;
  onRefresh: () => void;
  searchTerm?: string;
}

// eslint-disable-next-line max-lines-per-function
export function CookiesTable({ entries, loading, onRefresh, searchTerm = "" }: CookiesTableProps) {
  const [localSearch, setLocalSearch] = useState("");
  const spinClass = loading ? "animate-spin" : "";

  const effectiveSearch = searchTerm || localSearch;

  const filtered = useMemo(() => {
    if (!effectiveSearch.trim()) return entries;
    const q = effectiveSearch.toLowerCase();
    return entries.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.value.toLowerCase().includes(q) ||
        e.domain.toLowerCase().includes(q),
    );
  }, [entries, effectiveSearch]);

  const handleExport = () => {
    const data = entries.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      secure: c.secure,
      expirationDate: c.expirationDate,
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cookies-export.json";
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${entries.length} cookies`);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          <Cookie className="inline h-4 w-4 mr-1.5" />
          Cookies
          <Badge variant="secondary" className="ml-2 text-[10px]">{filtered.length} cookies</Badge>
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
              placeholder="Filter name, value, or domain…"
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
          Read-only — cookies are managed by the browser.
        </p>
        <div className="rounded-md border overflow-auto max-h-[420px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[140px]">Name</TableHead>
                <TableHead className="min-w-[160px]">Value</TableHead>
                <TableHead className="w-32">Domain</TableHead>
                <TableHead className="w-20 text-center">Secure</TableHead>
                <TableHead className="w-32">Expires</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length > 0 ? filtered.map((c, i) => (
                <TableRow key={`${c.name}-${c.domain}-${i}`}>
                  <TableCell className="text-xs font-mono break-all">{c.name}</TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground max-w-[200px] truncate">
                    {c.value.length > 60 ? `${c.value.slice(0, 60)}…` : c.value}
                  </TableCell>
                  <TableCell className="text-xs">{c.domain}</TableCell>
                  <TableCell className="text-center">
                    {c.secure ? (
                      <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary">🔒</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs font-mono tabular-nums">
                    {c.expirationDate
                      ? new Date(c.expirationDate * 1000).toLocaleDateString()
                      : "Session"}
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    {loading ? "Loading…" : effectiveSearch ? "No matches" : "No cookies found"}
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
