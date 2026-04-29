/**
 * Tests for useDraggable — pointer drag gesture, viewport clamping,
 * and localStorage persistence across hook remounts.
 */

// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useDraggable, POSITION_STORAGE_KEY } from "../use-draggable";

function Probe(): JSX.Element {
    const { position, isDragging, containerRef, handleProps } = useDraggable();
    return (
        <div
            ref={containerRef}
            data-testid="probe"
            data-x={position?.x ?? ""}
            data-y={position?.y ?? ""}
            data-dragging={isDragging ? "1" : "0"}
            style={{ width: 200, height: 80 }}
        >
            <span {...handleProps}>handle</span>
        </div>
    );
}

function pointer(type: string, init: PointerEventInit & { clientX: number; clientY: number; pointerId?: number }): PointerEvent {
    // jsdom lacks PointerEvent — synthesise via MouseEvent with a pointerId tag.
    const ev = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: init.clientX, clientY: init.clientY }) as MouseEvent & { pointerId: number };
    ev.pointerId = init.pointerId ?? 1;
    return ev as unknown as PointerEvent;
}

beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 768 });
    // Stable rect for the probe element.
    Element.prototype.getBoundingClientRect = function (): DOMRect {
        const x = Number((this as HTMLElement).dataset.x ?? 0) || 0;
        const y = Number((this as HTMLElement).dataset.y ?? 0) || 0;
        return { x, y, left: x, top: y, right: x + 200, bottom: y + 80, width: 200, height: 80, toJSON: () => ({}) };
    };
});
afterEach(() => { cleanup(); window.localStorage.clear(); });

describe("useDraggable", () => {
    it("starts with no persisted position", () => {
        const { getByTestId } = render(<Probe />);
        const el = getByTestId("probe");
        expect(el.dataset.x).toBe("");
        expect(el.dataset.y).toBe("");
    });

    it("updates position during pointer drag and persists on release", () => {
        const { getByTestId, getByText } = render(<Probe />);
        const handle = getByText("handle");
        const probe = getByTestId("probe");

        act(() => {
            handle.dispatchEvent(pointer("pointerdown", { clientX: 10, clientY: 10 }));
        });
        expect(probe.dataset.dragging).toBe("1");

        act(() => {
            window.dispatchEvent(pointer("pointermove", { clientX: 250, clientY: 180 }));
        });
        expect(Number(probe.dataset.x)).toBeGreaterThan(0);
        expect(Number(probe.dataset.y)).toBeGreaterThan(0);

        act(() => {
            window.dispatchEvent(pointer("pointerup", { clientX: 250, clientY: 180 }));
        });
        expect(probe.dataset.dragging).toBe("0");
        const stored = window.localStorage.getItem(POSITION_STORAGE_KEY);
        expect(stored).not.toBeNull();
        const parsed = JSON.parse(stored as string);
        expect(typeof parsed.x).toBe("number");
        expect(typeof parsed.y).toBe("number");
    });

    it("clamps drag inside the viewport bounds", () => {
        const { getByText, getByTestId } = render(<Probe />);
        const handle = getByText("handle");
        const probe = getByTestId("probe");

        act(() => { handle.dispatchEvent(pointer("pointerdown", { clientX: 0, clientY: 0 })); });
        // Try to drag way off-screen to bottom-right.
        act(() => { window.dispatchEvent(pointer("pointermove", { clientX: 99999, clientY: 99999 })); });
        act(() => { window.dispatchEvent(pointer("pointerup", { clientX: 99999, clientY: 99999 })); });

        const x = Number(probe.dataset.x);
        const y = Number(probe.dataset.y);
        // Element is 200x80 → max x = 1024 - 200 - 4 = 820, max y = 768 - 80 - 4 = 684.
        expect(x).toBeLessThanOrEqual(820);
        expect(y).toBeLessThanOrEqual(684);
        expect(x).toBeGreaterThanOrEqual(4);
        expect(y).toBeGreaterThanOrEqual(4);
    });

    it("rehydrates persisted position on remount", () => {
        window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify({ x: 123, y: 45 }));
        const { getByTestId } = render(<Probe />);
        const probe = getByTestId("probe");
        expect(probe.dataset.x).toBe("123");
        expect(probe.dataset.y).toBe("45");
    });

    it("ignores malformed persisted JSON", () => {
        window.localStorage.setItem(POSITION_STORAGE_KEY, "not-json");
        const { getByTestId } = render(<Probe />);
        expect(getByTestId("probe").dataset.x).toBe("");
    });
});
