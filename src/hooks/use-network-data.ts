import { useEffect, useState, useCallback } from "react";
import { sendMessage } from "@/lib/message-client";
import { useVisibilityPausedInterval } from "@/hooks/use-visibility-paused-interval";

export interface NetworkEntry {
  method: string;
  url: string;
  status: number;
  statusText: string;
  durationMs: number;
  requestType: "xhr" | "fetch";
  timestamp: string;
  initiator: string;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  responsePreview?: string;
}

export interface NetworkStats {
  totalCaptured: number;
  byType: { xhr: number; fetch: number };
  byStatus: Record<string, number>;
  averageDurationMs: number;
}

const AUTO_REFRESH_INTERVAL = 5000;

export function useNetworkData() {
  const [requests, setRequests] = useState<NetworkEntry[]>([]);
  const [stats, setStats] = useState<NetworkStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [reqRes, statsRes] = await Promise.all([
      sendMessage<{ requests: NetworkEntry[] }>({ type: "GET_NETWORK_REQUESTS" }),
      sendMessage<NetworkStats>({ type: "GET_NETWORK_STATS" }),
    ]);
    setRequests(reqRes.requests);
    setStats(statsRes);
    setLoading(false);
  }, []);

  const clear = useCallback(async () => {
    await sendMessage({ type: "CLEAR_NETWORK_REQUESTS" });
    setRequests([]);
    setStats({ totalCaptured: 0, byType: { xhr: 0, fetch: 0 }, byStatus: {}, averageDurationMs: 0 });
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // Auto-refresh polling — visibility-paused (PERF-11). The hook fires an
  // immediate tick on mount + every visibilitychange→visible, so we no
  // longer need the standalone `useEffect` initial-fetch above to also
  // double as a poll seed.
  useVisibilityPausedInterval(
    () => { void refresh(); },
    AUTO_REFRESH_INTERVAL,
    autoRefresh,
  );

  const toggleAutoRefresh = useCallback(() => {
    setAutoRefresh((prev) => !prev);
  }, []);

  return { requests, stats, loading, refresh, clear, autoRefresh, toggleAutoRefresh };
}
