/**
 * Global type augmentations for Payment Banner Hider.
 *
 * Declared here so the entry point can assign to `window.PaymentBannerHider`
 * without `as unknown as ...` casts (per the no-type-casting standard).
 *
 * Optional Logger surface mirrors the runtime contract used by sibling
 * standalone scripts (xpath, macro-controller). It is optional because
 * the script may load before marco-sdk in some test harnesses; the
 * class falls back to console.error when absent — never swallows.
 */

import type { PaymentBannerHiderApi } from "./types";

declare global {
    interface RiseupAsiaMacroExtLogger {
        error: (fn: string, msg: string, error?: unknown) => void;
    }

    interface RiseupAsiaMacroExtNamespace {
        Logger?: RiseupAsiaMacroExtLogger;
    }

    interface Window {
        PaymentBannerHider?: PaymentBannerHiderApi;
        RiseupAsiaMacroExt?: RiseupAsiaMacroExtNamespace;
    }
}

export {};
