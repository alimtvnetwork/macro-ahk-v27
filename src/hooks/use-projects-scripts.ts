import { useEffect, useState, useCallback } from "react";
import { sendMessage } from "@/lib/message-client";

interface CookieRule {
  id: string;
  name: string;
  domain: string;
  matchStrategy: "exact" | "prefix" | "contains" | "regex";
  bindTo: string;
}

/** Canonical cookie binding — matches StoredProject.cookies[] in shared/project-types.ts */
interface CookieBinding {
  cookieName: string;
  url: string;
  role: "session" | "refresh" | "custom";
  description?: string;
}

interface StoredProject {
  id: string;
  schemaVersion: number;
  name: string;
  slug?: string;
  version: string;
  description?: string;
  targetUrls: Array<{ pattern: string; matchType: string }>;
  scripts: Array<{ path: string; order: number; runAt?: string; configBinding?: string; code?: string }>;
  configs?: Array<{ path: string; description?: string }>;
  cookies?: CookieBinding[];
  /** @deprecated Use cookies[] instead */
  cookieRules?: CookieRule[];
  settings?: { isolateScripts?: boolean; logLevel?: string; retryOnNavigate?: boolean; chatBoxXPath?: string; variables?: string; [key: string]: string | number | boolean | undefined };
  dependencies?: Array<{ projectId: string; version: string }>;
  isGlobal?: boolean;
  isRemovable?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface StoredScript {
  id: string;
  name: string;
  description?: string;
  code: string;
  order: number;
  runAt?: string;
  configBinding?: string;
  isIife?: boolean;
  hasDomUsage?: boolean;
  updateUrl?: string;
  lastUpdateCheck?: string;
  createdAt: string;
  updatedAt: string;
}

interface StoredConfig {
  id: string;
  name: string;
  description?: string;
  json: string;
  createdAt: string;
  updatedAt: string;
}

export type { StoredProject, StoredScript, StoredConfig, CookieRule, CookieBinding };

/** Shared bootstrap cache — fetched once, consumed by all three hooks. */
let bootstrapPromise: Promise<{
  projects: StoredProject[];
  scripts: StoredScript[];
  configs: StoredConfig[];
}> | null = null;

function getBootstrapData() {
  if (!bootstrapPromise) {
    bootstrapPromise = sendMessage<{
      projects: StoredProject[];
      scripts: StoredScript[];
      configs: StoredConfig[];
    }>({ type: "GET_OPTIONS_BOOTSTRAP" });
  }
  return bootstrapPromise;
}

export function useProjects() {
  const [projects, setProjects] = useState<StoredProject[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await sendMessage<{ projects: StoredProject[] }>({
      type: "GET_ALL_PROJECTS",
    });
    setProjects(result.projects);
    setLoading(false);
  }, []);

  const save = useCallback(async (project: Partial<StoredProject>) => {
    await sendMessage({ type: "SAVE_PROJECT", project });
    await refresh();
  }, [refresh]);

  const remove = useCallback(async (projectId: string) => {
    await sendMessage({ type: "DELETE_PROJECT", projectId });
    await refresh();
  }, [refresh]);

  useEffect(() => {
    getBootstrapData().then((data) => {
      setProjects(data.projects);
      setLoading(false);
    });
  }, []);

  return { projects, loading, refresh, save, remove };
}

export function useScripts() {
  const [scripts, setScripts] = useState<StoredScript[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasFetched, setHasFetched] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await sendMessage<{ scripts: StoredScript[] }>({
      type: "GET_ALL_SCRIPTS",
    });
    setScripts(result.scripts);
    setHasFetched(true);
    setLoading(false);
  }, []);

  const save = useCallback(async (script: Partial<StoredScript>) => {
    await sendMessage({ type: "SAVE_SCRIPT", script });
    await refresh();
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    await sendMessage({ type: "DELETE_SCRIPT", id });
    await refresh();
  }, [refresh]);

  const ensureLoaded = useCallback(async () => {
    if (!hasFetched) await refresh();
  }, [hasFetched, refresh]);

  useEffect(() => {
    getBootstrapData().then((data) => {
      setScripts(data.scripts);
      setHasFetched(true);
      setLoading(false);
    });
  }, []);

  return { scripts, loading, refresh, save, remove, ensureLoaded };
}

export function useConfigs() {
  const [configs, setConfigs] = useState<StoredConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasFetched, setHasFetched] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await sendMessage<{ configs: StoredConfig[] }>({
      type: "GET_ALL_CONFIGS",
    });
    setConfigs(result.configs);
    setHasFetched(true);
    setLoading(false);
  }, []);

  const save = useCallback(async (config: Partial<StoredConfig>) => {
    await sendMessage({ type: "SAVE_CONFIG", config });
    await refresh();
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    await sendMessage({ type: "DELETE_CONFIG", id });
    await refresh();
  }, [refresh]);

  const ensureLoaded = useCallback(async () => {
    if (!hasFetched) await refresh();
  }, [hasFetched, refresh]);

  useEffect(() => {
    getBootstrapData().then((data) => {
      setConfigs(data.configs);
      setHasFetched(true);
      setLoading(false);
    });
  }, []);

  return { configs, loading, refresh, save, remove, ensureLoaded };
}
