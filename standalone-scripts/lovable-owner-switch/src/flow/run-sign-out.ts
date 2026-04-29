/**
 * Owner Switch — sign-out flow.
 *
 * Profile → SignOut → settle delay. Q6 default: failure here is
 * logged but does NOT mark the row as failed (the promote already
 * succeeded; sign-out is best-effort cleanup before the next row).
 */

import { XPathKeyCode } from "../../../lovable-common/src/xpath/xpath-key-code";
import { clickButton } from "./dom-actions";
import { waitForXPath } from "./wait-for-xpath";
import { resolveXPath } from "./xpath-resolver";
import type { XPathSettingSeed } from "../migrations/xpath-setting-seed";

export enum SignOutStepCode {
    ClickProfile = "ClickProfile",
    ClickSignOut = "ClickSignOut",
}

export interface SignOutResult {
    Succeeded: boolean;
    DurationMs: number;
    Error: string | null;
}

const clickXPath = async (
    key: XPathKeyCode,
    overrides: ReadonlyArray<XPathSettingSeed>,
): Promise<void> => {
    const resolved = resolveXPath(key, overrides);
    await waitForXPath(resolved.XPath);
    clickButton(resolved.XPath);
    await new Promise<void>((r) => globalThis.setTimeout(r, resolved.DelayMs));
};

export const runSignOut = async (
    overrides: ReadonlyArray<XPathSettingSeed>,
): Promise<SignOutResult> => {
    const startedAt = Date.now();

    try {
        await clickXPath(XPathKeyCode.ProfileButton, overrides);
        await clickXPath(XPathKeyCode.SignOutButton, overrides);

        return { Succeeded: true, DurationMs: Date.now() - startedAt, Error: null };
    } catch (caught: unknown) {
        const message = caught instanceof Error ? caught.message : String(caught);

        return { Succeeded: false, DurationMs: Date.now() - startedAt, Error: message };
    }
};
