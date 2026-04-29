/**
 * Marco Extension — Manifest-Driven Seeder
 *
 * Reads `seed-manifest.json` from extension dist and seeds scripts + configs
 * into chrome.storage.local. Replaces hardcoded seed chunks.
 *
 * The manifest is generated at build time by `scripts/generate-seed-manifest.mjs`.
 *
 * ── PascalCase storage layer (Phase 2c) ──
 *
 * Reads PascalCase keys from `seed-manifest.json` (the single source of
 * truth for everything we own). The only camelCase that survives is at
 * third-party boundaries — `chrome.storage.local` keys (StoredScript /
 * StoredConfig fields like `filePath`, `loadOrder`) are persistence
 * shapes the runtime hands directly to existing handlers and the
 * options UI; renaming them is its own dedicated migration.
 *
 * Schema versions accepted:
 *   - v2 (PascalCase manifest, current) — the canonical and ONLY shape
 *     this file targets. v1 (legacy camelCase) was retired alongside
 *     the storage-layer cleanup; a v1 manifest in dist/ is now a hard
 *     error so a stale build cannot silently corrupt the seed pass.
 */

import type { StoredScript, StoredConfig } from "../shared/script-config-types";
import type {
    SeedManifest,
    SeedProjectEntry,
    SeedScriptEntry,
    SeedConfigEntry,
} from "../shared/seed-manifest-types";
import { STORAGE_KEY_ALL_SCRIPTS, STORAGE_KEY_ALL_CONFIGS } from "../shared/constants";
import { logBgWarnError, logCaughtError, BgLogTag} from "./bg-logger";

const MANIFEST_PATH = "projects/seed-manifest.json";

const STUB_PREFIX = "// STUB: loaded from seed-manifest. Real code fetched at injection time via filePath.\n";

function buildStubCode(fileName: string): string {
    return STUB_PREFIX + `console.error("[manifest-seeder::buildStubCode] STUB: filePath fetch failed\\n  Path: projects/scripts/${fileName}\\n  Missing: Real script code for \\"${fileName}\\"\\n  Reason: Stub placeholder was never replaced — fetch at injection time did not succeed or was not attempted");`;
}

/**
 * Supported schema versions: v2 (PascalCase) only.
 *
 * v1 (camelCase) was retired alongside the Phase 2c storage-layer cleanup.
 * A v1 manifest in dist/ now fails the seed pass instead of silently
 * remapping — the only safe response is to rebuild with the current
 * `scripts/generate-seed-manifest.mjs`, which emits v2 unconditionally.
 */
const SUPPORTED_SCHEMA_VERSIONS = { min: 2, max: 2 };

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Seeds scripts and configs from seed-manifest.json.
 * Idempotent — upserts missing entries, refreshes stale ones.
 *
 * Returns a summary of what was seeded.
 */
// eslint-disable-next-line max-lines-per-function -- orchestrator with schema validation + per-project logging
export async function seedFromManifest(): Promise<SeedResult> {
    console.log("[manifest-seeder] Fetching seed-manifest.json from extension dist...");
    const manifest = await fetchManifest();
    if (!manifest) {
        logBgWarnError(BgLogTag.MANIFEST_SEEDER, "seed-manifest.json not found or invalid — skipping. " +
            "Ensure the build pipeline runs compile-instruction + generate-seed-manifest.");
        return { scripts: 0, configs: 0, projects: 0, errors: ["seed-manifest.json not found or invalid"] };
    }

    // Schema version validation
    const sv = manifest.SchemaVersion;
    if (typeof sv !== "number" || !Number.isFinite(sv)) {
        logBgWarnError(BgLogTag.MANIFEST_SEEDER, `Invalid schemaVersion: ${sv} — aborting seed`);
        return { scripts: 0, configs: 0, projects: 0, errors: [`Invalid schemaVersion: ${sv}`] };
    }
    if (sv > SUPPORTED_SCHEMA_VERSIONS.max) {
        logBgWarnError(BgLogTag.MANIFEST_SEEDER, `schemaVersion ${sv} is newer than supported max (${SUPPORTED_SCHEMA_VERSIONS.max}) — aborting. Update the extension.`);
        return { scripts: 0, configs: 0, projects: 0, errors: [`Unsupported schemaVersion ${sv} (max supported: ${SUPPORTED_SCHEMA_VERSIONS.max})`] };
    }
    if (sv < SUPPORTED_SCHEMA_VERSIONS.min) {
        // Hard abort: a v1 (camelCase) manifest cannot be remapped now
        // that the legacy aliases were stripped. The only safe fix is to
        // rebuild via `node scripts/generate-seed-manifest.mjs`.
        logBgWarnError(
            BgLogTag.MANIFEST_SEEDER,
            `schemaVersion ${sv} is older than min (${SUPPORTED_SCHEMA_VERSIONS.min}) — aborting. ` +
            `Rebuild seed-manifest.json with the current generator.`,
        );
        return {
            scripts: 0,
            configs: 0,
            projects: 0,
            errors: [
                `Unsupported schemaVersion ${sv} (min supported: ${SUPPORTED_SCHEMA_VERSIONS.min}). ` +
                `Rebuild seed-manifest.json — legacy camelCase manifests are no longer remapped.`,
            ],
        };
    }

    const projectNames = manifest.Projects.map((p) => `${p.name}(${p.scripts.length}s/${p.configs.length}c)`);
    console.log(
        "[manifest-seeder] Processing %d project(s) from seed-manifest.json (schema v%d): [%s]",
        manifest.Projects.length,
        manifest.SchemaVersion,
        projectNames.join(", "),
    );

    // Log seedOnInstall status for each project
    for (const project of manifest.Projects) {
        console.log(
            "[manifest-seeder]   → %s: seedOnInstall=%s, scripts=%d, configs=%d, isGlobal=%s",
            project.Name,
            project.SeedOnInstall,
            project.Scripts.length,
            project.Configs.length,
            project.IsGlobal,
        );
    }

    const scriptResult = await seedScriptsFromManifest(manifest);
    const configResult = await seedConfigsFromManifest(manifest);

    console.log(
        "[manifest-seeder] ✅ Seeded %d script(s), %d config(s) across %d project(s). Errors: %d",
        scriptResult.seeded,
        configResult.seeded,
        manifest.Projects.length,
        scriptResult.errors.length + configResult.errors.length,
    );

    if (scriptResult.errors.length > 0 || configResult.errors.length > 0) {
        logBgWarnError(BgLogTag.MANIFEST_SEEDER, `Seed errors: ${JSON.stringify([...scriptResult.errors, ...configResult.errors])}`);
    }

    return {
        scripts: scriptResult.seeded,
        configs: configResult.seeded,
        projects: manifest.Projects.length,
        errors: [...scriptResult.errors, ...configResult.errors],
    };
}

export interface SeedResult {
    scripts: number;
    configs: number;
    projects: number;
    errors: string[];
}

/* ------------------------------------------------------------------ */
/*  Manifest Fetch                                                     */
/* ------------------------------------------------------------------ */

async function fetchManifest(): Promise<SeedManifest | null> {
    let url: string;
    try {
        url = chrome.runtime.getURL(MANIFEST_PATH);
    } catch (err) {
        logCaughtError(BgLogTag.MANIFEST_SEEDER, `chrome.runtime.getURL() failed for '${MANIFEST_PATH}'`, err);
        return null;
    }
    console.log("[manifest-seeder] Fetching seed-manifest.json — relative: '%s', absolute: %s", MANIFEST_PATH, url);
    try {
        const resp = await fetch(url);
        if (!resp.ok) {
            logBgWarnError(BgLogTag.MANIFEST_SEEDER, `Fetch failed: HTTP ${resp.status} for ${url} — file does not exist in extension dist`);
            return null;
        }
        const raw = await resp.text();
        console.log("[manifest-seeder] Raw response length: %d chars", raw.length);
        const manifest = JSON.parse(raw) as SeedManifest;
        console.log("[manifest-seeder] ✅ Parsed manifest: %d projects, schema v%d, from %s",
            manifest.Projects?.length ?? 0, manifest.SchemaVersion, url);
        return manifest;
    } catch (err) {
        logCaughtError(BgLogTag.MANIFEST_SEEDER, `Fetch/parse error for ${url}`, err);
        return null;
    }
}

/* ------------------------------------------------------------------ */
/*  Script Seeding                                                     */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line max-lines-per-function, sonarjs/cognitive-complexity -- insert/refresh loop with logging
async function seedScriptsFromManifest(
    manifest: SeedManifest,
): Promise<{ seeded: number; errors: string[] }> {
    const result = await chrome.storage.local.get(STORAGE_KEY_ALL_SCRIPTS);
    const stored: StoredScript[] = Array.isArray(result[STORAGE_KEY_ALL_SCRIPTS])
        ? result[STORAGE_KEY_ALL_SCRIPTS]
        : [];

    console.log("[manifest-seeder:scripts] Store has %d existing script(s)", stored.length);

    let changed = false;
    let seeded = 0;
    const errors: string[] = [];

    for (const project of manifest.Projects) {
        if (!project.SeedOnInstall) {
            console.log("[manifest-seeder:scripts] Skipping %s (seedOnInstall=false)", project.Name);
            continue;
        }

        for (const scriptDef of project.Scripts) {
            try {
                const idx = stored.findIndex((s) => s.id === scriptDef.SeedId);

                if (idx === -1) {
                    // Insert new
                    console.log("[manifest-seeder:scripts] + INSERT %s (seedId=%s, filePath=%s)",
                        scriptDef.File, scriptDef.SeedId, scriptDef.FilePath);
                    stored.push(buildStoredScript(scriptDef, project, manifest));
                    changed = true;
                    seeded++;
                } else {
                    // Refresh if stale
                    const current = stored[idx];
                    if (isScriptStale(current, scriptDef, project, manifest)) {
                        console.log("[manifest-seeder:scripts] ↻ REFRESH %s (seedId=%s, was stale)",
                            scriptDef.File, scriptDef.SeedId);
                        stored[idx] = refreshStoredScript(current, scriptDef, project, manifest);
                        changed = true;
                        seeded++;
                    } else {
                        console.log("[manifest-seeder:scripts] = SKIP %s (seedId=%s, up-to-date)",
                            scriptDef.File, scriptDef.SeedId);
                    }
                }
            } catch (err) {
                const msg = `[seedScriptsFromManifest] Failed to seed script ${scriptDef.File} for ${project.Name}: ${err}`;
                errors.push(msg);
                logBgWarnError(BgLogTag.MANIFEST_SEEDER, msg);
            }
        }
    }

    if (changed) {
        await chrome.storage.local.set({ [STORAGE_KEY_ALL_SCRIPTS]: stored });
    }

    return { seeded, errors };
}

function buildStoredScript(def: SeedScriptEntry, project: SeedProjectEntry, manifest: SeedManifest): StoredScript {
    const now = new Date().toISOString();
    return {
        id: def.SeedId,
        name: def.File,
        description: def.Description || project.Description,
        code: buildStubCode(def.File),
        filePath: def.FilePath,
        isAbsolute: false,
        order: def.Order,
        isEnabled: true,
        isIife: def.IsIife,
        autoInject: def.AutoInject,
        isGlobal: project.IsGlobal,
        dependencies: resolveDependencyIds(manifest, project),
        loadOrder: project.LoadOrder,
        runAt: def.RunAt,
        configBinding: resolveConfigSeedId(def.ConfigBinding, project),
        themeBinding: resolveConfigSeedId(def.ThemeBinding, project),
        cookieBinding: def.CookieBinding,
        createdAt: now,
        updatedAt: now,
    };
}

function refreshStoredScript(
    current: StoredScript,
    def: SeedScriptEntry,
    project: SeedProjectEntry,
    manifest: SeedManifest,
): StoredScript {
    return {
        ...current,
        name: def.File,
        description: def.Description || project.Description,
        code: buildStubCode(def.File),
        filePath: def.FilePath,
        isAbsolute: false,
        isIife: def.IsIife,
        autoInject: def.AutoInject,
        isGlobal: project.IsGlobal,
        isEnabled: current.isEnabled, // preserve user toggle
        dependencies: resolveDependencyIds(manifest, project),
        loadOrder: project.LoadOrder,
        configBinding: resolveConfigSeedId(def.ConfigBinding, project),
        themeBinding: resolveConfigSeedId(def.ThemeBinding, project),
        cookieBinding: def.CookieBinding,
        updatedAt: new Date().toISOString(),
    };
}

function isScriptStale(
    current: StoredScript,
    def: SeedScriptEntry,
    project: SeedProjectEntry,
    manifest: SeedManifest,
): boolean {
    return (
        current.filePath !== def.FilePath ||
        !current.code.startsWith(STUB_PREFIX) ||
        current.isGlobal !== project.IsGlobal ||
        current.loadOrder !== project.LoadOrder ||
        current.isIife !== def.IsIife ||
        current.autoInject !== def.AutoInject ||
        current.name !== def.File ||
        current.cookieBinding !== def.CookieBinding ||
        current.configBinding !== resolveConfigSeedId(def.ConfigBinding, project) ||
        current.themeBinding !== resolveConfigSeedId(def.ThemeBinding, project) ||
        JSON.stringify(current.dependencies ?? []) !== JSON.stringify(resolveDependencyIds(manifest, project))
    );
}

/* ------------------------------------------------------------------ */
/*  Config Seeding                                                     */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line max-lines-per-function, sonarjs/cognitive-complexity -- config fetch+upsert loop
async function seedConfigsFromManifest(
    manifest: SeedManifest,
): Promise<{ seeded: number; errors: string[] }> {
    const result = await chrome.storage.local.get(STORAGE_KEY_ALL_CONFIGS);
    const stored: StoredConfig[] = Array.isArray(result[STORAGE_KEY_ALL_CONFIGS])
        ? result[STORAGE_KEY_ALL_CONFIGS]
        : [];

    let changed = false;
    let seeded = 0;
    const errors: string[] = [];

    for (const project of manifest.Projects) {
        if (!project.SeedOnInstall) continue;

        for (const configDef of project.Configs) {
            try {
                // Fetch the actual JSON content from extension dist
                const configJson = await fetchConfigJson(configDef.FilePath);

                const idx = stored.findIndex((c) => c.id === configDef.SeedId);

                if (idx === -1) {
                    stored.push(buildStoredConfig(configDef, configJson));
                    changed = true;
                    seeded++;
                } else {
                    const current = stored[idx];
                    if (current.name !== configDef.File || current.json !== configJson) {
                        stored[idx] = {
                            ...current,
                            name: configDef.File,
                            json: configJson,
                            updatedAt: new Date().toISOString(),
                        };
                        changed = true;
                        seeded++;
                    }
                }
            } catch (err) {
                const msg = `[seedConfigsFromManifest→fetchConfigJson] Failed to seed config ${configDef.File} for ${project.Name}: ${err}`;
                errors.push(msg);
                // Use warn instead of error — config fetch failures are non-fatal
                // (hardcoded defaults are used) and should not inflate the error table
                logBgWarnError(BgLogTag.MANIFEST_SEEDER, msg);
            }
        }
    }

    if (changed) {
        await chrome.storage.local.set({ [STORAGE_KEY_ALL_CONFIGS]: stored });
    }

    return { seeded, errors };
}

function buildStoredConfig(def: SeedConfigEntry, json: string): StoredConfig {
    const now = new Date().toISOString();
    return {
        id: def.SeedId,
        name: def.File,
        description: def.Description,
        json,
        createdAt: now,
        updatedAt: now,
    };
}

async function fetchConfigJson(filePath: string): Promise<string> {
    const url = chrome.runtime.getURL(filePath);
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 500;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const resp = await fetch(url);
            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            }
            const data = await resp.json();
            return JSON.stringify(data, null, 2);
        } catch (err) {
            const isLastAttempt = attempt === MAX_RETRIES;
            if (isLastAttempt) {
                throw new Error(`Failed to fetch ${filePath} after ${MAX_RETRIES} attempts: ${err}`);
            }
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
        }
    }

    throw new Error(`Failed to fetch ${filePath}: unreachable`);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Resolves a config key (e.g., "config") to its seedId within the project.
 */
function resolveConfigSeedId(
    key: string | undefined,
    project: SeedProjectEntry,
): string | undefined {
    if (!key) return undefined;
    const config = project.Configs.find((c) => c.key === key);
    return config?.seedId;
}

/**
 * Resolves project dependency names to their script seedIds.
 * Convention: dependency project "xpath" → seedId "default-xpath-utils" (from manifest).
 * Falls back to looking up the manifest entry for the dependency name.
 */
function resolveDependencyIds(manifest: SeedManifest, project: SeedProjectEntry): string[] {
    const resolved = new Set<string>();

    for (const dependencyName of project.Dependencies) {
        const dependencyProject = manifest.Projects.find((entry) => entry.name === dependencyName);

        if (!dependencyProject || dependencyProject.scripts.length === 0) {
            resolved.add(dependencyName);
            continue;
        }

        for (const dependencyScript of dependencyProject.scripts) {
            resolved.add(dependencyScript.seedId);
        }
    }

    return [...resolved];
}
