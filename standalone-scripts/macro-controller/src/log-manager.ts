/**
 * MacroLoop Controller — LogManager
 *
 * Configurable logging system with:
 * - Per-level enable/disable (debug, info, warn, error, success, delegate, check, skip, sub)
 * - Global enable/disable toggle
 * - Console output toggle
 * - Persistence toggle
 * - Activity log UI toggle
 * - Settings persisted to localStorage
 *
 * All log calls flow through LogManager.shouldLog() before executing.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type LogLevel =
  | 'debug' | 'info' | 'warn' | 'error'
  | 'success' | 'delegate' | 'check' | 'skip' | 'sub'
  | 'INFO' | 'ERROR' | 'WARN' | 'DEBUG' | 'SUB';

export interface LogManagerConfig {
  [key: string]: boolean | Record<string, boolean>;
  /** Master switch — disables all logging when false */
  enabled: boolean;
  /** Write to browser console */
  consoleOutput: boolean;
  /** Persist logs to localStorage */
  persistLogs: boolean;
  /** Show entries in the activity log UI panel */
  activityLogUi: boolean;
  /** Per-level toggles (normalized to lowercase) */
  levels: Record<string, boolean>;
}

import { StorageKey } from './types';
const STORAGE_KEY = StorageKey.LogManagerConfig;

const DEFAULT_CONFIG: LogManagerConfig = {
  enabled: true,
  consoleOutput: true,
  persistLogs: true,
  activityLogUi: true,
  levels: {
    debug: true,
    info: true,
    warn: true,
    error: true,
    success: true,
    delegate: true,
    check: true,
    skip: true,
    sub: true,
  },
};

/* ------------------------------------------------------------------ */
/*  Singleton State (CQ11)                                             */
/* ------------------------------------------------------------------ */

class LogConfigState {
  private _config: LogManagerConfig = { ...DEFAULT_CONFIG, levels: { ...DEFAULT_CONFIG.levels } };

  get config(): LogManagerConfig {
    return this._config;
  }

  set config(v: LogManagerConfig) {
    this._config = v;
  }

  merge(partial: Partial<LogManagerConfig>): void {
    if (partial.enabled !== undefined) { this._config.enabled = partial.enabled; }
    if (partial.consoleOutput !== undefined) { this._config.consoleOutput = partial.consoleOutput; }
    if (partial.persistLogs !== undefined) { this._config.persistLogs = partial.persistLogs; }
    if (partial.activityLogUi !== undefined) { this._config.activityLogUi = partial.activityLogUi; }
    if (partial.levels) {
      for (const key of Object.keys(partial.levels)) {
        this._config.levels[key.toLowerCase()] = partial.levels[key];
      }
    }
  }

  reset(): void {
    this._config = { ...DEFAULT_CONFIG, levels: { ...DEFAULT_CONFIG.levels } };
  }
}

const logConfigState = new LogConfigState();

/** Load persisted config from localStorage on init */
function loadConfig(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LogManagerConfig>;
      logConfigState.config = {
        enabled: parsed.enabled ?? DEFAULT_CONFIG.enabled,
        consoleOutput: parsed.consoleOutput ?? DEFAULT_CONFIG.consoleOutput,
        persistLogs: parsed.persistLogs ?? DEFAULT_CONFIG.persistLogs,
        activityLogUi: parsed.activityLogUi ?? DEFAULT_CONFIG.activityLogUi,
        levels: { ...DEFAULT_CONFIG.levels, ...(parsed.levels || {}) },
      };
    }
  } catch (_e) { console.warn('[MacroLoop] Failed to parse log config — using defaults:', _e instanceof Error ? _e.message : String(_e)); }
}

/** Persist current config to localStorage */
function saveConfig(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logConfigState.config));
  } catch (_e) { console.warn('[MacroLoop] Failed to save log config:', _e instanceof Error ? _e.message : String(_e)); }
}

// Auto-load on module init
loadConfig();

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/** Check if a log at the given level should be emitted */
export function shouldLog(level?: string): boolean {
  const cfg = logConfigState.config;
  if (!cfg.enabled) { return false; }
  if (!level) { return true; }
  const normalized = level.toLowerCase();
  if (cfg.levels[normalized] === undefined) { return true; }

  return cfg.levels[normalized];
}

/** Check if console output is enabled */
export function shouldConsole(): boolean {
  const cfg = logConfigState.config;

  return cfg.enabled && cfg.consoleOutput;
}

/** Check if log persistence is enabled */
export function shouldPersist(): boolean {
  const cfg = logConfigState.config;

  return cfg.enabled && cfg.persistLogs;
}

/** Check if activity log UI should receive entries */
export function shouldActivityUi(): boolean {
  const cfg = logConfigState.config;

  return cfg.enabled && cfg.activityLogUi;
}

/** Get a read-only copy of current config */
export function getLogConfig(): LogManagerConfig {
  const cfg = logConfigState.config;

  return { ...cfg, levels: { ...cfg.levels } };
}

/** Update config (partial merge) and persist */
export function updateLogConfig(partial: Partial<LogManagerConfig>): void {
  logConfigState.merge(partial);
  saveConfig();
}

/** Toggle a specific log level */
export function toggleLevel(level: string, enabled: boolean): void {
  logConfigState.config.levels[level.toLowerCase()] = enabled;
  saveConfig();
}

/** Toggle the master switch */
export function toggleLogging(enabled: boolean): void {
  logConfigState.config.enabled = enabled;
  saveConfig();
}

/** Reset to defaults */
export function resetLogConfig(): void {
  logConfigState.reset();
  saveConfig();
}
