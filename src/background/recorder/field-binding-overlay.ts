/**
 * Marco Extension — Hover Field-Binding Overlay
 *
 * Phase 08 — Macro Recorder.
 *
 * In-page UI mounted in a closed Shadow Root that follows the cursor as the
 * user hovers over input-like elements (`input`, `textarea`,
 * `[contenteditable]`). Shows a column picker — clicking a column emits a
 * binding payload that the caller persists via `RECORDER_FIELD_BINDING_UPSERT`.
 *
 * The overlay does *not* mutate the host page (no `{{Column}}` is written
 * into the input). It also previews the resolved value via
 * {@link resolveFieldReferences} when a sample row is supplied.
 *
 * ### Multi-column composer (Phase 08.1)
 * When the popover is pinned (user clicked the target), the overlay enters
 * composer mode: an editable template input + live preview let the user
 * combine multiple `{{Column}}` placeholders before committing. Clicking a
 * column appends `{{Column}}` to the template at the caret. The preview
 * resolves every placeholder against `SampleRow` on every keystroke.
 * Pressing "Bind" emits a single payload describing the full template.
 *
 * @see ./field-reference-resolver.ts — `{{Column}}` substitution
 * @see spec/31-macro-recorder/08-field-reference-wrapper.md
 */

import {
    extractReferencedColumns,
    resolveFieldReferences,
    type FieldRow,
} from "./field-reference-resolver";

export const FIELD_BINDING_HOST_ID = "marco-recorder-field-binding-host";

export interface FieldBindingOptions {
    /** Column names available in the active data source. */
    readonly Columns: ReadonlyArray<string>;
    /** Optional sample row used to preview the resolved value of a column. */
    readonly SampleRow?: FieldRow;
    /** Invoked when the user clicks a column for the currently-hovered field. */
    readonly OnBind: (binding: FieldBindingPayload) => void;
}

export interface FieldBindingPayload {
    readonly Target: HTMLElement;
    /**
     * The first column referenced by `Template`, or the single column the
     * user clicked. Kept for backwards compatibility with single-column
     * callers; multi-column templates expose every name via `Columns`.
     */
    readonly ColumnName: string;
    /** Every distinct column referenced in `Template`, in first-occurrence order. */
    readonly Columns: ReadonlyArray<string>;
    /** Final template, e.g. `"{{First}} {{Last}}"` or `"{{Email}}"`. */
    readonly Template: string;
    /** Resolved preview against `SampleRow`, or `null` when unavailable. */
    readonly PreviewValue: string | null;
}

export interface FieldBindingHandle {
    readonly Host: HTMLElement;
    readonly Root: ShadowRoot;
    /** Currently-hovered bindable element, if any. */
    GetHoveredTarget(): HTMLElement | null;
    /** Current composer template string. Empty when not in composer mode. */
    GetTemplate(): string;
    Destroy(): void;
}

const STYLE = `
:host { all: initial; }
.popover {
    position: fixed; z-index: 2147483645;
    display: none; min-width: 220px; max-width: 300px;
    padding: 8px; border-radius: 8px;
    background: #111; color: #fff;
    font: 500 12px/1.3 system-ui, -apple-system, sans-serif;
    box-shadow: 0 6px 20px rgba(0,0,0,.45);
}
.popover[data-open="true"] { display: block; }
.title { font-size: 10px; opacity: .7; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 6px; }
.col {
    display: flex; justify-content: space-between; gap: 10px;
    width: 100%; box-sizing: border-box;
    appearance: none; border: 0; cursor: pointer;
    padding: 5px 8px; border-radius: 6px;
    background: transparent; color: inherit; font: inherit; text-align: left;
}
.col:hover, .col:focus { background: #2a2a2a; outline: none; }
.col-name { font-weight: 600; }
.col-preview { opacity: .65; max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.composer { margin-top: 8px; padding-top: 8px; border-top: 1px solid #2a2a2a; display: none; }
.composer[data-open="true"] { display: block; }
.template-input {
    width: 100%; box-sizing: border-box;
    padding: 5px 8px; border-radius: 6px;
    border: 1px solid #2a2a2a; background: #0b0b0b; color: #fff;
    font: 500 12px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;
}
.template-input:focus { outline: none; border-color: #16a34a; }
.preview {
    margin-top: 6px; padding: 5px 8px; border-radius: 6px;
    background: #0b0b0b; color: #d1fae5;
    font: 500 12px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;
    word-break: break-all; min-height: 18px;
}
.preview[data-error="true"] { color: #fecaca; }
.preview-label { font-size: 10px; opacity: .55; text-transform: uppercase; letter-spacing: .08em; margin-top: 6px; }
.tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.tag {
    display: inline-block; padding: 2px 6px; border-radius: 4px;
    background: #1f2937; color: #93c5fd; font-size: 11px;
}
.actions { display: flex; gap: 6px; margin-top: 8px; }
.btn {
    appearance: none; border: 0; cursor: pointer;
    padding: 6px 10px; border-radius: 6px;
    font: 600 12px/1 system-ui, -apple-system, sans-serif;
}
.btn-primary { background: #16a34a; color: #fff; flex: 1; }
.btn-primary:disabled { background: #374151; cursor: not-allowed; }
.btn-secondary { background: transparent; color: #9ca3af; }
.btn-secondary:hover { color: #fff; }
.outline {
    position: fixed; z-index: 2147483644; pointer-events: none;
    border: 2px solid #16a34a; border-radius: 4px; display: none;
}
.outline[data-open="true"] { display: block; }
`;

const BINDABLE_SELECTOR = "input, textarea, [contenteditable=''], [contenteditable='true']";

export function mountFieldBindingOverlay(
    options: FieldBindingOptions,
    container: ParentNode = document.body,
): FieldBindingHandle {
    if (container === null || container === undefined) {
        throw new Error("mountFieldBindingOverlay: no container available");
    }

    const host = document.createElement("div");
    host.id = FIELD_BINDING_HOST_ID;
    const root = host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = STYLE;
    root.appendChild(style);

    const outline = document.createElement("div");
    outline.className = "outline";
    outline.dataset.open = "false";
    root.appendChild(outline);

    const popover = document.createElement("div");
    popover.className = "popover";
    popover.dataset.open = "false";
    popover.setAttribute("role", "menu");
    popover.setAttribute("aria-label", "Field bindings");
    root.appendChild(popover);

    container.appendChild(host);

    let hovered: HTMLElement | null = null;
    let pinned = false;
    let template = "";
    let templateInput: HTMLInputElement | null = null;
    let preview: HTMLDivElement | null = null;
    let tagsRow: HTMLDivElement | null = null;
    let bindBtn: HTMLButtonElement | null = null;
    let composer: HTMLDivElement | null = null;

    renderColumns();

    function renderColumns(): void {
        popover.innerHTML = "";
        const title = document.createElement("div");
        title.className = "title";
        title.textContent = "Bind to column";
        popover.appendChild(title);

        for (const col of options.Columns) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "col";
            btn.dataset.column = col;
            btn.setAttribute("role", "menuitem");

            const name = document.createElement("span");
            name.className = "col-name";
            name.textContent = col;
            btn.appendChild(name);

            const colPreview = document.createElement("span");
            colPreview.className = "col-preview";
            colPreview.textContent = options.SampleRow?.[col] ?? "";
            btn.appendChild(colPreview);

            btn.addEventListener("mousedown", (e) => { e.preventDefault(); }); // don't blur target
            btn.addEventListener("click", () => { handleColumnClick(col); });
            popover.appendChild(btn);
        }

        composer = document.createElement("div");
        composer.className = "composer";
        composer.dataset.open = "false";

        const composerLabel = document.createElement("div");
        composerLabel.className = "title";
        composerLabel.textContent = "Template";
        composer.appendChild(composerLabel);

        templateInput = document.createElement("input");
        templateInput.type = "text";
        templateInput.className = "template-input";
        templateInput.placeholder = "{{First}} {{Last}}";
        templateInput.spellcheck = false;
        templateInput.addEventListener("input", () => {
            template = templateInput!.value;
            refreshPreview();
        });
        templateInput.addEventListener("mousedown", (e) => { e.stopPropagation(); });
        templateInput.addEventListener("click", (e) => { e.stopPropagation(); });
        composer.appendChild(templateInput);

        const previewLabel = document.createElement("div");
        previewLabel.className = "preview-label";
        previewLabel.textContent = "Preview";
        composer.appendChild(previewLabel);

        preview = document.createElement("div");
        preview.className = "preview";
        composer.appendChild(preview);

        tagsRow = document.createElement("div");
        tagsRow.className = "tags";
        composer.appendChild(tagsRow);

        const actions = document.createElement("div");
        actions.className = "actions";

        bindBtn = document.createElement("button");
        bindBtn.type = "button";
        bindBtn.className = "btn btn-primary";
        bindBtn.textContent = "Bind";
        bindBtn.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); });
        bindBtn.addEventListener("click", (e) => { e.stopPropagation(); commitTemplate(); });
        actions.appendChild(bindBtn);

        const clearBtn = document.createElement("button");
        clearBtn.type = "button";
        clearBtn.className = "btn btn-secondary";
        clearBtn.textContent = "Clear";
        clearBtn.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); });
        clearBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            template = "";
            if (templateInput !== null) { templateInput.value = ""; }
            refreshPreview();
            templateInput?.focus();
        });
        actions.appendChild(clearBtn);

        composer.appendChild(actions);
        popover.appendChild(composer);
    }

    function handleColumnClick(col: string): void {
        if (hovered === null) { return; }
        const token = `{{${col}}}`;
        if (pinned) {
            // Composer mode: append (or insert at caret) and keep popover open.
            insertTokenIntoTemplate(token);
            refreshPreview();
            templateInput?.focus();
            return;
        }
        // Single-click flow: emit immediately for backwards compatibility.
        emitBinding(token);
        hide();
    }

    function insertTokenIntoTemplate(token: string): void {
        if (templateInput === null) {
            template = `${template}${token}`;
            return;
        }
        const start = templateInput.selectionStart ?? template.length;
        const end = templateInput.selectionEnd ?? template.length;
        const next = `${template.slice(0, start)}${token}${template.slice(end)}`;
        template = next;
        templateInput.value = next;
        const caret = start + token.length;
        templateInput.setSelectionRange(caret, caret);
    }

    function refreshPreview(): void {
        if (preview === null || tagsRow === null) { return; }
        tagsRow.innerHTML = "";
        const cols = extractReferencedColumns(template);
        for (const c of cols) {
            const tag = document.createElement("span");
            tag.className = "tag";
            tag.textContent = c;
            tagsRow.appendChild(tag);
        }

        if (template === "") {
            preview.textContent = "";
            preview.dataset.error = "false";
            if (bindBtn !== null) { bindBtn.disabled = true; }
            return;
        }

        if (options.SampleRow === undefined) {
            preview.textContent = template;
            preview.dataset.error = "false";
        } else {
            try {
                preview.textContent = resolveFieldReferences(template, options.SampleRow);
                preview.dataset.error = "false";
            } catch (err) {
                preview.textContent = err instanceof Error ? err.message : String(err);
                preview.dataset.error = "true";
            }
        }
        if (bindBtn !== null) { bindBtn.disabled = false; }
    }

    function commitTemplate(): void {
        if (hovered === null || template === "") { return; }
        emitBinding(template);
        pinned = false;
        template = "";
        if (templateInput !== null) { templateInput.value = ""; }
        refreshPreview();
        hide();
    }

    function emitBinding(tpl: string): void {
        if (hovered === null) { return; }
        const cols = extractReferencedColumns(tpl);
        const primary = cols[0] ?? "";
        let previewValue: string | null = null;
        if (options.SampleRow !== undefined) {
            try { previewValue = resolveFieldReferences(tpl, options.SampleRow); }
            catch { previewValue = null; }
        }
        options.OnBind({
            Target: hovered,
            ColumnName: primary,
            Columns: cols,
            Template: tpl,
            PreviewValue: previewValue,
        });
    }

    function show(target: HTMLElement): void {
        hovered = target;
        const rect = target.getBoundingClientRect();
        outline.style.left   = `${rect.left}px`;
        outline.style.top    = `${rect.top}px`;
        outline.style.width  = `${rect.width}px`;
        outline.style.height = `${rect.height}px`;
        outline.dataset.open = "true";

        popover.style.left = `${rect.left}px`;
        popover.style.top  = `${rect.bottom + 6}px`;
        popover.dataset.open = "true";

        if (composer !== null) {
            composer.dataset.open = pinned ? "true" : "false";
        }
        if (pinned) {
            refreshPreview();
        }
    }
    function hide(): void {
        if (pinned) { return; }
        hovered = null;
        outline.dataset.open = "false";
        popover.dataset.open = "false";
        if (composer !== null) { composer.dataset.open = "false"; }
    }

    function isOurNode(node: EventTarget | null): boolean {
        return node === host || (node instanceof Node && host.contains(node));
    }

    function onMove(e: MouseEvent): void {
        if (pinned) { return; }
        const t = e.target;
        if (isOurNode(t)) { return; }
        if (!(t instanceof HTMLElement)) { hide(); return; }
        const candidate = t.closest(BINDABLE_SELECTOR);
        if (candidate instanceof HTMLElement) {
            show(candidate);
        } else {
            hide();
        }
    }

    function onClick(e: MouseEvent): void {
        const t = e.target;
        if (isOurNode(t)) { return; }
        if (!(t instanceof HTMLElement)) { return; }
        const candidate = t.closest(BINDABLE_SELECTOR);
        if (candidate instanceof HTMLElement) {
            e.preventDefault();
            pinned = true;
            show(candidate);
            refreshPreview();
        } else {
            pinned = false;
            template = "";
            if (templateInput !== null) { templateInput.value = ""; }
            hide();
        }
    }

    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click",     onClick, true);

    let destroyed = false;
    return {
        Host: host,
        Root: root,
        GetHoveredTarget: () => hovered,
        GetTemplate: () => template,
        Destroy: () => {
            if (destroyed) { return; }
            destroyed = true;
            document.removeEventListener("mousemove", onMove, true);
            document.removeEventListener("click",     onClick, true);
            host.remove();
        },
    };
}
