/**
 * Marco Extension — Hover Highlighter
 *
 * Phase 17 — Macro Recorder.
 *
 * Renders two nested overlays — a primary outline of the element under the
 * cursor and a dashed outline of its smart group container — into a single
 * shadow-root host with `pointer-events: none`. No DOM mutation of the
 * inspected element. Active in three modes:
 *
 *   - "recording" — auto-on while a recorder session runs.
 *   - "replay"   — auto-on while the replay runner ticks (listens for
 *                  `replay:step:start` / `replay:step:end` CustomEvents).
 *   - "inspector" — on-demand toggle from the recorder toolbar.
 *
 * Alt-key cycling: while Alt is held, mouse-wheel up/down moves the primary
 * outline up/down the ancestor chain; releasing Alt resets the offset on the
 * next mousemove.
 *
 * @see spec/31-macro-recorder/17-hover-highlighter-and-data-controllers.md
 */

export type HighlighterMode = "off" | "recording" | "replay" | "inspector";

export interface HoverHighlighterHandle {
    readonly Host: HTMLElement;
    SetMode(mode: HighlighterMode): void;
    GetMode(): HighlighterMode;
    /** Manually outline an element (used by replay listeners). */
    Outline(target: Element | null): void;
    Destroy(): void;
}

export const HOVER_HIGHLIGHTER_HOST_ID = "marco-hover-highlighter";

const SMART_GROUP_ROLE_SELECTOR =
    '[role="group"], [role="region"], [role="listitem"], [role="row"]';

/* ------------------------------------------------------------------ */
/*  Smart group detection (spec §1.3)                                  */
/* ------------------------------------------------------------------ */

export function findSmartGroup(el: Element): Element | null {
    const form = el.closest("form");
    if (form !== null) return form;

    const fieldset = el.closest("fieldset");
    if (fieldset !== null) return fieldset;

    const tr = el.closest("tr");
    if (tr !== null) return tr;

    const role = el.closest(SMART_GROUP_ROLE_SELECTOR);
    if (role !== null) return role;

    const cardLike = closestByClassToken(el, ["card", "panel", "field-row", "form-group"]);
    if (cardLike !== null) return cardLike;

    const flexGrid = closestFlexOrGrid(el);
    if (flexGrid !== null) return flexGrid;

    return el.parentElement;
}

function closestByClassToken(el: Element, tokens: ReadonlyArray<string>): Element | null {
    let current: Element | null = el;
    while (current !== null) {
        const cls = current.className;
        const isString = typeof cls === "string";
        if (isString) {
            const lower = cls.toLowerCase();
            const hasToken = tokens.some((t) => lower.includes(t));
            if (hasToken) return current;
        }
        current = current.parentElement;
    }
    return null;
}

function closestFlexOrGrid(el: Element): Element | null {
    let current: Element | null = el.parentElement;
    while (current !== null) {
        const styles = current.ownerDocument?.defaultView?.getComputedStyle(current);
        const display = styles?.display ?? "";
        const isFlexOrGrid = display === "flex" || display === "grid";
        const hasMultipleChildren = current.childElementCount >= 2;
        if (isFlexOrGrid && hasMultipleChildren) return current;
        current = current.parentElement;
    }
    return null;
}

/* ------------------------------------------------------------------ */
/*  Ancestor offset                                                    */
/* ------------------------------------------------------------------ */

export function nthAncestor(el: Element, depth: number): Element {
    let current: Element = el;
    let remaining = depth;
    while (remaining > 0 && current.parentElement !== null) {
        current = current.parentElement;
        remaining--;
    }
    return current;
}

/* ------------------------------------------------------------------ */
/*  Mount                                                              */
/* ------------------------------------------------------------------ */

interface InternalState {
    Mode: HighlighterMode;
    HoverTarget: Element | null;
    AncestorOffset: number;
    AltHeld: boolean;
    RafToken: number | null;
}

const STYLE = `
:host { all: initial; }
.outline-primary, .outline-group, .chip {
    position: fixed;
    pointer-events: none;
    box-sizing: border-box;
    z-index: 2147483647;
    transition: transform 80ms linear, width 80ms linear, height 80ms linear;
}
.outline-primary {
    border: 2px solid hsl(217 91% 60%);
    background: hsla(217, 91%, 60%, 0.08);
    border-radius: 2px;
}
.outline-group {
    border: 1px dashed hsl(280 80% 65%);
    border-radius: 4px;
}
.chip {
    font: 11px/1.4 ui-monospace, monospace;
    background: hsl(222 47% 11% / 0.92);
    color: hsl(0 0% 100%);
    padding: 2px 6px;
    border-radius: 3px;
    white-space: nowrap;
    max-width: 360px;
    overflow: hidden;
    text-overflow: ellipsis;
}
.hidden { display: none; }
`;

export function mountHoverHighlighter(
    doc: Document = document,
): HoverHighlighterHandle {
    const existing = doc.getElementById(HOVER_HIGHLIGHTER_HOST_ID);
    if (existing !== null) existing.remove();

    const host = doc.createElement("div");
    host.id = HOVER_HIGHLIGHTER_HOST_ID;
    host.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647;";
    doc.body.appendChild(host);

    const root = host.attachShadow({ mode: "closed" });
    const style = doc.createElement("style");
    style.textContent = STYLE;
    root.appendChild(style);

    const groupEl = doc.createElement("div");
    groupEl.className = "outline-group hidden";
    const primaryEl = doc.createElement("div");
    primaryEl.className = "outline-primary hidden";
    const chipEl = doc.createElement("div");
    chipEl.className = "chip hidden";
    root.append(groupEl, primaryEl, chipEl);

    const state: InternalState = {
        Mode: "off",
        HoverTarget: null,
        AncestorOffset: 0,
        AltHeld: false,
        RafToken: null,
    };

    function paint(): void {
        state.RafToken = null;
        const target = state.HoverTarget;
        if (target === null || state.Mode === "off") {
            primaryEl.classList.add("hidden");
            groupEl.classList.add("hidden");
            chipEl.classList.add("hidden");
            return;
        }

        const resolved = nthAncestor(target, state.AncestorOffset);
        const group = findSmartGroup(resolved);

        applyRect(primaryEl, resolved.getBoundingClientRect());
        primaryEl.classList.remove("hidden");

        if (group !== null && group !== resolved) {
            applyRect(groupEl, group.getBoundingClientRect());
            groupEl.classList.remove("hidden");
        } else {
            groupEl.classList.add("hidden");
        }

        const r = resolved.getBoundingClientRect();
        chipEl.textContent = describeElement(resolved, state.AncestorOffset);
        chipEl.style.transform = `translate(${Math.round(r.left)}px, ${Math.round(Math.max(r.top - 18, 0))}px)`;
        chipEl.classList.remove("hidden");
    }

    function schedulePaint(): void {
        if (state.RafToken !== null) return;
        const win = doc.defaultView;
        if (win === null) return;
        state.RafToken = win.requestAnimationFrame(paint);
    }

    function onMouseMove(ev: MouseEvent): void {
        if (state.Mode === "off") return;
        const t = ev.target;
        const isElement = t instanceof Element;
        if (isElement === false) return;
        const el = t as Element;
        if (host.contains(el)) return;
        if (state.HoverTarget !== el) {
            state.HoverTarget = el;
            if (state.AltHeld === false) state.AncestorOffset = 0;
        }
        schedulePaint();
    }

    function onKeyDown(ev: KeyboardEvent): void {
        if (ev.key === "Alt") {
            state.AltHeld = true;
            if (state.AncestorOffset === 0) state.AncestorOffset = 1;
            schedulePaint();
        }
    }

    function onKeyUp(ev: KeyboardEvent): void {
        if (ev.key === "Alt") state.AltHeld = false;
    }

    function onWheel(ev: WheelEvent): void {
        if (state.AltHeld === false) return;
        const direction = ev.deltaY < 0 ? 1 : -1;
        state.AncestorOffset = Math.max(0, state.AncestorOffset + direction);
        schedulePaint();
    }

    function onReplayStart(ev: Event): void {
        if (state.Mode !== "replay") return;
        const detail = (ev as CustomEvent<{ Element?: Element }>).detail;
        const el = detail?.Element ?? null;
        if (el !== null) {
            state.HoverTarget = el;
            state.AncestorOffset = 0;
            schedulePaint();
        }
    }

    function onReplayEnd(): void {
        if (state.Mode !== "replay") return;
        state.HoverTarget = null;
        schedulePaint();
    }

    doc.addEventListener("mousemove", onMouseMove, { passive: true });
    doc.addEventListener("keydown", onKeyDown, { passive: true });
    doc.addEventListener("keyup", onKeyUp, { passive: true });
    doc.addEventListener("wheel", onWheel, { passive: true });
    doc.addEventListener("replay:step:start", onReplayStart);
    doc.addEventListener("replay:step:end", onReplayEnd);

    return {
        Host: host,
        SetMode(mode) {
            state.Mode = mode;
            if (mode === "off") {
                state.HoverTarget = null;
                state.AncestorOffset = 0;
            }
            schedulePaint();
        },
        GetMode() { return state.Mode; },
        Outline(target) {
            state.HoverTarget = target;
            state.AncestorOffset = 0;
            schedulePaint();
        },
        Destroy() {
            doc.removeEventListener("mousemove", onMouseMove);
            doc.removeEventListener("keydown", onKeyDown);
            doc.removeEventListener("keyup", onKeyUp);
            doc.removeEventListener("wheel", onWheel);
            doc.removeEventListener("replay:step:start", onReplayStart);
            doc.removeEventListener("replay:step:end", onReplayEnd);
            host.remove();
        },
    };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function applyRect(el: HTMLElement, r: DOMRect): void {
    el.style.transform = `translate(${Math.round(r.left)}px, ${Math.round(r.top)}px)`;
    el.style.width = `${Math.round(r.width)}px`;
    el.style.height = `${Math.round(r.height)}px`;
}

export function describeElement(el: Element, depthOffset: number): string {
    const tag = el.tagName.toLowerCase();
    const id = el.id !== "" ? `#${el.id}` : "";
    const cls = typeof el.className === "string" && el.className !== ""
        ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".")
        : "";
    const depth = depthOffset > 0 ? `  · depth +${depthOffset}` : "";
    return `${tag}${id}${cls}${depth}`;
}
