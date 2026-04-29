/**
 * Verifies the inline help tooltip in the Sequence rename dialog renders the
 * documented {n} + Separator example text.
 *
 * Radix Tooltip portals its content into document.body on hover/focus. We
 * trigger the tooltip by focusing its trigger button (the help icon) — this is
 * the keyboard-accessible path and is reliable in jsdom (mouse-hover timing
 * via Radix's pointer detection is flaky in jsdom).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

import { BulkRenameSequenceDialog } from "@/components/recorder/KeywordEventBulkContextMenu";

describe("BulkRenameSequenceDialog help tooltip", () => {
    beforeEach(() => {
        try { localStorage.clear(); } catch { /* jsdom may throw in odd setups */ }
    });

    function renderOpen(): void {
        render(
            <BulkRenameSequenceDialog
                open
                onOpenChange={() => {}}
                selectedEvents={[
                    { Id: "a", Keyword: "alpha", Enabled: true } as never,
                    { Id: "b", Keyword: "beta", Enabled: true } as never,
                ]}
                allEvents={[]}
                onApply={() => {}}
            />,
        );
    }

    it("exposes a help trigger with an accessible label", () => {
        renderOpen();
        const trigger = screen.getByTestId("keyword-events-bulk-rename-help");
        expect(trigger).toHaveAttribute("aria-label", "How {n} and Separator work");
    });

    it("reveals the {n} + Separator example text when focused", async () => {
        renderOpen();
        const trigger = screen.getByTestId("keyword-events-bulk-rename-help");

        await act(async () => {
            trigger.focus();
            fireEvent.focus(trigger);
            fireEvent.pointerEnter(trigger);
            fireEvent.mouseEnter(trigger);
            // Allow Radix's open-delay (150ms) to elapse.
            await new Promise(r => setTimeout(r, 200));
        });

        // Radix portals the tooltip — search the whole document.
        const bodyText = document.body.textContent ?? "";

        expect(bodyText).toContain("How sequencing works");
        expect(bodyText).toContain("{n}");
        expect(bodyText).toContain("Login {n}");
        expect(bodyText).toContain("Login 01");
        expect(bodyText).toContain("Login 02");
        expect(bodyText).toContain("Separator");
        expect(bodyText).toContain("Step-01");
    });
});
