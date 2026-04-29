/**
 * Marco Extension — Boot failure report invariants
 *
 * Locks in the contract that BOTH the clipboard "Copy report" and the
 * downloadable "Create support report" .txt produce the identical bundle
 * — including the Failure ID + Snapshot at correlation header — because
 * they call the same `buildReport()` helper.
 *
 * Guards against future drift where someone might add a separate report
 * builder for the download path and accidentally omit correlation fields.
 */

import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BootFailureBanner } from "../BootFailureBanner";

const DOWNLOAD_LISTENER_FLAG = "__marco_test_last_download__";

interface CapturedDownload {
    name: string;
    text: string;
}

declare global {
    var __marco_test_last_download__: CapturedDownload | null | undefined;
}

async function captureNextDownload(action: () => void): Promise<CapturedDownload> {
    let capturedBlob: Blob | null = null;
    let capturedName = "(unknown)";

    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    const origCreateEl = document.createElement.bind(document);

    URL.createObjectURL = (blob: Blob): string => {
        capturedBlob = blob;
        return "blob:mock";
    };
    URL.revokeObjectURL = (): void => { /* no-op */ };
    document.createElement = ((tag: string) => {
        const el = origCreateEl(tag);
        if (tag === "a") {
            Object.defineProperty(el, "click", { value: () => {
                capturedName = (el as HTMLAnchorElement).download;
            }});
        }
        return el;
    }) as typeof document.createElement;

    try {
        action();
        if (capturedBlob === null) throw new Error("No blob captured — download handler did not run");
        const text = await (capturedBlob as Blob).text();
        return { name: capturedName, text };
    } finally {
        URL.createObjectURL = origCreate;
        URL.revokeObjectURL = origRevoke;
        document.createElement = origCreateEl;
    }
}

const PROPS = {
    bootStep: "failed:wasm-load",
    bootError: "WASM 404 at chrome-extension://abc/wasm/sql-wasm.wasm",
    bootErrorStack: "Error: WASM 404\n  at verifyWasmPresence",
    bootErrorContext: null,
    wasmProbe: null,
    frozenTrail: null,
    failureId: "fail_01HXYZ_UNIQUE",
    failureAt: "2026-04-21T08:30:00.000Z",
};

describe("BootFailureBanner — support report parity", () => {
    it("download .txt includes Failure ID and Snapshot at, matching the clipboard report", async () => {
        // Force "full" mode so localStorage state from prior tests can't
        // smuggle "short" through and mask a regression.
        localStorage.setItem("marco_support_report_mode", "full");

        // Stub clipboard so handleCopyReport resolves and we can read the
        // text it would have written.
        let clipboardText = "";
        Object.assign(navigator, {
            clipboard: {
                writeText: (t: string) => {
                    clipboardText = t;
                    return Promise.resolve();
                },
            },
        });

        render(<BootFailureBanner {...PROPS} />);

        // Trigger Copy report
        fireEvent.click(screen.getByTitle(/Copy .* diagnostic report/i));

        // Trigger Create support report and capture the blob text
        const download = await captureNextDownload(() => {
            fireEvent.click(screen.getByTitle(/Download .* diagnostic report/i));
        });

        // Both bundles MUST contain the correlation header verbatim.
        for (const bundle of [clipboardText, download.text]) {
            expect(bundle).toMatch(/Failure ID:\s+fail_01HXYZ_UNIQUE/);
            expect(bundle).toMatch(/Snapshot at:\s+2026-04-21T08:30:00\.000Z/);
            expect(bundle).toMatch(/Failed step:\s+wasm-load/);
        }

        // And the download body must equal the clipboard body — modulo the
        // `Generated:` line, which is the wall-clock at builder-call time
        // and naturally differs by milliseconds between the two clicks.
        const stripGenerated = (s: string): string => s.replace(/^ {2}Generated:.*$/m, "  Generated: <ts>");
        expect(stripGenerated(download.text)).toEqual(stripGenerated(clipboardText));

        // Filename embeds the mode for at-a-glance triage.
        expect(download.name).toMatch(/^marco-support-report-full-/);
    });
});
