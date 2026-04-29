/**
 * Hooks for non-SQL storage surfaces: Session Storage, Cookies, chrome.storage.local.
 * Used by the Storage Browser category cards (Spec 55).
 */

import type { JsonValue } from "@/background/handlers/handler-types";
import { useEffect, useState, useCallback } from "react";
import { sendMessage } from "@/lib/message-client";

/* ---- Session Storage ---- */

export interface SessionEntry {
  key: string;
  value: JsonValue;
  valuePreview: string;
  sizeBytes: number;
}

export function useSessionStorage() {
  const [entries, setEntries] = useState<SessionEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await sendMessage<{ entries: SessionEntry[]; total: number }>({
        type: "STORAGE_SESSION_LIST",
      });
      setEntries(result.entries ?? []);
    } catch {
      setEntries([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const totalSize = (entries ?? []).reduce((s, e) => s + e.sizeBytes, 0);

  return { entries, loading, refresh, count: entries.length, totalSize };
}

/* ---- Cookies ---- */

export interface CookieEntry {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  expirationDate?: number;
}

export function useCookies() {
  const [entries, setEntries] = useState<CookieEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await sendMessage<{ entries: CookieEntry[]; total: number }>({
        type: "STORAGE_COOKIES_LIST",
      });
      setEntries(result.entries ?? []);
    } catch {
      setEntries([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const totalSize = (entries ?? []).reduce((s, e) => s + new Blob([`${e.name}=${e.value}`]).size, 0);

  return { entries, loading, refresh, count: entries.length, totalSize };
}

/* ---- chrome.storage.local (IndexedDB/LocalStorage proxy) ---- */

export interface LocalStorageEntry {
  key: string;
  value: JsonValue;
  valuePreview: string;
  sizeBytes: number;
}

export function useLocalStorage() {
  const [entries, setEntries] = useState<LocalStorageEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await sendMessage<{ entries: LocalStorageEntry[] }>({
        type: "GET_DATA_STORE_ALL",
      });
      setEntries(result.entries ?? []);
    } catch {
      setEntries([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const totalSize = (entries ?? []).reduce((s, e) => s + e.sizeBytes, 0);

  return { entries, loading, refresh, count: entries.length, totalSize };
}
