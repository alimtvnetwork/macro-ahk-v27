/**
 * Marco Extension — UI Click-Trail Recorder
 *
 * Captures a rolling ring buffer of recent user interactions (clicks,
 * route changes, key presses) so they can be displayed alongside boot
 * failures and other diagnostics. Trail is persisted to sessionStorage
 * so it survives popup re-opens within the same browser session.
 *
 * This is a UI-side trail (popup + options page), distinct from the
 * background-side boot timings.
 */

const STORAGE_KEY = "marco_ui_click_trail";
/** Per-failure frozen snapshots. Keyed by failureId (`failed:<step>|<msgPrefix>`). */
const FROZEN_KEY_PREFIX = "marco_ui_click_trail_frozen:";
const MAX_ENTRIES = 25;
/** Max number of distinct frozen snapshots retained. Older keys are evicted. */
const MAX_FROZEN_SNAPSHOTS = 5;

export interface ClickTrailEntry {
    /** ISO timestamp the event was captured at. */
    at: string;
    /** Event kind — "click", "route", "key", "mount". */
    kind: "click" | "route" | "key" | "mount";
    /** Short, human-readable label. */
    label: string;
    /** Optional CSS-like target descriptor. */
    target?: string;
}

let isAttached = false;

/** Reads the persisted trail from sessionStorage. */
export function readClickTrail(): ClickTrailEntry[] {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (raw === null) return [];
        const parsed = JSON.parse(raw) as ClickTrailEntry[];
        if (Array.isArray(parsed) === false) return [];
        return parsed;
    } catch {
        return [];
    }
}

/** Appends an entry to the trail (ring-buffer trimmed to MAX_ENTRIES). */
export function recordTrail(entry: Omit<ClickTrailEntry, "at">): void {
    try {
        const current = readClickTrail();
        const next: ClickTrailEntry[] = [
            ...current,
            { ...entry, at: new Date().toISOString() },
        ];
        const trimmed = next.length > MAX_ENTRIES
            ? next.slice(next.length - MAX_ENTRIES)
            : next;
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch { // allow-swallow: sessionStorage may be unavailable (private mode/quota)
        // sessionStorage may be unavailable (private mode, quota); silently drop.
    }
}

/** Clears the live trail. Useful after the user reloads the extension. */
export function clearClickTrail(): void {
    try {
        sessionStorage.removeItem(STORAGE_KEY);
    } catch { // allow-swallow: clearing diagnostic trail is best-effort
        // ignore
    }
}

/**
 * Freezes the current live trail under a per-failure key so subsequent popup
 * reopens render the SAME trail that was on screen when boot failed — even
 * though the user keeps clicking around afterwards.
 *
 * Idempotent: returns the existing frozen snapshot when one already exists
 * for `failureId`, ensuring the very first capture wins.
 */
export function freezeClickTrail(failureId: string): ClickTrailEntry[] {
    const key = `${FROZEN_KEY_PREFIX}${failureId}`;
    try {
        const existing = sessionStorage.getItem(key);
        if (existing !== null) {
            const parsed = JSON.parse(existing) as ClickTrailEntry[];
            if (Array.isArray(parsed)) return parsed;
        }
        const live = readClickTrail();
        sessionStorage.setItem(key, JSON.stringify(live));
        evictOldFrozenSnapshots(key);
        return live;
    } catch {
        return readClickTrail();
    }
}

/** Reads a previously frozen snapshot, or returns null if none was captured. */
export function readFrozenClickTrail(failureId: string): ClickTrailEntry[] | null {
    try {
        const raw = sessionStorage.getItem(`${FROZEN_KEY_PREFIX}${failureId}`);
        if (raw === null) return null;
        const parsed = JSON.parse(raw) as ClickTrailEntry[];
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

/** Drops all frozen snapshots — call after the user explicitly reloads the extension. */
export function clearFrozenClickTrails(): void {
    try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < sessionStorage.length; i += 1) {
            const k = sessionStorage.key(i);
            if (k !== null && k.startsWith(FROZEN_KEY_PREFIX)) {
                keysToRemove.push(k);
            }
        }
        keysToRemove.forEach((k) => sessionStorage.removeItem(k));
    } catch { // allow-swallow: clearing frozen trails is best-effort
        // ignore
    }
}

/** Trims frozen snapshot count to MAX_FROZEN_SNAPSHOTS, preserving `keepKey`. */
function evictOldFrozenSnapshots(keepKey: string): void {
    try {
        const frozenKeys: string[] = [];
        for (let i = 0; i < sessionStorage.length; i += 1) {
            const k = sessionStorage.key(i);
            if (k !== null && k.startsWith(FROZEN_KEY_PREFIX)) {
                frozenKeys.push(k);
            }
        }
        if (frozenKeys.length <= MAX_FROZEN_SNAPSHOTS) return;
        const toRemove = frozenKeys
            .filter((k) => k !== keepKey)
            .slice(0, frozenKeys.length - MAX_FROZEN_SNAPSHOTS);
        toRemove.forEach((k) => sessionStorage.removeItem(k));
    } catch { // allow-swallow: snapshot eviction is best-effort
        // ignore
    }
}

/**
 * Attaches global event listeners that record clicks, route changes,
 * and key presses into the trail. Idempotent — safe to call multiple
 * times (e.g., on every popup mount).
 */
export function attachClickTrail(): void {
    if (isAttached) return;
    isAttached = true;

    document.addEventListener("click", handleClick, { capture: true, passive: true });
    document.addEventListener("keydown", handleKeyDown, { capture: true, passive: true });
    window.addEventListener("popstate", handlePopState);

    recordTrail({ kind: "mount", label: `popup mounted @ ${location.pathname}` });
}

function handleClick(event: Event): void {
    const target = event.target;
    if (target instanceof Element === false) return;

    const element = target as Element;
    const button = element.closest("button, a, [role='button']");
    if (button === null) return;

    const label = extractLabel(button);
    const descriptor = describeElement(button);

    recordTrail({ kind: "click", label, target: descriptor });
}

function handleKeyDown(event: Event): void {
    const keyEvent = event as KeyboardEvent;
    const isShortcut = keyEvent.metaKey || keyEvent.ctrlKey || keyEvent.altKey;
    if (isShortcut === false) return;

    const parts: string[] = [];
    if (keyEvent.metaKey) parts.push("Cmd");
    if (keyEvent.ctrlKey) parts.push("Ctrl");
    if (keyEvent.altKey) parts.push("Alt");
    if (keyEvent.shiftKey) parts.push("Shift");
    parts.push(keyEvent.key);

    recordTrail({ kind: "key", label: parts.join("+") });
}

function handlePopState(): void {
    recordTrail({ kind: "route", label: `route → ${location.pathname}` });
}

/** Extracts a clean text label from a clickable element. */
function extractLabel(element: Element): string {
    const aria = element.getAttribute("aria-label");
    if (aria !== null && aria.trim() !== "") return aria.trim();

    const text = element.textContent?.trim() ?? "";
    if (text !== "") {
        return text.length > 60 ? `${text.slice(0, 57)}…` : text;
    }

    const title = element.getAttribute("title");
    if (title !== null && title.trim() !== "") return title.trim();

    return "(unlabeled)";
}

/** Builds a short tag.id.class descriptor for an element. */
function describeElement(element: Element): string {
    const tag = element.tagName.toLowerCase();
    const id = element.id !== "" ? `#${element.id}` : "";
    const classList = Array.from(element.classList).slice(0, 2).join(".");
    const cls = classList !== "" ? `.${classList}` : "";
    return `${tag}${id}${cls}`;
}
