/**
 * Spec: spec/21-app/01-chrome-extension/home-screen-modification/08-up-down-step-controls.md
 * DOM-construction helpers for the nav-controls module.
 */
export const NavControlClasses = {
    WRAPPER: "mt-1 flex items-center gap-1 px-2",
    BUTTON: "rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-white hover:bg-white/10",
    INPUT: "w-12 rounded-md border border-white/10 bg-white/5 px-1 py-0.5 text-xs text-white text-center",
} as const;

export const NAV_ATTR = "data-marco-home";
export const NAV_WRAPPER_VALUE = "nav-controls";
export const NAV_UP_VALUE = "nav-up";
export const NAV_DOWN_VALUE = "nav-down";
export const NAV_STEP_VALUE = "nav-step";

export function buildNavWrapper(): HTMLDivElement {
    const w = document.createElement("div");
    w.className = NavControlClasses.WRAPPER;
    w.setAttribute(NAV_ATTR, NAV_WRAPPER_VALUE);
    w.appendChild(buildNavButton(NAV_UP_VALUE, "▲", "Previous workspace"));
    w.appendChild(buildNavButton(NAV_DOWN_VALUE, "▼", "Next workspace"));
    w.appendChild(buildStepInput());
    return w;
}

function buildNavButton(marker: string, label: string, aria: string): HTMLButtonElement {
    const b = document.createElement("button");
    b.className = NavControlClasses.BUTTON;
    b.setAttribute(NAV_ATTR, marker);
    b.setAttribute("aria-label", aria);
    b.textContent = label;
    return b;
}

function buildStepInput(): HTMLInputElement {
    const i = document.createElement("input");
    i.className = NavControlClasses.INPUT;
    i.setAttribute(NAV_ATTR, NAV_STEP_VALUE);
    i.type = "number";
    i.min = "1";
    i.value = "1";
    i.setAttribute("aria-label", "Step size");
    return i;
}
