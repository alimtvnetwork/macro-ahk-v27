// @vitest-environment jsdom

/**
 * Marco Extension — Drop-Zone Overlay tests
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
    DROPZONE_HOST_ID,
    mountDropZoneOverlay,
    type DropZoneHandle,
    type DroppedDataSource,
} from "../dropzone-overlay";

let handle: DropZoneHandle | null = null;
afterEach(() => { handle?.Destroy(); handle = null; });

function fireDrag(type: "dragenter" | "dragover" | "dragleave" | "drop", files?: File[]): DragEvent {
    const dt = {
        types: files === undefined ? [] : ["Files"],
        files: files ?? [],
        dropEffect: "none" as DataTransfer["dropEffect"],
    } as unknown as DataTransfer;
    const ev = new Event(type, { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(ev, "dataTransfer", { value: dt });
    window.dispatchEvent(ev);
    return ev;
}

describe("DropZoneOverlay", () => {
    it("mounts a hidden overlay until a drag with files enters", () => {
        handle = mountDropZoneOverlay({ OnFileDropped: () => {} });
        expect(document.getElementById(DROPZONE_HOST_ID)).toBe(handle.Host);
        expect(handle.IsActive()).toBe(false);

        fireDrag("dragenter", [new File(["a,b\n1,2"], "x.csv")]);
        expect(handle.IsActive()).toBe(true);
    });

    it("ignores drags that do not carry files", () => {
        handle = mountDropZoneOverlay({ OnFileDropped: () => {} });
        fireDrag("dragenter"); // no files
        expect(handle.IsActive()).toBe(false);
    });

    it("parses a dropped CSV and forwards the result", async () => {
        const onDrop = vi.fn<(p: DroppedDataSource) => void>();
        handle = mountDropZoneOverlay({ OnFileDropped: onDrop });

        const file = new File(["Name,Email\nA,a@x\nB,b@x"], "people.csv", { type: "text/csv" });
        fireDrag("dragenter", [file]);
        fireDrag("drop",      [file]);

        await new Promise((r) => setTimeout(r, 0));
        expect(onDrop).toHaveBeenCalledTimes(1);
        const payload = onDrop.mock.calls[0]![0];
        expect(payload.FileName).toBe("people.csv");
        expect(payload.MimeKind).toBe("csv");
        expect(payload.Parsed.Columns).toEqual(["Name", "Email"]);
        expect(payload.Parsed.RowCount).toBe(2);
        expect(handle.IsActive()).toBe(false);
    });

    it("rejects unsupported file types via OnError", async () => {
        const onError = vi.fn<(e: Error, n: string) => void>();
        handle = mountDropZoneOverlay({ OnFileDropped: () => {}, OnError: onError });

        const file = new File(["binary"], "thing.png", { type: "image/png" });
        fireDrag("drop", [file]);

        await new Promise((r) => setTimeout(r, 0));
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError.mock.calls[0]![0].message).toMatch(/Unsupported file type/);
    });

    it("Destroy is idempotent and removes the host", () => {
        handle = mountDropZoneOverlay({ OnFileDropped: () => {} });
        handle.Destroy();
        expect(document.getElementById(DROPZONE_HOST_ID)).toBeNull();
        expect(() => handle?.Destroy()).not.toThrow();
    });
});
