/**
 * Payment Banner Hider — Shared types & constants.
 *
 * Extracted from index.ts so the class file stays focused on behaviour
 * and the state machine has a single source of truth (CQ3 — no magic
 * strings).
 */

/** Lifecycle states of a matched banner element. */
export enum BannerState {
    Fading = "fading",
    Hiding = "hiding",
    Done = "done",
}

/** DOM attribute used both for state tracking AND CSS scoping. */
export const STATE_ATTR = "data-marco-banner-hider";

/** Exact text the banner must contain to be acted on. */
export const TARGET_TEXT = "Payment issue detected.";

/** XPath of the sticky banner inside the Lovable shell. */
export const TARGET_XPATH = "/html/body/div[2]/main/div/div[1]";

/** Time after which the banner is fully collapsed and display:none-d. */
export const REMOVE_DELAY_MS = 1000;

/** Debounce window for MutationObserver-driven check() calls. */
export const OBSERVER_DEBOUNCE_MS = 100;

/** Public surface exposed on `window` for debugging. */
export interface PaymentBannerHiderApi {
    readonly version: string;
    check(): void;
}
