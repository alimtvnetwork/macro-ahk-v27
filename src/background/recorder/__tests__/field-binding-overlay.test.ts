// @vitest-environment jsdom

/**
 * Marco Extension — Field-Binding Overlay tests
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
    FIELD_BINDING_HOST_ID,
    mountFieldBindingOverlay,
    type FieldBindingHandle,
    type FieldBindingPayload,
} from "../field-binding-overlay";

let handle: FieldBindingHandle | null = null;
afterEach(() => {
    handle?.Destroy();
    handle = null;
    document.body.innerHTML = "";
});

function moveOver(target: Element): void {
    target.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
}

function clickOn(target: Element): void {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

describe("FieldBindingOverlay", () => {
    it("mounts a closed shadow root with one button per column", () => {
        handle = mountFieldBindingOverlay({
            Columns: ["Name", "Email"],
            OnBind: () => {},
        });
        expect(document.getElementById(FIELD_BINDING_HOST_ID)).toBe(handle.Host);
        const buttons = handle.Root.querySelectorAll<HTMLButtonElement>("button.col");
        expect(Array.from(buttons).map((b) => b.dataset.column)).toEqual(["Name", "Email"]);
    });

    it("shows the popover when hovering an input and emits a binding on column click", () => {
        const onBind = vi.fn<(p: FieldBindingPayload) => void>();
        handle = mountFieldBindingOverlay({
            Columns: ["Email"],
            SampleRow: { Email: "a@x.com" },
            OnBind: onBind,
        });

        const input = document.createElement("input");
        input.type = "text";
        document.body.appendChild(input);
        moveOver(input);
        expect(handle.GetHoveredTarget()).toBe(input);

        const colBtn = handle.Root.querySelector<HTMLButtonElement>('button[data-column="Email"]');
        colBtn!.click();

        expect(onBind).toHaveBeenCalledTimes(1);
        const payload = onBind.mock.calls[0]![0];
        expect(payload.ColumnName).toBe("Email");
        expect(payload.Columns).toEqual(["Email"]);
        expect(payload.Template).toBe("{{Email}}");
        expect(payload.PreviewValue).toBe("a@x.com");
        expect(payload.Target).toBe(input);
    });

    it("does not show the popover for non-bindable elements", () => {
        handle = mountFieldBindingOverlay({ Columns: ["X"], OnBind: () => {} });
        const div = document.createElement("div");
        document.body.appendChild(div);
        moveOver(div);
        expect(handle.GetHoveredTarget()).toBeNull();
    });

    it("supports contenteditable elements", () => {
        const onBind = vi.fn<(p: FieldBindingPayload) => void>();
        handle = mountFieldBindingOverlay({ Columns: ["Note"], OnBind: onBind });
        const editable = document.createElement("div");
        editable.setAttribute("contenteditable", "true");
        document.body.appendChild(editable);
        moveOver(editable);
        expect(handle.GetHoveredTarget()).toBe(editable);
    });

    it("Destroy removes the host and detaches listeners", () => {
        handle = mountFieldBindingOverlay({ Columns: ["X"], OnBind: () => {} });
        handle.Destroy();
        expect(document.getElementById(FIELD_BINDING_HOST_ID)).toBeNull();
    });

    /* ---------------------------------------------------------------- */
    /*  Multi-column composer                                            */
    /* ---------------------------------------------------------------- */

    it("appends multiple {{Column}} tokens into the composer template", () => {
        const onBind = vi.fn<(p: FieldBindingPayload) => void>();
        handle = mountFieldBindingOverlay({
            Columns: ["First", "Last"],
            SampleRow: { First: "Ada", Last: "Lovelace" },
            OnBind: onBind,
        });

        const input = document.createElement("input");
        document.body.appendChild(input);
        clickOn(input); // pin → composer mode

        handle.Root.querySelector<HTMLButtonElement>('button[data-column="First"]')!.click();
        handle.Root.querySelector<HTMLButtonElement>('button[data-column="Last"]')!.click();

        expect(handle.GetTemplate()).toBe("{{First}}{{Last}}");
        expect(onBind).not.toHaveBeenCalled(); // composer mode does not auto-emit
    });

    it("renders a live preview by resolving every placeholder against SampleRow", () => {
        handle = mountFieldBindingOverlay({
            Columns: ["First", "Last"],
            SampleRow: { First: "Ada", Last: "Lovelace" },
            OnBind: () => {},
        });

        const input = document.createElement("input");
        document.body.appendChild(input);
        clickOn(input);

        const tInput = handle.Root.querySelector<HTMLInputElement>("input.template-input")!;
        tInput.value = "{{First}} {{Last}}";
        tInput.dispatchEvent(new Event("input", { bubbles: true }));

        const previewEl = handle.Root.querySelector<HTMLDivElement>("div.preview")!;
        expect(previewEl.textContent).toBe("Ada Lovelace");
        expect(previewEl.dataset.error).toBe("false");

        const tags = Array.from(handle.Root.querySelectorAll<HTMLSpanElement>("span.tag"))
            .map((t) => t.textContent);
        expect(tags).toEqual(["First", "Last"]);
    });

    it("flags unknown columns in the preview without crashing", () => {
        handle = mountFieldBindingOverlay({
            Columns: ["First"],
            SampleRow: { First: "Ada" },
            OnBind: () => {},
        });

        const input = document.createElement("input");
        document.body.appendChild(input);
        clickOn(input);

        const tInput = handle.Root.querySelector<HTMLInputElement>("input.template-input")!;
        tInput.value = "{{Missing}}";
        tInput.dispatchEvent(new Event("input", { bubbles: true }));

        const previewEl = handle.Root.querySelector<HTMLDivElement>("div.preview")!;
        expect(previewEl.dataset.error).toBe("true");
        expect(previewEl.textContent).toMatch(/Missing/);
    });

    it("Bind button emits the full multi-column template once", () => {
        const onBind = vi.fn<(p: FieldBindingPayload) => void>();
        handle = mountFieldBindingOverlay({
            Columns: ["First", "Last"],
            SampleRow: { First: "Ada", Last: "Lovelace" },
            OnBind: onBind,
        });

        const input = document.createElement("input");
        document.body.appendChild(input);
        clickOn(input);

        const tInput = handle.Root.querySelector<HTMLInputElement>("input.template-input")!;
        tInput.value = "{{First}} {{Last}}";
        tInput.dispatchEvent(new Event("input", { bubbles: true }));

        const bindBtn = handle.Root.querySelector<HTMLButtonElement>("button.btn-primary")!;
        expect(bindBtn.disabled).toBe(false);
        bindBtn.click();

        expect(onBind).toHaveBeenCalledTimes(1);
        const payload = onBind.mock.calls[0]![0];
        expect(payload.Template).toBe("{{First}} {{Last}}");
        expect(payload.Columns).toEqual(["First", "Last"]);
        expect(payload.ColumnName).toBe("First"); // first-occurrence column
        expect(payload.PreviewValue).toBe("Ada Lovelace");
        expect(payload.Target).toBe(input);
    });

    it("Bind button is disabled when the composer template is empty", () => {
        handle = mountFieldBindingOverlay({
            Columns: ["First"],
            OnBind: () => {},
        });

        const input = document.createElement("input");
        document.body.appendChild(input);
        clickOn(input);

        const bindBtn = handle.Root.querySelector<HTMLButtonElement>("button.btn-primary")!;
        expect(bindBtn.disabled).toBe(true);
    });
});
