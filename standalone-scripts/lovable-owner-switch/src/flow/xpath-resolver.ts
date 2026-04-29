/**
 * Lovable login flow — XPath + delay resolver.
 *
 * Reads the live `XPathSetting` row for a given `XPathKeyCode` (P5 seeds
 * the shared defaults; P18 makes them user-editable). Returns a typed
 * pair so the caller doesn't have to remember PascalCase column names.
 */

import { DefaultXPaths } from "../../../lovable-common/src/xpath/default-xpaths";
import { DefaultDelaysMs } from "../../../lovable-common/src/xpath/default-delays";
import { XPathKeyCode } from "../../../lovable-common/src/xpath/xpath-key-code";
import type { XPathSettingSeed } from "../migrations/xpath-setting-seed";

export interface ResolvedXPath {
    XPath: string;
    DelayMs: number;
}

const fromDefaults = (key: XPathKeyCode): ResolvedXPath => ({
    XPath: DefaultXPaths[key],
    DelayMs: DefaultDelaysMs[key],
});

export const resolveXPath = (
    key: XPathKeyCode,
    overrides: ReadonlyArray<XPathSettingSeed>,
): ResolvedXPath => {
    const match = overrides.find((row) => row.KeyCode === key);

    if (match === undefined) {
        return fromDefaults(key);
    }

    return { XPath: match.XPath, DelayMs: match.DelayMs };
};
