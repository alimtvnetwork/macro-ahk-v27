// @vitest-environment jsdom

/**
 * Phase 09 — Failure Toast unit tests.
 *
 * Verifies the Sonner toast wrapper invokes `toast.error` with the right
 * message and that the "Copy report" action writes the structured report
 * to the clipboard.
 */

import { describe, it, expect, vi } from "vitest";
import { copyFailureReportToClipboard, showFailureToast } from "../failure-toast";
import { buildFailureReport, type FailureReport } from "@/background/recorder/failure-logger";

vi.mock("sonner", () => {
    const error = vi.fn(() => 1);
    const success = vi.fn(() => 2);
    return { toast: { error, success } };
});

import { toast } from "sonner";

const FIXED_NOW = (): Date => new Date("2026-04-26T10:00:00.000Z");

function sampleReport(): FailureReport {
    return buildFailureReport({
        Phase: "Replay",
        Error: new Error("Element not found for selector '#go'"),
        StepId: 7, Index: 2, StepKind: "Click",
        SourceFile: "src/x.ts", Now: FIXED_NOW,
    });
}

describe("copyFailureReportToClipboard", () => {
    it("writes a formatted block plus JSON to the supplied clipboard", async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        const ok = await copyFailureReportToClipboard(sampleReport(), {
            Clipboard: { writeText },
        });
        expect(ok).toBe(true);
        expect(writeText).toHaveBeenCalledTimes(1);
        const blob = writeText.mock.calls[0]![0] as string;
        expect(blob).toContain("[MarcoReplay] Element not found");
        expect(blob).toContain("--- JSON ---");
        expect(blob).toContain('"Phase": "Replay"');
    });

    it("returns false when the clipboard is unavailable", async () => {
        const ok = await copyFailureReportToClipboard(sampleReport(), {
            Clipboard: { writeText: () => Promise.reject(new Error("denied")) },
        });
        expect(ok).toBe(false);
    });
});

describe("showFailureToast", () => {
    it("calls toast.error with a Step-aware title and a Copy report action", () => {
        const errMock = vi.mocked(toast.error);
        errMock.mockClear();

        showFailureToast(sampleReport());

        expect(errMock).toHaveBeenCalledTimes(1);
        const [title, opts] = errMock.mock.calls[0]!;
        expect(title).toContain("Step #7");
        expect(title).toContain("Click");
        expect(title).toContain("Element not found");
        const optionsObj = opts as { description: string; action: { label: string } };
        expect(optionsObj.description).toContain("Phase: Replay");
        expect(optionsObj.action.label).toBe("Copy report");
    });
});
