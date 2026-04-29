/**
 * InjectionDiagnosticsPanel — Shows recent injection pipeline events
 * pulled from the extension's SQLite log database.
 *
 * Queries GET_RECENT_LOGS for INJECTION-category entries and displays
 * skip reasons, guard actions, and errors in a compact collapsible list.
 */

import { useState, useEffect, useCallback } from "react";
import { sendMessage } from "@/lib/message-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronUp,
  RefreshCw,
  AlertTriangle,
  Info,
  XCircle,
  Activity,
} from "lucide-react";

interface LogEntry {
  Timestamp?: string;
  Level?: string;
  Action?: string;
  Detail?: string;
  Category?: string;
  Source?: string;
  ScriptId?: string;
}

const LEVEL_CONFIG: Record<string, { icon: typeof Info; color: string }> = {
  INFO: { icon: Info, color: "text-[hsl(var(--primary))]" },
  WARN: { icon: AlertTriangle, color: "text-[hsl(var(--warning))]" },
  ERROR: { icon: XCircle, color: "text-[hsl(var(--destructive))]" },
};

// eslint-disable-next-line max-lines-per-function -- collapsible panel with event list + badges
export function InjectionDiagnosticsPanel() {
  const [expanded, setExpanded] = useState(false);
  const [events, setEvents] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const result = await sendMessage<{ logs: LogEntry[] }>({
        type: "GET_RECENT_LOGS",
        limit: 200,
      });
      // Filter to INJECTION category client-side
      const injectionLogs = (result?.logs ?? []).filter(
        (l: LogEntry) => l.Category === "INJECTION",
      );
      setEvents(injectionLogs.slice(0, 30));
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (expanded) {
      fetchEvents();
    }
  }, [expanded, fetchEvents]);

  const warnCount = events.filter((e) => e.Level === "WARN").length;
  const errorCount = events.filter((e) => e.Level === "ERROR").length;

  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      {/* Summary row */}
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <Activity className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="text-[11px] font-medium truncate flex-1 text-left">
          Injection Pipeline
        </span>
        {events.length > 0 && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
            {events.length}
          </Badge>
        )}
        {warnCount > 0 && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0 border-[hsl(var(--warning))]/50 text-[hsl(var(--warning))]">
            {warnCount} warn
          </Badge>
        )}
        {errorCount > 0 && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0 border-[hsl(var(--destructive))]/50 text-[hsl(var(--destructive))]">
            {errorCount} err
          </Badge>
        )}
        {expanded ? (
          <ChevronUp className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
      </button>

      {/* Expanded event list */}
      {expanded && (
        <div className="border-t border-border px-3 py-2 space-y-1 bg-muted/10">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] text-muted-foreground uppercase tracking-wider">
              Recent injection events
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0"
              onClick={fetchEvents}
              disabled={loading}
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {events.length === 0 && !loading && (
            <p className="text-[10px] text-muted-foreground py-1">
              No injection events recorded yet.
            </p>
          )}

          {loading && events.length === 0 && (
            <div className="h-8 rounded bg-muted animate-pulse" />
          )}

          <div className="max-h-[200px] overflow-y-auto space-y-0.5">
            {events.map((evt, i) => {
              const level = LEVEL_CONFIG[evt.Level ?? "INFO"] ?? LEVEL_CONFIG.INFO;
              const Icon = level.icon;
              const time = evt.Timestamp
                ? new Date(evt.Timestamp).toLocaleTimeString()
                : "—";

              return (
                <div
                  key={`${evt.Timestamp}-${i}`}
                  className="flex items-start gap-1.5 py-0.5 group"
                >
                  <Icon className={`h-3 w-3 shrink-0 mt-0.5 ${level.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-medium text-foreground truncate">
                        {evt.Action ?? "unknown"}
                      </span>
                      {evt.ScriptId && (
                        <code className="text-[9px] font-mono text-muted-foreground bg-muted px-1 rounded truncate max-w-[100px]">
                          {evt.ScriptId}
                        </code>
                      )}
                      <span className="text-[9px] text-muted-foreground ml-auto shrink-0">
                        {time}
                      </span>
                    </div>
                    {evt.Detail && (
                      <p className="text-[9px] text-muted-foreground leading-snug truncate">
                        {evt.Detail}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
