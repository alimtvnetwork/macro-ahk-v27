/**
 * MacroLoop Controller — Rename Preset Store
 *
 * Higher-level API over ProjectKvStore for rename preset CRUD.
 * Section: MacroController.Rename
 *
 * @see spec/21-app/02-features/macro-controller/ts-migration-v2/07-rename-persistence-indexeddb.md
 */

import { getProjectKvStore, type ProjectKvStore } from './project-kv-store';
import { logError, logDebug } from './error-utils';
import { DEFAULT_PRESET_NAME } from './constants';
import { getDisplayProjectName, getProjectIdFromUrl } from './logging';

const FN = 'RenamePresetStore';
const SECTION = 'MacroController.Rename';
const ACTIVE_KEY = '_activePattern';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface RenamePreset {
  name: string;
  template: string;
  prefix: string;
  prefixEnabled: boolean;
  suffix: string;
  suffixEnabled: boolean;
  startDollar: number;
  startHash: number;
  startStar: number;
  delayMs: number;
  createdAt: number;
  updatedAt: number;
}

export interface RenamePresetStore {
  listPresets(): Promise<string[]>;
  getActivePresetName(): Promise<string>;
  setActivePresetName(name: string): Promise<void>;
  loadPreset(name: string): Promise<RenamePreset | null>;
  savePreset(name: string, preset: RenamePreset): Promise<void>;
  deletePreset(name: string): Promise<void>;
}

/* ------------------------------------------------------------------ */
/*  Defaults                                                           */
/* ------------------------------------------------------------------ */

// v2.195.0: Ship a real working default so first-time users see the rename
// engine actually do something. Template `D**v###` → `D01v001`, prefix
// `P$$$$ ` (enabled) → `P0001 ` — together produce names like
// `P0001 D01v001`. User can clone this preset and tweak from there.
export function createDefaultPreset(): RenamePreset {
  const now = Date.now();
  return {
    name: DEFAULT_PRESET_NAME,
    template: 'D**v###',
    prefix: 'P$$$$ ',
    prefixEnabled: true,
    suffix: '',
    suffixEnabled: false,
    startDollar: 1,
    startHash: 1,
    startStar: 1,
    delayMs: 750,
    createdAt: now,
    updatedAt: now,
  };
}

/* ------------------------------------------------------------------ */
/*  Project Resolution                                                 */
/* ------------------------------------------------------------------ */

function resolveProjectKey(): string {
  const projectId = getProjectIdFromUrl();
  return projectId || getDisplayProjectName();
}

function sanitizeProjectName(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '-').substring(0, 64) || 'unknown';
}

/* ------------------------------------------------------------------ */
/*  Factory                                                            */
/* ------------------------------------------------------------------ */

let cachedStore: RenamePresetStore | null = null;
let cachedProjectKey = '';

// eslint-disable-next-line max-lines-per-function -- factory returning store interface with 6 async methods
export function getRenamePresetStore(): RenamePresetStore {
  const rawKey = resolveProjectKey();
  if (cachedStore && cachedProjectKey === rawKey) {
    return cachedStore;
  }

  const projectName = sanitizeProjectName(rawKey);
  const kv: ProjectKvStore = getProjectKvStore(projectName);

  const store: RenamePresetStore = {
    async listPresets(): Promise<string[]> {
      try {
        const items = await kv.list(SECTION);
        const names = items
          .map(function (i) { return i.key; })
          .filter(function (k) { return k !== ACTIVE_KEY; });
        if (names.length === 0) {
          // Seed default
          await kv.set(SECTION, DEFAULT_PRESET_NAME, createDefaultPreset());
          return [DEFAULT_PRESET_NAME];
        }
        return names;
      } catch (err) {
        logError(FN, 'listPresets failed for project "' + projectName + '"', err);
        return [DEFAULT_PRESET_NAME];
      }
    },

    async getActivePresetName(): Promise<string> {
      try {
        const name = await kv.get<string>(SECTION, ACTIVE_KEY);
        return name || DEFAULT_PRESET_NAME;
      } catch (err) {
        logDebug(FN, 'getActivePresetName fallback to Default: ' + String(err));
        return DEFAULT_PRESET_NAME;
      }
    },

    async setActivePresetName(name: string): Promise<void> {
      await kv.set(SECTION, ACTIVE_KEY, name || DEFAULT_PRESET_NAME);
    },

    async loadPreset(name: string): Promise<RenamePreset | null> {
      try {
        const preset = await kv.get<RenamePreset>(SECTION, name);
        if (!preset) { return null; }
        // Validate shape
        if (typeof preset.template !== 'string') {
          logDebug(FN, 'Corrupted preset "' + name + '" — returning default');
          return createDefaultPreset();
        }
        return preset;
      } catch (err) {
        logError(FN, 'loadPreset "' + name + '" failed for project "' + projectName + '"', err);
        return null;
      }
    },

    async savePreset(name: string, preset: RenamePreset): Promise<void> {
      const now = Date.now();
      const record: RenamePreset = {
        ...preset,
        name,
        createdAt: preset.createdAt || now,
        updatedAt: now,
      };
      await kv.set(SECTION, name, record);
    },

    async deletePreset(name: string): Promise<void> {
      if (name === DEFAULT_PRESET_NAME) {
        return;
      }
      await kv.delete(SECTION, name);
      // Reset active if deleted
      const active = await kv.get<string>(SECTION, ACTIVE_KEY);
      if (active === name) {
        await kv.set(SECTION, ACTIVE_KEY, DEFAULT_PRESET_NAME);
      }
      // Ensure Default exists
      const def = await kv.get<RenamePreset>(SECTION, DEFAULT_PRESET_NAME);
      if (!def) {
        await kv.set(SECTION, DEFAULT_PRESET_NAME, createDefaultPreset());
      }
    },
  };

  cachedProjectKey = rawKey;
  cachedStore = store;
  return store;
}
