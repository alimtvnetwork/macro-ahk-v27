/**
 * Marco Extension — Post-Step Wait-For-Selector
 *
 * Per-step "wait for this selector to satisfy a condition before moving
 * to the next step" feature. Lives in the step-library layer because:
 *   - The pure helpers (detect, validate, evaluate, wait) are unit-
 *     testable against a stub document — no chrome.* needed.
 *   - The recorder's leaf executor (background worker) only needs to
 *     load the config for the just-finished StepId and call
 *     `waitForSelector` with a real `document`.
 *
 * Storage shape (`localStorage` key `marco.step-library.wait.v1`):
 *   `{ [stepId: string]: WaitConfig }`
 *
 * Auto-detection rule:
 *   - "/...", "(/...", "(./...", "./..." or anything containing "//"
 *     ⇒ XPath
 *   - everything else ⇒ CSS
 *   The user can pin `Kind` to override the heuristic; loadStepWait()
 *   never re-detects a saved row.
 *
 * Conditions:
 *   - "Appears"     → at least one matching element (default)
 *   - "Disappears"  → zero matching elements
 *   - "Visible"     → at least one match AND it has layout (offset>0)
 *
 * @see ./group-inputs.ts        — sibling localStorage convention.
 * @see .lovable/question-and-ambiguity/07-wait-for-selector.md
 */

const STORAGE_KEY = "marco.step-library.wait.v1";
const DEFAULT_TIMEOUT_MS = 5_000;
const MIN_TIMEOUT_MS = 250;
const MAX_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 100;

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export type SelectorKind = "Css" | "XPath";
export type WaitCondition = "Appears" | "Disappears" | "Visible";

export interface WaitConfig {
    readonly Selector: string;
    readonly Kind: SelectorKind;
    readonly Condition: WaitCondition;
    readonly TimeoutMs: number;
}

export const DEFAULT_WAIT_CONFIG: Readonly<Omit<WaitConfig, "Selector">> = Object.freeze({
    Kind: "Css",
    Condition: "Appears",
    TimeoutMs: DEFAULT_TIMEOUT_MS,
});

/* ------------------------------------------------------------------ */
/*  Auto-detection                                                     */
/* ------------------------------------------------------------------ */

const XPATH_LEADING_RE = /^\s*(?:\(\s*)?\.?\//;

/**
 * Heuristic: returns "XPath" only when the input unambiguously looks
 * like an XPath expression. Everything else is treated as CSS so the
 * common case ("button.primary", "#login", "div > span") works without
 * the user thinking about it.
 */
export function detectSelectorKind(raw: string): SelectorKind {
    const s = raw.trim();
    if (s.length === 0) return "Css";
    if (XPATH_LEADING_RE.test(s)) return "XPath";
    if (s.includes("//")) return "XPath";
    return "Css";
}

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

export type ValidationResult =
    | { readonly Ok: true; readonly Kind: SelectorKind }
    | { readonly Ok: false; readonly Reason: string };

/** Optional document handle so tests can pass a stub. */
export interface ValidationDeps {
    readonly doc?: Document | null;
    /** When true, force-skip the live document check (useful in non-DOM tests). */
    readonly skipLiveCheck?: boolean;
}

/**
 * Validate a selector. When a real `document` is available we ask the
 * browser to compile the expression — this catches issues that regex
 * alone can't see (e.g. unbalanced brackets in XPath, malformed CSS
 * pseudo-class arguments). Without a document we fall back to a
 * structural check.
 */
export function validateSelector(
    raw: string,
    kind: SelectorKind,
    deps: ValidationDeps = {},
): ValidationResult {
    const s = raw.trim();
    if (s.length === 0) {
        return { Ok: false, Reason: "Selector is empty." };
    }

    const doc = deps.doc ?? (typeof document !== "undefined" ? document : null);
    const useLive = doc !== null && deps.skipLiveCheck !== true;

    if (kind === "Css") {
        if (useLive) {
            try {
                doc.querySelector(s);
            } catch (e) {
                const detail = e instanceof Error ? e.message : "Unknown CSS parse error";
                return { Ok: false, Reason: `Invalid CSS selector: ${detail}` };
            }
        } else {
            // Lightweight structural sanity check.
            if (/[<>]{2,}/.test(s)) {
                return { Ok: false, Reason: "Invalid CSS selector (suspicious characters)." };
            }
        }
        return { Ok: true, Kind: "Css" };
    }

    // XPath
    if (!XPATH_LEADING_RE.test(s) && !s.includes("//")) {
        return {
            Ok: false,
            Reason: "XPath should start with '/', './', '(/', '(./' or contain '//'.",
        };
    }
    if (useLive && typeof doc.evaluate === "function") {
        try {
            doc.evaluate(s, doc, null, /* ANY_TYPE */ 0, null);
        } catch (e) {
            const detail = e instanceof Error ? e.message : "Unknown XPath parse error";
            return { Ok: false, Reason: `Invalid XPath: ${detail}` };
        }
    }
    return { Ok: true, Kind: "XPath" };
}

/* ------------------------------------------------------------------ */
/*  Storage                                                            */
/* ------------------------------------------------------------------ */

interface RawStore { readonly [stepId: string]: WaitConfig }

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

function clampTimeout(raw: unknown): number {
    const n = typeof raw === "number" && Number.isFinite(raw) ? raw : DEFAULT_TIMEOUT_MS;
    return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.round(n)));
}

function sanitiseRow(raw: unknown): WaitConfig | null {
    if (!isPlainObject(raw)) return null;
    const sel = typeof raw.Selector === "string" ? raw.Selector.trim() : "";
    if (sel.length === 0) return null;
    const kind: SelectorKind = raw.Kind === "XPath" ? "XPath" : raw.Kind === "Css" ? "Css" : detectSelectorKind(sel);
    const condition: WaitCondition =
        raw.Condition === "Disappears" ? "Disappears"
            : raw.Condition === "Visible" ? "Visible"
                : "Appears";
    return {
        Selector: sel,
        Kind: kind,
        Condition: condition,
        TimeoutMs: clampTimeout(raw.TimeoutMs),
    };
}

function safeReadStore(): RawStore {
    if (typeof localStorage === "undefined") return {};
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === null) return {};
        const parsed: unknown = JSON.parse(raw);
        if (!isPlainObject(parsed)) return {};
        const out: Record<string, WaitConfig> = {};
        for (const [k, v] of Object.entries(parsed)) {
            const sanitised = sanitiseRow(v);
            if (sanitised !== null && /^\d+$/.test(k)) {
                out[k] = sanitised;
            }
        }
        return out;
    } catch {
        return {};
    }
}

function safeWriteStore(store: RawStore): void {
    if (typeof localStorage === "undefined") return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (err) {
        console.warn("step-wait: localStorage write failed", err);
    }
}

export function readAllStepWaits(): ReadonlyMap<number, WaitConfig> {
    const store = safeReadStore();
    const map = new Map<number, WaitConfig>();
    for (const [k, v] of Object.entries(store)) {
        const id = Number(k);
        if (Number.isInteger(id) && id > 0) map.set(id, v);
    }
    return map;
}

export function readStepWait(stepId: number): WaitConfig | null {
    const store = safeReadStore();
    const v = store[String(stepId)];
    return v === undefined ? null : v;
}

export function writeStepWait(stepId: number, config: WaitConfig): WaitConfig {
    if (!Number.isInteger(stepId) || stepId <= 0) {
        throw new Error(
            `writeStepWait: stepId must be a positive integer, got ${String(stepId)}.`,
        );
    }
    const sanitised = sanitiseRow({
        Selector: config.Selector,
        Kind: config.Kind,
        Condition: config.Condition,
        TimeoutMs: config.TimeoutMs,
    });
    if (sanitised === null) {
        throw new Error("writeStepWait: selector is required and must be non-empty.");
    }
    const store = { ...safeReadStore() };
    store[String(stepId)] = sanitised;
    safeWriteStore(store);
    return sanitised;
}

export function clearStepWait(stepId: number): void {
    const store = { ...safeReadStore() };
    if (Object.prototype.hasOwnProperty.call(store, String(stepId))) {
        delete store[String(stepId)];
        safeWriteStore(store);
    }
}

export function clearAllStepWaits(): void {
    safeWriteStore({});
}

/* ------------------------------------------------------------------ */
/*  Live evaluation + wait loop                                        */
/* ------------------------------------------------------------------ */

/** Tiny structural element shape — matches both real DOM and stubs. */
export interface ElementLike {
    readonly offsetWidth?: number;
    readonly offsetHeight?: number;
    readonly getClientRects?: () => { readonly length: number };
}

export interface EvaluateDeps {
    readonly doc?: Document | null;
    readonly root?: ParentNode | null;
}

function evaluateXPath(
    expr: string,
    doc: Document,
    root: ParentNode,
): ReadonlyArray<ElementLike> {
    if (typeof doc.evaluate !== "function") return [];
    const it = doc.evaluate(
        expr,
        root as Node,
        null,
        /* ORDERED_NODE_SNAPSHOT_TYPE */ 7,
        null,
    );
    const out: ElementLike[] = [];
    for (let i = 0; i < it.snapshotLength; i++) {
        const node = it.snapshotItem(i);
        if (node !== null) out.push(node as unknown as ElementLike);
    }
    return out;
}

function evaluateCss(
    expr: string,
    root: ParentNode,
): ReadonlyArray<ElementLike> {
    const list = root.querySelectorAll(expr);
    const out: ElementLike[] = [];
    list.forEach((el) => out.push(el as unknown as ElementLike));
    return out;
}

/** Returns the matching elements for a config in the current document. */
export function evaluateSelector(
    config: Pick<WaitConfig, "Selector" | "Kind">,
    deps: EvaluateDeps = {},
): ReadonlyArray<ElementLike> {
    const doc = deps.doc ?? (typeof document !== "undefined" ? document : null);
    const root = deps.root ?? doc;
    if (doc === null || root === null) return [];
    if (config.Kind === "XPath") return evaluateXPath(config.Selector, doc, root);
    return evaluateCss(config.Selector, root);
}

function isElementVisible(el: ElementLike): boolean {
    if (typeof el.offsetWidth === "number" && typeof el.offsetHeight === "number") {
        if (el.offsetWidth > 0 || el.offsetHeight > 0) return true;
    }
    if (typeof el.getClientRects === "function") {
        const rects = el.getClientRects();
        if (rects.length > 0) return true;
    }
    return false;
}

/** Returns `true` when the predicate for the configured condition holds. */
export function isConditionSatisfied(
    config: Pick<WaitConfig, "Condition">,
    matches: ReadonlyArray<ElementLike>,
): boolean {
    switch (config.Condition) {
        case "Appears":     return matches.length > 0;
        case "Disappears":  return matches.length === 0;
        case "Visible":     return matches.some(isElementVisible);
    }
}

/* -------------------- Wait loop -------------------- */

export interface WaitDeps extends EvaluateDeps {
    /** Override the polling interval (default 100 ms). Useful for tests. */
    readonly pollIntervalMs?: number;
    /** Inject the clock for deterministic tests. */
    readonly now?: () => number;
    /** Inject the sleep primitive for deterministic tests. */
    readonly sleep?: (ms: number) => Promise<void>;
}

export type WaitOutcome =
    | {
        readonly Ok: true;
        readonly DurationMs: number;
        readonly MatchCount: number;
    }
    | {
        readonly Ok: false;
        readonly Reason: "Timeout" | "InvalidSelector";
        readonly DurationMs: number;
        readonly Detail: string;
    };

const defaultSleep = (ms: number): Promise<void> =>
    new Promise<void>((resolve) => { setTimeout(resolve, ms); });

/**
 * Polls until the configured condition is satisfied or the timeout
 * elapses. Always resolves — never throws.
 */
export async function waitForSelector(
    config: WaitConfig,
    deps: WaitDeps = {},
): Promise<WaitOutcome> {
    const now = deps.now ?? (() => Date.now());
    const sleep = deps.sleep ?? defaultSleep;
    const pollMs = Math.max(10, deps.pollIntervalMs ?? POLL_INTERVAL_MS);

    const validation = validateSelector(config.Selector, config.Kind, { doc: deps.doc ?? null });
    if (!validation.Ok) {
        return { Ok: false, Reason: "InvalidSelector", DurationMs: 0, Detail: validation.Reason };
    }

    const startedAt = now();
    let matches: ReadonlyArray<ElementLike> = [];
    while (true) {
        try {
            matches = evaluateSelector(config, deps);
        } catch (e) {
            const detail = e instanceof Error ? e.message : "Unknown evaluation error";
            return {
                Ok: false,
                Reason: "InvalidSelector",
                DurationMs: now() - startedAt,
                Detail: detail,
            };
        }
        if (isConditionSatisfied(config, matches)) {
            return { Ok: true, DurationMs: now() - startedAt, MatchCount: matches.length };
        }
        const elapsed = now() - startedAt;
        if (elapsed >= config.TimeoutMs) {
            return {
                Ok: false,
                Reason: "Timeout",
                DurationMs: elapsed,
                Detail:
                    `Condition "${config.Condition}" not met within ${config.TimeoutMs} ms ` +
                    `(${matches.length} match${matches.length === 1 ? "" : "es"}).`,
            };
        }
        await sleep(Math.min(pollMs, config.TimeoutMs - elapsed));
    }
}
