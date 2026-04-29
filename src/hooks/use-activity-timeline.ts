/**
 * React hook for Activity Log Timeline.
 * Fetches both logs and errors, merges them chronologically,
 * and provides filtering by level, source, and text search.
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import { sendMessage } from "@/lib/message-client";
import { isBenignWarning } from "@/lib/benign-warnings";

export interface TimelineEntry {
  id: string;
  timestamp: string;
  level: string;
  source: string;
  category: string;
  message: string;
  detail?: string;
  stack?: string;
  kind: "log" | "error";
}

export type SeverityFilter = "all" | "info" | "warn" | "error";
export type SourceFilter = "all" | "background" | "content" | "user-script" | "macro";

interface RawLog {
  id: number;
  timestamp: string;
  level: string;
  source: string;
  category: string;
  action?: string;
  detail?: string;
  message?: string;
}

interface RawError {
  id: number;
  timestamp: string;
  level: string;
  source: string;
  category: string;
  message: string;
  StackTrace?: string;
  ErrorCode?: string;
}

function normalizeLevel(level: string): string {
  const lower = (level ?? "info").toLowerCase();
  if (lower === "warning") return "warn";
  if (lower === "fatal") return "error";
  return lower;
}


// eslint-disable-next-line max-lines-per-function
export function useActivityTimeline(limit = 500) {
  const [logs, setLogs] = useState<TimelineEntry[]>([]);
  const [errors, setErrors] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [search, setSearch] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [logResult, errorResult] = await Promise.all([
        sendMessage<{ logs: RawLog[] }>({ type: "GET_RECENT_LOGS", limit }),
        sendMessage<{ errors: RawError[] }>({ type: "GET_ACTIVE_ERRORS" }),
      ]);

      const mappedLogs: TimelineEntry[] = (logResult.logs ?? []).map((l) => ({
        id: `log-${l.id}`,
        timestamp: l.timestamp,
        level: normalizeLevel(l.level),
        source: l.source ?? "unknown",
        category: l.category ?? "GENERAL",
        message: l.message ?? l.detail ?? l.action ?? "—",
        detail: l.detail,
        kind: "log" as const,
      }));

      const mappedErrors: TimelineEntry[] = (errorResult.errors ?? []).map((e) => ({
        id: `err-${e.id}`,
        timestamp: e.timestamp,
        level: normalizeLevel(e.level),
        source: e.source ?? "unknown",
        category: e.category ?? "ERROR",
        message: e.message,
        stack: e.StackTrace,
        detail: e.ErrorCode,
        kind: "error" as const,
      }));

      // Drop benign-warning noise BEFORE merging so it cannot inflate
      // counts, badges, or the drawer list. See BENIGN_WARNING_PATTERNS.
      setLogs(mappedLogs.filter((e) => !isBenignWarning(e)));
      setErrors(mappedErrors.filter((e) => !isBenignWarning(e)));
    } catch {
      // Preview mode — use empty arrays
      setLogs([]);
      setErrors([]);
    }
    setLoading(false);
  }, [limit]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const merged = useMemo(() => {
    const all = [...logs, ...errors];
    all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return all;
  }, [logs, errors]);

  const filtered = useMemo(() => {
    let result = merged;

    if (severityFilter !== "all") {
      result = result.filter((e) => {
        const lvl = e.level;
        if (severityFilter === "info") return lvl === "info" || lvl === "log" || lvl === "debug";
        if (severityFilter === "warn") return lvl === "warn";
        if (severityFilter === "error") return lvl === "error";
        return true;
      });
    }

    if (sourceFilter !== "all") {
      result = result.filter((e) => e.source.toLowerCase().includes(sourceFilter));
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) =>
          e.message.toLowerCase().includes(q) ||
          (e.detail ?? "").toLowerCase().includes(q) ||
          e.source.toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q),
      );
    }

    return result;
  }, [merged, severityFilter, sourceFilter, search]);

  const stats = useMemo(() => {
    let infoCount = 0;
    let warnCount = 0;
    let errorCount = 0;
    for (const e of merged) {
      const lvl = e.level;
      if (lvl === "error") errorCount++;
      else if (lvl === "warn") warnCount++;
      else infoCount++;
    }
    return { total: merged.length, info: infoCount, warn: warnCount, error: errorCount };
  }, [merged]);

  return {
    entries: filtered,
    stats,
    loading,
    severityFilter,
    setSeverityFilter,
    sourceFilter,
    setSourceFilter,
    search,
    setSearch,
    refresh,
  };
}
