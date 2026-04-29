/**
 * Marco Extension — Floating Controller Panel Toggle Persistence
 *
 * Per-session persistence for the three Expanded-mode sub-panels
 * (Actions / Tree / Hotkey). Keyed by `RecordingSession.SessionId` so
 * each recording remembers the panels the user had open last, and a
 * fresh session starts with the defaults rather than inheriting the
 * previous session's layout.
 *
 * Storage:
 *   - Single `localStorage` key holds a `Record<SessionId, PanelToggles>`
 *     map. Keeping all sessions in one entry keeps writes cheap and avoids
 *     orphaned per-session keys piling up; we trim to the most recent
 *     {@link MAX_SESSIONS} entries on each save.
 *
 * Defaults (used when no entry exists for the current SessionId):
 *   - `Actions = true` — auto-on so the user immediately sees streamed
 *     captures (matches prior behavior).
 *   - `Tree = false`, `Hotkey = false` — opt-in.
 *
 * Pure module — no React imports — so it can be unit-tested directly.
 */

export interface PanelToggles {
    readonly Actions: boolean;
    readonly Tree: boolean;
    readonly Hotkey: boolean;
}

export const DEFAULT_PANEL_TOGGLES: PanelToggles = {
    Actions: true,
    Tree: false,
    Hotkey: false,
};

const STORAGE_KEY = "marco-floating-controller-panels-v1";
const MAX_SESSIONS = 20;

interface StoredShape {
    readonly Sessions: Record<string, PanelToggles>;
    /** Insertion order of SessionIds — used for LRU trimming. */
    readonly Order: ReadonlyArray<string>;
}

function emptyStore(): StoredShape {
    return { Sessions: {}, Order: [] };
}

function isPanelToggles(v: unknown): v is PanelToggles {
    if (v === null || typeof v !== "object") { return false; }
    const r = v as Record<string, unknown>;
    return typeof r.Actions === "boolean"
        && typeof r.Tree === "boolean"
        && typeof r.Hotkey === "boolean";
}

function readStore(): StoredShape {
    if (typeof window === "undefined") { return emptyStore(); }
    let raw: string | null = null;
    try { raw = window.localStorage.getItem(STORAGE_KEY); } catch { return emptyStore(); }
    if (raw === null) { return emptyStore(); }
    try {
        const parsed: unknown = JSON.parse(raw);
        if (parsed === null || typeof parsed !== "object") { return emptyStore(); }
        const shape = parsed as { Sessions?: unknown; Order?: unknown };
        const sessions: Record<string, PanelToggles> = {};
        if (shape.Sessions !== null && typeof shape.Sessions === "object") {
            for (const [k, v] of Object.entries(shape.Sessions as Record<string, unknown>)) {
                if (isPanelToggles(v)) { sessions[k] = v; }
            }
        }
        const order = Array.isArray(shape.Order)
            ? (shape.Order as unknown[]).filter((x): x is string => typeof x === "string" && x in sessions)
            : Object.keys(sessions);
        return { Sessions: sessions, Order: order };
    } catch {
        return emptyStore();
    }
}

function writeStore(store: StoredShape): void {
    if (typeof window === "undefined") { return; }
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch { /* ignore */ }
}

/**
 * Read the persisted toggles for a given session, or {@link DEFAULT_PANEL_TOGGLES}
 * when no entry exists.
 */
export function loadPanelToggles(sessionId: string): PanelToggles {
    if (sessionId === "") { return DEFAULT_PANEL_TOGGLES; }
    const store = readStore();
    return store.Sessions[sessionId] ?? DEFAULT_PANEL_TOGGLES;
}

/**
 * Persist the toggle state for a session. Trims the LRU to {@link MAX_SESSIONS}
 * so the storage entry never grows unbounded across long-running browser
 * profiles.
 */
export function savePanelToggles(sessionId: string, toggles: PanelToggles): void {
    if (sessionId === "") { return; }
    const store = readStore();
    const sessions: Record<string, PanelToggles> = { ...store.Sessions, [sessionId]: toggles };

    // Move the touched session to the end of the order list, then trim oldest.
    const orderWithoutCurrent = store.Order.filter((id) => id !== sessionId);
    const order: string[] = [...orderWithoutCurrent, sessionId];
    while (order.length > MAX_SESSIONS) {
        const evict = order.shift();
        if (evict !== undefined) { delete sessions[evict]; }
    }
    writeStore({ Sessions: sessions, Order: order });
}

/** Test-only helper to reset module state. Safe in production (no-op extras). */
export function __resetPanelTogglesForTests(): void {
    if (typeof window === "undefined") { return; }
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}
