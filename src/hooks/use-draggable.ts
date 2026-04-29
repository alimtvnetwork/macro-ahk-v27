/**
 * Marco Extension — useDraggable hook
 *
 * Pointer-driven drag for the floating recorder controller. Position is
 * persisted to `localStorage` under {@link POSITION_STORAGE_KEY} so it
 * survives reloads. Coordinates are clamped to the viewport on drag and on
 * window resize so the panel can never escape the screen.
 *
 * Returns:
 *   • `position` — current `{ x, y }` (or `null` until the user drags once;
 *     consumers should fall back to their default top/right CSS).
 *   • `containerRef` — attach to the draggable element (used for measuring
 *     bounds when clamping).
 *   • `handleProps` — spread onto the drag-handle element. Adds the
 *     pointer-down listener, cursor styles, and ARIA hints.
 *   • `isDragging` — true while a drag gesture is in flight.
 *
 * @see ../components/recorder/FloatingController.tsx
 */

import { useCallback, useEffect, useRef, useState } from "react";

export const POSITION_STORAGE_KEY = "marco-floating-controller-position";

export interface DragPosition {
    readonly x: number;
    readonly y: number;
}

interface PointerOffset {
    readonly dx: number;
    readonly dy: number;
}

const EDGE_PADDING_PX = 4;

function loadPosition(): DragPosition | null {
    if (typeof window === "undefined") { return null; }
    try {
        const raw = window.localStorage.getItem(POSITION_STORAGE_KEY);
        if (raw === null) { return null; }
        const parsed: unknown = JSON.parse(raw);
        if (
            typeof parsed === "object" && parsed !== null &&
            typeof (parsed as DragPosition).x === "number" &&
            typeof (parsed as DragPosition).y === "number" &&
            Number.isFinite((parsed as DragPosition).x) &&
            Number.isFinite((parsed as DragPosition).y)
        ) {
            return { x: (parsed as DragPosition).x, y: (parsed as DragPosition).y };
        }
    } catch { /* ignore */ } // allow-swallow: corrupt stored position falls back to default
    return null;
}

function savePosition(p: DragPosition): void {
    if (typeof window === "undefined") { return; }
    try { window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(p)); } catch { /* ignore */ } // allow-swallow: localStorage quota/denied; position is convenience-only
}

function clamp(p: DragPosition, width: number, height: number): DragPosition {
    if (typeof window === "undefined") { return p; }
    const maxX = Math.max(EDGE_PADDING_PX, window.innerWidth - width - EDGE_PADDING_PX);
    const maxY = Math.max(EDGE_PADDING_PX, window.innerHeight - height - EDGE_PADDING_PX);
    return {
        x: Math.min(Math.max(EDGE_PADDING_PX, p.x), maxX),
        y: Math.min(Math.max(EDGE_PADDING_PX, p.y), maxY),
    };
}

export interface UseDraggableResult {
    readonly position: DragPosition | null;
    readonly isDragging: boolean;
    readonly containerRef: React.RefObject<HTMLDivElement>;
    readonly handleProps: {
        readonly onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
        readonly style: React.CSSProperties;
        readonly role: "button";
        readonly "aria-label": string;
        readonly "data-testid": string;
    };
    /** Reset to the default (top-right) position. */
    readonly reset: () => void;
}

export function useDraggable(): UseDraggableResult {
    const containerRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<DragPosition | null>(() => loadPosition());
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const offsetRef = useRef<PointerOffset>({ dx: 0, dy: 0 });
    const activePointerRef = useRef<number | null>(null);

    /* Reclamp on resize so the panel never gets stranded off-screen. */
    useEffect(() => {
        if (typeof window === "undefined") { return; }
        const onResize = () => {
            setPosition((prev) => {
                if (prev === null) { return prev; }
                const el = containerRef.current;
                if (el === null) { return prev; }
                const rect = el.getBoundingClientRect();
                const next = clamp(prev, rect.width, rect.height);
                if (next.x === prev.x && next.y === prev.y) { return prev; }
                savePosition(next);
                return next;
            });
        };
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    const onPointerMove = useCallback((e: PointerEvent) => {
        if (activePointerRef.current === null || e.pointerId !== activePointerRef.current) { return; }
        const el = containerRef.current;
        const rect = el?.getBoundingClientRect();
        const w = rect?.width ?? 0;
        const h = rect?.height ?? 0;
        const next = clamp(
            { x: e.clientX - offsetRef.current.dx, y: e.clientY - offsetRef.current.dy },
            w,
            h,
        );
        setPosition(next);
    }, []);

    const onPointerUp = useCallback((e: PointerEvent) => {
        if (activePointerRef.current === null || e.pointerId !== activePointerRef.current) { return; }
        activePointerRef.current = null;
        setIsDragging(false);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerUp);
        setPosition((p) => {
            if (p !== null) { savePosition(p); }
            return p;
        });
    }, [onPointerMove]);

    const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
        // Ignore non-primary buttons (e.g. right-click) and keyboard activation.
        if (e.button !== 0) { return; }
        const el = containerRef.current;
        if (el === null) { return; }
        const rect = el.getBoundingClientRect();
        offsetRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
        activePointerRef.current = e.pointerId;
        setIsDragging(true);
        // Seed the position with the current rect so the first move is smooth
        // even when we were still using the default top/right CSS.
        setPosition((prev) => prev ?? clamp({ x: rect.left, y: rect.top }, rect.width, rect.height));
        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
        window.addEventListener("pointercancel", onPointerUp);
        e.preventDefault();
    }, [onPointerMove, onPointerUp]);

    const reset = useCallback(() => {
        setPosition(null);
        if (typeof window !== "undefined") {
            try { window.localStorage.removeItem(POSITION_STORAGE_KEY); } catch { /* ignore */ } // allow-swallow: localStorage denied; reset is best-effort
        }
    }, []);

    return {
        position,
        isDragging,
        containerRef,
        handleProps: {
            onPointerDown,
            style: { cursor: isDragging ? "grabbing" : "grab", touchAction: "none" },
            role: "button",
            "aria-label": "Drag floating controller",
            "data-testid": "controller-drag-handle",
        },
        reset,
    };
}
