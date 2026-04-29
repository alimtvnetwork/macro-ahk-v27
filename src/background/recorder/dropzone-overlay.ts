/**
 * Marco Extension — Data-Source Drop-Zone Overlay
 *
 * Phase 07 — Macro Recorder.
 *
 * Renders a fixed full-viewport drop target inside a closed Shadow Root that
 * activates when the user drags a file over the page. Accepts CSV / JSON
 * files, parses them via {@link parseCsv} / {@link parseJson}, and forwards
 * the parsed result to the caller through {@link DropZoneOptions.OnFileDropped}.
 *
 * The overlay is *passive* — it never persists. The caller is expected to
 * forward the payload to `RECORDER_DATA_SOURCE_ADD` or equivalent.
 *
 * @see ./data-source-parsers.ts — Pure CSV/JSON parsers used here.
 * @see spec/31-macro-recorder/07-data-source-drop-zone.md
 */

import { DataSourceKindId } from "../recorder-db-schema";
import { parseCsv, parseJson, type ParsedDataSource } from "./data-source-parsers";

export const DROPZONE_HOST_ID = "marco-recorder-dropzone-host";

export interface DroppedDataSource {
    readonly FileName: string;
    readonly MimeKind: "csv" | "json";
    readonly RawText: string;
    readonly Parsed: ParsedDataSource;
}

export interface DropZoneOptions {
    readonly OnFileDropped: (file: DroppedDataSource) => void;
    /** Optional error sink — defaults to console.warn. */
    readonly OnError?: (err: Error, fileName: string) => void;
}

export interface DropZoneHandle {
    readonly Host: HTMLElement;
    readonly Root: ShadowRoot;
    /** True while a drag operation is hovering over the page. */
    IsActive(): boolean;
    Destroy(): void;
}

const STYLE = `
:host { all: initial; }
.overlay {
    position: fixed; inset: 0; z-index: 2147483646;
    display: none; align-items: center; justify-content: center;
    background: rgba(17, 17, 17, .55);
    pointer-events: none;
    font: 600 16px/1.4 system-ui, -apple-system, sans-serif;
    color: #fff;
}
.overlay[data-active="true"] { display: flex; pointer-events: auto; }
.panel {
    border: 2px dashed #fff; border-radius: 12px;
    padding: 28px 36px; background: rgba(0,0,0,.45);
    text-align: center;
}
.panel small { display: block; font-weight: 400; opacity: .75; margin-top: 6px; }
`;

export function mountDropZoneOverlay(
    options: DropZoneOptions,
    container: ParentNode = document.body,
): DropZoneHandle {
    if (container === null || container === undefined) {
        throw new Error("mountDropZoneOverlay: no container available");
    }

    const host = document.createElement("div");
    host.id = DROPZONE_HOST_ID;
    const root = host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = STYLE;
    root.appendChild(style);

    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.dataset.active = "false";
    overlay.innerHTML =
        '<div class="panel">Drop CSV or JSON to attach<small>.csv · .json — first row used as header for CSV</small></div>';
    root.appendChild(overlay);
    container.appendChild(host);

    let dragDepth = 0;
    let active = false;

    function setActive(on: boolean): void {
        active = on;
        overlay.dataset.active = on ? "true" : "false";
    }

    function onDragEnter(e: DragEvent): void {
        if (!hasFiles(e.dataTransfer)) { return; }
        e.preventDefault();
        dragDepth += 1;
        if (dragDepth === 1) { setActive(true); }
    }
    function onDragOver(e: DragEvent): void {
        if (!hasFiles(e.dataTransfer)) { return; }
        e.preventDefault();
        if (e.dataTransfer !== null) { e.dataTransfer.dropEffect = "copy"; }
    }
    function onDragLeave(): void {
        dragDepth = Math.max(0, dragDepth - 1);
        if (dragDepth === 0) { setActive(false); }
    }
    function onDrop(e: DragEvent): void {
        e.preventDefault();
        dragDepth = 0;
        setActive(false);
        const files = e.dataTransfer?.files;
        if (files === undefined || files.length === 0) { return; }
        for (const f of Array.from(files)) {
            void handleFile(f, options);
        }
    }

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover",  onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop",      onDrop);

    let destroyed = false;
    return {
        Host: host,
        Root: root,
        IsActive: () => active,
        Destroy: () => {
            if (destroyed) { return; }
            destroyed = true;
            window.removeEventListener("dragenter", onDragEnter);
            window.removeEventListener("dragover",  onDragOver);
            window.removeEventListener("dragleave", onDragLeave);
            window.removeEventListener("drop",      onDrop);
            host.remove();
        },
    };
}

function hasFiles(dt: DataTransfer | null): boolean {
    if (dt === null) { return false; }
    return Array.from(dt.types).includes("Files");
}

async function handleFile(file: File, options: DropZoneOptions): Promise<void> {
    const onError = options.OnError ?? ((err, name) => console.warn(`[DropZone] ${name}: ${err.message}`));
    try {
        const mimeKind = detectMimeKind(file);
        if (mimeKind === null) {
            throw new Error(`Unsupported file type — accepts .csv / .json (got '${file.name}')`);
        }
        const rawText = await file.text();
        const parsed = mimeKind === "csv" ? parseCsv(rawText) : parseJson(rawText);
        options.OnFileDropped({ FileName: file.name, MimeKind: mimeKind, RawText: rawText, Parsed: parsed });
    } catch (err) {
        onError(err instanceof Error ? err : new Error(String(err)), file.name);
    }
}

function detectMimeKind(file: File): "csv" | "json" | null {
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".csv"))  { return "csv";  }
    if (lower.endsWith(".json")) { return "json"; }
    if (file.type === "text/csv")          { return "csv";  }
    if (file.type === "application/json")  { return "json"; }
    return null;
}

export { DataSourceKindId };
