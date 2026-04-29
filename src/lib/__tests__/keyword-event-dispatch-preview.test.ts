/**
 * Tests for the live-dispatch preview formatter.
 */

import { describe, expect, it } from "vitest";

import {
    buildDispatchPreview,
    previewToString,
} from "@/lib/keyword-event-dispatch-preview";

describe("buildDispatchPreview — Key steps", () => {
    it("splits modifiers and key for a simple combo", () => {
        const p = buildDispatchPreview({ Id: "s", Kind: "Key", Combo: "Ctrl+Enter" });
        expect(p.Kind).toBe("Key");
        if (p.Kind !== "Key") return;
        expect(p.Modifiers).toEqual(["Ctrl"]);
        expect(p.Key).toBe("Enter");
        expect(p.HasKey).toBe(true);
    });

    it("normalises modifier order to Ctrl → Shift → Alt → Meta", () => {
        const p = buildDispatchPreview({ Id: "s", Kind: "Key", Combo: "Meta+Alt+Shift+Ctrl+a" });
        if (p.Kind !== "Key") throw new Error("expected Key");
        expect(p.Modifiers).toEqual(["Ctrl", "Shift", "Alt", "Meta"]);
        expect(p.Key).toBe("A");
    });

    it("upper-cases single-character keys", () => {
        const p = buildDispatchPreview({ Id: "s", Kind: "Key", Combo: "z" });
        if (p.Kind !== "Key") throw new Error("expected Key");
        expect(p.Key).toBe("Z");
        expect(p.Modifiers).toEqual([]);
    });

    it("title-cases named keys", () => {
        const p = buildDispatchPreview({ Id: "s", Kind: "Key", Combo: "tab" });
        if (p.Kind !== "Key") throw new Error("expected Key");
        expect(p.Key).toBe("Tab");
    });

    it("flags modifier-only combos as having no key", () => {
        const p = buildDispatchPreview({ Id: "s", Kind: "Key", Combo: "Ctrl+Shift" });
        if (p.Kind !== "Key") throw new Error("expected Key");
        expect(p.Modifiers).toEqual(["Ctrl", "Shift"]);
        expect(p.HasKey).toBe(false);
        expect(p.Key).toBe("");
    });
});

describe("buildDispatchPreview — Wait steps", () => {
    it("passes the duration through unchanged", () => {
        const p = buildDispatchPreview({ Id: "w", Kind: "Wait", DurationMs: 750 });
        expect(p).toEqual({ Kind: "Wait", DurationMs: 750 });
    });
});

describe("previewToString", () => {
    it("joins modifiers and key with ' + '", () => {
        const s = previewToString(buildDispatchPreview({ Id: "s", Kind: "Key", Combo: "Ctrl+Shift+Enter" }));
        expect(s).toBe("Ctrl + Shift + Enter");
    });

    it("formats Wait steps", () => {
        const s = previewToString(buildDispatchPreview({ Id: "w", Kind: "Wait", DurationMs: 250 }));
        expect(s).toBe("Wait 250 ms");
    });

    it("returns a placeholder for empty combos", () => {
        const s = previewToString(buildDispatchPreview({ Id: "s", Kind: "Key", Combo: "" }));
        expect(s).toBe("(empty combo)");
    });

    it("renders modifier-only combos with just the modifier list", () => {
        const s = previewToString(buildDispatchPreview({ Id: "s", Kind: "Key", Combo: "Ctrl+Alt" }));
        expect(s).toBe("Ctrl + Alt");
    });
});
