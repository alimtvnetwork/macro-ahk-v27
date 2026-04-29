/**
 * Marco Extension — Hotkey Chord Capture
 *
 * Reusable input that listens for keyboard events and turns each
 * chord (keydown with optional modifiers) into a string entry. Used
 * by the Step Editor Dialog (Hotkey kind) and by the Floating
 * Controller's quick-add panel.
 *
 * Behaviour:
 *   - Click the capture box to activate; press a key combination → it
 *     is captured as "Ctrl+Shift+S" style.
 *   - Captured chords stack as removable chips above the box.
 *   - The most recently captured chord is summarised in the box itself
 *     and persists through Esc / outside-click so the user has an
 *     immediate visual confirmation of what was just pressed.
 *   - `Backspace` while empty deletes the last chip.
 *   - Pressing `Escape` cancels capture mode (chord list is preserved).
 *   - Clicking anywhere outside the component also exits capture mode.
 *
 * The component is fully controlled — caller owns `value` and reacts
 * to `onChange`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Keyboard, History } from "lucide-react";

import { cn } from "@/lib/utils";

export interface HotkeyChordCaptureProps {
    readonly value: readonly string[];
    readonly onChange: (next: readonly string[]) => void;
    readonly placeholder?: string;
    readonly className?: string;
    readonly id?: string;
}

const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta", "OS"]);

function eventToChord(e: KeyboardEvent): string | null {
    if (MODIFIER_KEYS.has(e.key)) { return null; }
    const parts: string[] = [];
    if (e.ctrlKey) parts.push("Ctrl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    if (e.metaKey) parts.push("Meta");
    let key = e.key;
    if (key === " ") { key = "Space"; }
    if (key.length === 1) { key = key.toUpperCase(); }
    parts.push(key);
    return parts.join("+");
}

export function HotkeyChordCapture(props: HotkeyChordCaptureProps): JSX.Element {
    const { value, onChange, placeholder, className, id } = props;
    const [active, setActive] = useState(false);
    /**
     * Sticky summary of the most-recently-captured chord. Survives chip
     * removal, Esc, and outside-click so the user always sees what they
     * just pressed without having to recount the chord chips.
     */
    const [lastChord, setLastChord] = useState<string | null>(null);
    const boxRef = useRef<HTMLDivElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    const onKeyDown = useCallback((e: KeyboardEvent) => {
        if (!active) { return; }
        if (e.key === "Escape") {
            e.preventDefault();
            setActive(false);
            boxRef.current?.blur();
            return;
        }
        if (e.key === "Backspace" && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && value.length > 0) {
            // Only consume backspace when no other key is pressed —
            // otherwise allow "Ctrl+Backspace" etc. to be captured.
            e.preventDefault();
            onChange(value.slice(0, -1));
            return;
        }
        const chord = eventToChord(e);
        if (chord === null) { return; }
        e.preventDefault();
        e.stopPropagation();
        setLastChord(chord);
        onChange([...value, chord]);
    }, [active, value, onChange]);

    useEffect(() => {
        if (!active) { return; }
        const box = boxRef.current;
        if (box === null) { return; }
        box.addEventListener("keydown", onKeyDown);
        return () => box.removeEventListener("keydown", onKeyDown);
    }, [active, onKeyDown]);

    /**
     * Outside-click guard. Pointer-down is used (not click) so the
     * deactivation runs *before* focus moves elsewhere — otherwise
     * onBlur already fires and this is redundant. The pointer path
     * also catches mousedown on non-focusable surfaces.
     */
    useEffect(() => {
        if (!active) { return; }
        const onPointerDown = (e: PointerEvent) => {
            const root = containerRef.current;
            if (root === null) { return; }
            if (e.target instanceof Node && root.contains(e.target)) { return; }
            setActive(false);
            boxRef.current?.blur();
        };
        document.addEventListener("pointerdown", onPointerDown, true);
        return () => document.removeEventListener("pointerdown", onPointerDown, true);
    }, [active]);

    const removeChord = (idx: number) => {
        const next = value.slice();
        next.splice(idx, 1);
        onChange(next);
    };

    return (
        <div ref={containerRef} className={cn("space-y-1.5", className)}>
            <div className="flex flex-wrap gap-1.5 min-h-[1.75rem]">
                {value.length === 0 ? (
                    <span className="text-[11px] text-muted-foreground italic self-center">
                        No chords yet — focus the box below and press keys.
                    </span>
                ) : value.map((chord, i) => (
                    <span
                        key={`${chord}-${i}`}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground text-[11px] font-mono"
                        data-testid="hotkey-chord-chip"
                    >
                        {chord}
                        <button
                            type="button"
                            aria-label={`Remove chord ${chord}`}
                            onClick={() => removeChord(i)}
                            className="opacity-60 hover:opacity-100"
                        >
                            <X className="h-3 w-3" />
                        </button>
                    </span>
                ))}
            </div>
            <div
                ref={boxRef}
                id={id}
                role="textbox"
                tabIndex={0}
                aria-label="Hotkey capture area — focus then press keys"
                onFocus={() => setActive(true)}
                onBlur={() => setActive(false)}
                onClick={() => boxRef.current?.focus()}
                className={cn(
                    "border rounded px-2 py-1.5 text-xs cursor-text transition-colors outline-none",
                    "focus-visible:ring-2 focus-visible:ring-ring",
                    active
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border bg-background text-muted-foreground hover:border-primary/50",
                )}
                data-testid="hotkey-capture-box"
                aria-live="polite"
            >
                <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5">
                        <Keyboard className="h-3 w-3" />
                        {active
                            ? "Listening… press a key combination (Esc to stop)"
                            : (placeholder ?? "Click here, then press the key combination to record")}
                    </span>
                    {lastChord !== null ? (
                        <span
                            className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground"
                            data-testid="hotkey-last-chord"
                            title={`Last captured chord: ${lastChord}`}
                        >
                            <History className="h-3 w-3" />
                            <span className="text-foreground">{lastChord}</span>
                        </span>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
