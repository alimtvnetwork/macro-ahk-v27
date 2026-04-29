/**
 * Marco Extension — Injection Request Resolver
 *
 * Normalizes popup injection requests into executable scripts.
 * Returns both resolved scripts and skipped entries with reasons.
 *
 * @see spec/05-chrome-extension/12-project-model-and-url-rules.md — Project model & URL matching
 * @see .lovable/memory/architecture/script-injection-pipeline-stages.md — Pipeline stages
 */

import type { InjectableScript, SkipReason } from "../../shared/injection-types";
import type { ScriptEntry } from "../../shared/project-types";
import type { ScriptBindingResolved } from "../../shared/types";
import { resolveScriptBindings, type SkippedScript } from "../script-resolver";
import { ensureBuiltinScriptsExist } from "../builtin-script-guard";
import { persistInjectionWarn } from "../injection-diagnostics";
import { readAllProjects } from "./project-helpers";
import { logBgWarnError, BgLogTag } from "../bg-logger";

/** Executable script plus its resolved config and theme JSON payloads. */
export interface PreparedInjectionScript {
    injectable: InjectableScript;
    configJson: string | null;
    themeJson: string | null;
    /** Where the script code came from — for injection diagnostics. */
    codeSource: string | null;
}

/** Full resolution result from the request resolver. */
export interface InjectionResolveResult {
    prepared: PreparedInjectionScript[];
    skipped: SkippedScript[];
}

/** Raw entry shape coming from popup / messaging surface (any of three flavors). */
type RawEntry = ScriptEntry | InjectableScript | Record<string, string | number | boolean | null | undefined>;

/** Classification of a single raw input entry. */
type Classified =
    | { kind: "project-entry"; value: ScriptEntry }
    | { kind: "injectable"; value: InjectableScript }
    | { kind: "empty-code"; id: string; name: string }
    | { kind: "malformed"; id: string; name: string; missing: string };

/** Resolves popup-provided scripts into executable injection inputs. */
// eslint-disable-next-line max-lines-per-function -- resolver with diagnostics logging
export async function resolveInjectionRequestScripts(
    scripts: RawEntry[],
): Promise<InjectionResolveResult> {
    const classified = scripts.map((entry, index) => classifyEntry(entry, index));
    const skipped: SkippedScript[] = [];

    const projectEntries: ScriptEntry[] = [];
    const injectables: InjectableScript[] = [];

    for (const item of classified) {
        if (item.kind === "project-entry") {
            projectEntries.push(item.value);
        } else if (item.kind === "injectable") {
            injectables.push(item.value);
        } else if (item.kind === "empty-code") {
            logBgWarnError(
                BgLogTag.INJECTION_RESOLVE,
                `Script '${item.name}' (id=${item.id}) has empty code — skipping (empty_code).`,
            );
            void persistInjectionWarn(
                "REQUEST_RESOLVER_EMPTY_CODE",
                `[injection:resolve] Inline script '${item.name}' (id=${item.id}) had empty code and was skipped`,
            );
            skipped.push({
                scriptId: item.id,
                scriptName: item.name,
                reason: "empty_code" as SkipReason,
            });
        } else {
            logBgWarnError(
                BgLogTag.INJECTION_RESOLVE,
                `Malformed script entry id=${item.id} name=${item.name} — missing required field(s): ${item.missing}. Skipping (resolver_mismatch).`,
            );
            void persistInjectionWarn(
                "REQUEST_RESOLVER_MISMATCH",
                `[injection:resolve] Malformed entry '${item.name}' (id=${item.id}) missing ${item.missing}, skipped`,
            );
            skipped.push({
                scriptId: item.id,
                scriptName: item.name,
                reason: "resolver_mismatch" as SkipReason,
            });
        }
    }

    const hasOnlyProjectEntries = projectEntries.length > 0 && injectables.length === 0;

    console.log(
        "[injection:resolve] Input: %d scripts → %d project-entries, %d injectables, %d skipped (mode=%s)",
        scripts.length,
        projectEntries.length,
        injectables.length,
        skipped.length,
        hasOnlyProjectEntries ? "project-store" : "passthrough",
    );

    if (hasOnlyProjectEntries) {
        const result = await resolveProjectEntryScripts(projectEntries);
        return {
            prepared: result.prepared,
            skipped: [...skipped, ...result.skipped],
        };
    }

    return {
        prepared: sortPreparedScripts(
            injectables.map((injectable) => ({
                injectable,
                configJson: null,
                themeJson: null,
                codeSource: null,
            })),
        ),
        skipped,
    };
}

/** Resolves stored project script entries through the script store. */
async function resolveProjectEntryScripts(
    entries: ScriptEntry[],
): Promise<InjectionResolveResult> {
    // ✅ Self-heal: reseed missing built-in scripts before resolving
    // Without this, the popup "Run Scripts" path skips the guard that
    // the auto-injector applies, causing "script not found in store".
    // See: spec/22-app-issues/check-button/11-popup-injection-missing-guard.md
    const projects = await readAllProjects();
    await ensureBuiltinScriptsExist(projects);

    const bindings = buildScriptBindings(entries);
    const { resolved, skipped } = await resolveScriptBindings(bindings);

    return {
        prepared: sortPreparedScripts(
            resolved.map(({ injectable, configJson, themeJson, codeSource }) => ({
                injectable,
                configJson,
                themeJson,
                codeSource: codeSource ?? null,
            })),
        ),
        skipped,
    };
}

/** Converts project script entries into background script bindings. */
function buildScriptBindings(entries: ScriptEntry[]): ScriptBindingResolved[] {
    return entries.map((script) => ({
        scriptId: script.path,
        configId: script.configBinding ?? null,
        order: script.order,
        world: "MAIN",
        runAt: script.runAt ?? "document_idle",
    }));
}

/** Classifies a raw entry into one of four buckets — never throws. */
// eslint-disable-next-line sonarjs/cognitive-complexity -- defensive classifier
function classifyEntry(entry: RawEntry, index: number): Classified {
    if (typeof entry !== "object" || entry === null) {
        return {
            kind: "malformed",
            id: `unknown-${index}`,
            name: `script-${index}`,
            missing: "entry is not an object",
        };
    }

    const candidate = entry as Record<string, unknown>;
    const rawId = typeof candidate.id === "string" ? candidate.id : null;
    const rawPath = typeof candidate.path === "string" ? candidate.path : null;
    const rawName = typeof candidate.name === "string" ? candidate.name : null;
    const rawCode = typeof candidate.code === "string" ? candidate.code : null;
    const rawOrder = typeof candidate.order === "number" ? candidate.order : null;

    const displayId = rawId ?? rawPath ?? `unknown-${index}`;
    const displayName = rawName ?? rawPath ?? displayId;

    // Project store entry shape: has `path` + `order`, no inline `code`.
    if (rawPath !== null && rawOrder !== null && !("code" in candidate)) {
        return { kind: "project-entry", value: entry as ScriptEntry };
    }

    // Inline injectable shape: needs id + code + order.
    const missing: string[] = [];
    if (rawId === null) missing.push("id");
    if (!("code" in candidate)) missing.push("code");
    if (rawOrder === null) missing.push("order");

    if (missing.length > 0) {
        return {
            kind: "malformed",
            id: displayId,
            name: displayName,
            missing: missing.join(", "),
        };
    }

    // id, code key, and order are all present — but code might be empty/non-string.
    if (rawCode === null) {
        return {
            kind: "malformed",
            id: displayId,
            name: displayName,
            missing: "code (must be a string)",
        };
    }
    if (rawCode.trim().length === 0) {
        return { kind: "empty-code", id: displayId, name: displayName };
    }

    return { kind: "injectable", value: entry as InjectableScript };
}

/** Sorts prepared scripts by execution order. */
function sortPreparedScripts(
    scripts: PreparedInjectionScript[],
): PreparedInjectionScript[] {
    return [...scripts].sort(
        (a, b) => a.injectable.order - b.injectable.order,
    );
}
