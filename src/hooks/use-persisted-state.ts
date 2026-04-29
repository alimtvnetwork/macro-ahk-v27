import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Minimal localStorage-backed `useState`.
 *
 * - Reads the initial value lazily on mount (so SSR / non-browser
 *   environments don't crash).
 * - Writes are best-effort; quota / private-mode errors are logged
 *   once and then silently swallowed so a broken storage layer can
 *   never break the UI.
 * - The `decode` callback validates the parsed JSON before it is
 *   accepted. Returning `undefined` means "value invalid, fall back
 *   to the initial value."
 */
export function usePersistedState<T>(
    key: string,
    initial: T,
    decode: (raw: unknown) => T | undefined,
): readonly [T, (next: T | ((prev: T) => T)) => void] {
    const [value, setValue] = useState<T>(() => readPersisted(key, initial, decode));
    const warned = useRef(false);

    useEffect(() => {
        try {
            window.localStorage.setItem(key, JSON.stringify(value));
        } catch (err) {
            if (!warned.current) {
                warned.current = true;
                console.warn(`[usePersistedState] failed to write "${key}":`, err);
            }
        }
    }, [key, value]);

    const set = useCallback((next: T | ((prev: T) => T)) => {
        setValue(next);
    }, []);

    return [value, set] as const;
}

function readPersisted<T>(key: string, initial: T, decode: (raw: unknown) => T | undefined): T {
    if (typeof window === "undefined") return initial;
    try {
        const raw = window.localStorage.getItem(key);
        if (raw === null) return initial;
        const parsed = JSON.parse(raw) as unknown;
        const decoded = decode(parsed);
        return decoded === undefined ? initial : decoded;
    } catch (err) {
        console.warn(`[usePersistedState] failed to read "${key}":`, err);
        return initial;
    }
}

/** Decoder for `Set<number>` persisted as a JSON array of numbers. */
export function decodeNumberSet(raw: unknown): Set<number> | undefined {
    if (!Array.isArray(raw)) return undefined;
    const out = new Set<number>();
    for (const v of raw) {
        if (typeof v === "number" && Number.isFinite(v)) out.add(v);
    }
    return out;
}

/** Decoder for `number | null` (active selection id). */
export function decodeNullableNumber(raw: unknown): number | null | undefined {
    if (raw === null) return null;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    return undefined;
}
