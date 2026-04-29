/**
 * Riseup Macro SDK — Runtime Self-Test
 *
 * Validates that `RiseupAsiaMacroExt.Projects.RiseupMacroSdk` is correctly
 * registered and functional after SDK init. Runs once per page load.
 *
 * Synchronous checks performed:
 *  1. Namespace presence — Projects.RiseupMacroSdk exists
 *  2. .meta — required metadata fields present and version matches
 *  3. .kv.list() — round-trips a Promise without throwing synchronously
 *  4. Shape coverage — all 13 documented sub-namespaces are present
 *
 * Asynchronous round-trips (one PASS / FAIL line per surface):
 *  5. KV    — kv.set('selftest','ok') → kv.get → kv.delete → verify-cleared
 *  6. FILES — files.save → files.list (must include the test file) → files.read
 *             → files.delete → files.list (must NOT include the test file)
 *  7. GKV   — gkv:set → gkv:get → gkv:delete → gkv:get (must be cleared)
 *             Driven directly through the bridge because the SDK self-namespace
 *             does not expose a public grouped-kv surface — but the background
 *             handler is part of the project-scoped storage layer and must be
 *             health-checked on every page load.
 *
 * Each round-trip logs its own PASS / FAIL via NamespaceLogger so a backend
 * failure on one surface never masks success on another.
 *
 * See: spec/22-app-issues/66-sdk-global-object-missing.md
 */

import { NamespaceLogger } from "./logger";
import { sendMessage } from "./bridge";

const FN = "sdkSelfTest";
const FN_KV = "sdkSelfTest:kv-roundtrip";
const FN_FILES = "sdkSelfTest:files-roundtrip";
const FN_GKV = "sdkSelfTest:gkv-roundtrip";
const SDK_CODE_NAME = "RiseupMacroSdk";

const RT_KEY = "selftest";
const RT_VALUE = "ok";

const RT_FILE_PATH = "__selftest__.txt";
const RT_FILE_CONTENT = "ok";
const RT_FILE_MIME = "text/plain";

const RT_GKV_GROUP = "__selftest__";
const RT_GKV_KEY = "selftest";
const RT_GKV_VALUE = "ok";

const REQUIRED_KEYS = [
    "vars", "urls", "xpath", "cookies", "kv", "files",
    "meta", "log", "scripts", "db", "api", "notify", "docs",
] as const;

interface SelfTestResult {
    pass: boolean;
    failures: string[];
    checks: number;
}

interface KvApi {
    list?: () => unknown;
    get?: (key: string) => Promise<unknown>;
    set?: (key: string, value: unknown) => Promise<unknown>;
    delete?: (key: string) => Promise<unknown>;
}

interface FilesApi {
    save?: (path: string, content: string, mime?: string) => Promise<unknown>;
    read?: (path: string) => Promise<unknown>;
    delete?: (path: string) => Promise<unknown>;
    list?: () => Promise<unknown>;
}

export function runSdkSelfTest(expectedVersion: string): SelfTestResult {
    const failures: string[] = [];
    let checks = 0;

    const win = window as unknown as Record<string, unknown>;
    const root = win.RiseupAsiaMacroExt as
        | { Projects?: Record<string, unknown> }
        | undefined;

    /* Check 1 — Root + Projects map */
    checks++;
    if (!root || !root.Projects) {
        failures.push("RiseupAsiaMacroExt.Projects missing");
        return finalize(FN, failures, checks, expectedVersion);
    }

    /* Check 2 — Self-namespace registered */
    checks++;
    const ns = root.Projects[SDK_CODE_NAME] as Record<string, unknown> | undefined;
    if (!ns) {
        failures.push(`Projects.${SDK_CODE_NAME} not registered`);
        return finalize(FN, failures, checks, expectedVersion);
    }

    /* Check 3 — Shape coverage (all 13 sub-namespaces) */
    checks++;
    checkShape(ns, failures);

    /* Check 4 — meta fields + version match */
    checks++;
    checkMeta(ns.meta, expectedVersion, failures);

    /* Check 5 — kv.list() returns a Promise without throwing */
    checks++;
    const kv = ns.kv as KvApi | undefined;
    checkKvListSync(kv, failures);

    const syncResult = finalize(FN, failures, checks, expectedVersion);

    /* Async round-trips — each one logs its own PASS/FAIL line so a backend
       failure on one surface doesn't pretend the others are broken. */
    if (syncResult.pass) {
        if (kv) {
            void runKvRoundTrip(kv);
        }
        const files = ns.files as FilesApi | undefined;
        if (files) {
            void runFilesRoundTrip(files);
        }
        void runGkvRoundTrip();
    }

    return syncResult;
}

function checkShape(ns: Record<string, unknown>, failures: string[]): void {
    const missingKeys = REQUIRED_KEYS.filter((k) => !(k in ns));
    if (missingKeys.length > 0) {
        failures.push(`missing sub-namespaces: ${missingKeys.join(", ")}`);
    }
}

function checkMeta(
    metaUnknown: unknown,
    expectedVersion: string,
    failures: string[],
): void {
    const meta = metaUnknown as
        | { version?: string; codeName?: string; id?: string; name?: string }
        | undefined;
    if (!meta) {
        failures.push(".meta missing");
        return;
    }
    if (meta.version !== expectedVersion) {
        failures.push(`.meta.version ${meta.version} ≠ expected ${expectedVersion}`);
    }
    if (meta.codeName !== SDK_CODE_NAME) {
        failures.push(`.meta.codeName ${meta.codeName} ≠ ${SDK_CODE_NAME}`);
    }
    if (!meta.id || !meta.name) {
        failures.push(".meta.id or .meta.name missing");
    }
}

function checkKvListSync(kv: KvApi | undefined, failures: string[]): void {
    if (!kv || typeof kv.list !== "function") {
        failures.push(".kv.list is not a function");
        return;
    }
    try {
        const result = kv.list();
        if (!result || typeof (result as { then?: unknown }).then !== "function") {
            failures.push(".kv.list() did not return a Promise");
            return;
        }
        /* Swallow rejection — the contract is "returns a Promise without
           throwing synchronously". A rejected promise (e.g. no KV API in
           this context) is not a self-test failure. */
        (result as Promise<unknown>).catch(() => {
            /* expected in environments without backend KV */
        });
    } catch (err) {
        failures.push(`.kv.list() threw synchronously: ${(err as Error).message}`);
    }
}

/* ================================================================== */
/*  KV round-trip — set → get-equals → delete → get-cleared            */
/* ================================================================== */

async function runKvRoundTrip(kv: KvApi): Promise<void> {
    if (!hasFullKvSurface(kv)) {
        NamespaceLogger.error(
            FN_KV,
            "FAIL — kv.set/get/delete missing on RiseupMacroSdk.kv (cannot round-trip)",
        );
        return;
    }

    const failures: string[] = [];
    const checks = 4;

    await tryStep(() => kv.set!(RT_KEY, RT_VALUE), "kv.set", failures);
    await verifyKvGetEquals(kv, RT_VALUE, failures);
    await tryStep(() => kv.delete!(RT_KEY), "kv.delete", failures);
    await verifyKvGetCleared(kv, failures);

    reportRoundTrip(FN_KV, "set/get/delete/verify", failures, checks);
}

function hasFullKvSurface(kv: KvApi): boolean {
    return typeof kv.set === "function"
        && typeof kv.get === "function"
        && typeof kv.delete === "function";
}

async function verifyKvGetEquals(
    kv: KvApi,
    expected: string,
    failures: string[],
): Promise<void> {
    let observed: unknown = undefined;
    try {
        observed = await kv.get!(RT_KEY);
    } catch (err) {
        failures.push(`kv.get threw: ${(err as Error).message}`);
        return;
    }
    if (observed !== expected) {
        failures.push(`kv.get returned ${JSON.stringify(observed)} ≠ ${JSON.stringify(expected)}`);
    }
}

async function verifyKvGetCleared(kv: KvApi, failures: string[]): Promise<void> {
    try {
        const after = await kv.get!(RT_KEY);
        if (after !== null && after !== undefined) {
            failures.push(`kv.get after delete returned ${JSON.stringify(after)} (expected null/undefined)`);
        }
    } catch (err) {
        failures.push(`kv.get-after-delete threw: ${(err as Error).message}`);
    }
}

/* ================================================================== */
/*  FILES round-trip — save → list-includes → read → delete → list-excludes */
/* ================================================================== */

async function runFilesRoundTrip(files: FilesApi): Promise<void> {
    if (!hasFullFilesSurface(files)) {
        NamespaceLogger.error(
            FN_FILES,
            "FAIL — files.save/read/delete/list missing on RiseupMacroSdk.files (cannot round-trip)",
        );
        return;
    }

    const failures: string[] = [];
    const checks = 5;

    await tryStep(
        () => files.save!(RT_FILE_PATH, RT_FILE_CONTENT, RT_FILE_MIME),
        "files.save",
        failures,
    );
    await verifyFilesListIncludes(files, true, "files.list-after-save", failures);
    await verifyFilesReadEquals(files, RT_FILE_CONTENT, failures);
    await tryStep(() => files.delete!(RT_FILE_PATH), "files.delete", failures);
    await verifyFilesListIncludes(files, false, "files.list-after-delete", failures);

    reportRoundTrip(FN_FILES, "save/list/read/delete/verify", failures, checks);
}

function hasFullFilesSurface(files: FilesApi): boolean {
    return typeof files.save === "function"
        && typeof files.read === "function"
        && typeof files.delete === "function"
        && typeof files.list === "function";
}

async function verifyFilesListIncludes(
    files: FilesApi,
    expectPresent: boolean,
    label: string,
    failures: string[],
): Promise<void> {
    let listed: unknown = undefined;
    try {
        listed = await files.list!();
    } catch (err) {
        failures.push(`${label} threw: ${(err as Error).message}`);
        return;
    }
    if (!Array.isArray(listed)) {
        failures.push(`${label} returned non-array: ${JSON.stringify(listed)}`);
        return;
    }
    const found = listed.some((entry) => {
        const e = entry as { filename?: string; path?: string } | null;
        return e !== null && (e.filename === RT_FILE_PATH || e.path === RT_FILE_PATH);
    });
    if (expectPresent && !found) {
        failures.push(`${label} missing test file ${RT_FILE_PATH}`);
    }
    if (!expectPresent && found) {
        failures.push(`${label} still contains test file ${RT_FILE_PATH} after delete`);
    }
}

async function verifyFilesReadEquals(
    files: FilesApi,
    expected: string,
    failures: string[],
): Promise<void> {
    let observed: unknown = undefined;
    try {
        observed = await files.read!(RT_FILE_PATH);
    } catch (err) {
        failures.push(`files.read threw: ${(err as Error).message}`);
        return;
    }
    const content = (observed as { content?: unknown } | null)?.content;
    if (content !== expected) {
        failures.push(`files.read returned content ${JSON.stringify(content)} ≠ ${JSON.stringify(expected)}`);
    }
}

/* ================================================================== */
/*  GKV round-trip — set → get-equals → delete → get-cleared           */
/* ================================================================== */

async function runGkvRoundTrip(): Promise<void> {
    const failures: string[] = [];
    const checks = 4;

    await tryStep(
        () => sendMessage("GKV_SET", { group: RT_GKV_GROUP, key: RT_GKV_KEY, value: RT_GKV_VALUE }),
        "gkv:set",
        failures,
    );
    await verifyGkvGetEquals(RT_GKV_VALUE, failures);
    await tryStep(
        () => sendMessage("GKV_DELETE", { group: RT_GKV_GROUP, key: RT_GKV_KEY }),
        "gkv:delete",
        failures,
    );
    await verifyGkvGetCleared(failures);

    reportRoundTrip(FN_GKV, "set/get/delete/verify", failures, checks);
}

async function verifyGkvGetEquals(expected: string, failures: string[]): Promise<void> {
    let observed: unknown = undefined;
    try {
        observed = await sendMessage("GKV_GET", { group: RT_GKV_GROUP, key: RT_GKV_KEY });
    } catch (err) {
        failures.push(`gkv:get threw: ${(err as Error).message}`);
        return;
    }
    /* Background may return either the raw string or an object envelope —
       accept both shapes so a future refactor doesn't false-fail. */
    const raw = typeof observed === "string"
        ? observed
        : (observed as { value?: unknown } | null)?.value;
    if (raw !== expected) {
        failures.push(`gkv:get returned ${JSON.stringify(observed)} ≠ ${JSON.stringify(expected)}`);
    }
}

async function verifyGkvGetCleared(failures: string[]): Promise<void> {
    try {
        const after = await sendMessage("GKV_GET", { group: RT_GKV_GROUP, key: RT_GKV_KEY });
        const raw = typeof after === "string"
            ? after
            : (after as { value?: unknown } | null)?.value;
        if (raw !== null && raw !== undefined) {
            failures.push(`gkv:get after delete returned ${JSON.stringify(after)} (expected null/undefined)`);
        }
    } catch (err) {
        failures.push(`gkv:get-after-delete threw: ${(err as Error).message}`);
    }
}

/* ================================================================== */
/*  Shared helpers                                                     */
/* ================================================================== */

async function tryStep(
    op: () => Promise<unknown>,
    label: string,
    failures: string[],
): Promise<void> {
    try {
        await op();
    } catch (err) {
        failures.push(`${label} threw: ${(err as Error).message}`);
    }
}

function reportRoundTrip(
    fn: string,
    pattern: string,
    failures: string[],
    checks: number,
): void {
    if (failures.length === 0) {
        NamespaceLogger.info(
            fn,
            `PASS — ${pattern} round-trip OK (${checks} checks)`,
        );
    } else {
        NamespaceLogger.error(
            fn,
            `FAIL — ${failures.length}/${checks} round-trip checks failed: ${failures.join("; ")}`,
        );
    }
    /* Mirror to background so the popup can render the latest result. */
    void sendSelfTestReport(roundTripSurfaceFromFn(fn), failures.length === 0, failures);
}

function roundTripSurfaceFromFn(fn: string): "kv" | "files" | "gkv" {
    if (fn === FN_KV) return "kv";
    if (fn === FN_FILES) return "files";
    return "gkv";
}

function finalize(
    fn: string,
    failures: string[],
    checks: number,
    version: string,
): SelfTestResult {
    const pass = failures.length === 0;
    if (pass) {
        NamespaceLogger.info(
            fn,
            `PASS — Projects.${SDK_CODE_NAME} v${version} (${checks} checks)`,
        );
    } else {
        NamespaceLogger.error(
            fn,
            `FAIL — ${failures.length}/${checks} checks failed: ${failures.join("; ")}`,
        );
    }
    /* Mirror sync result to background — pass version only here so the
       popup can show the SDK build that produced the latest snapshot. */
    void sendSelfTestReport("sync", pass, failures, version);
    return { pass, failures, checks };
}

/* ================================================================== */
/*  Background mirror — fire-and-forget                                */
/* ================================================================== */

/**
 * Push a single self-test row to the background's `SDK_SELFTEST_REPORT`
 * handler so the popup can render a ✅/❌ panel with the last-run timestamp.
 *
 * Failures here are intentionally silent: the in-page NamespaceLogger has
 * already reported PASS/FAIL via console.* and a transport hiccup must not
 * itself look like a self-test failure to the user.
 */
async function sendSelfTestReport(
    surface: "sync" | "kv" | "files" | "gkv",
    pass: boolean,
    failures: string[],
    version?: string,
): Promise<void> {
    try {
        await sendMessage("SDK_SELFTEST_REPORT", {
            surface,
            pass,
            failures,
            version: version ?? "",
        });
    } catch {
        /* swallow — see jsdoc above */
    }
}

