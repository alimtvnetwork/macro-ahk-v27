/**
 * Owner Switch — XPathSetting seeds.
 *
 * Built from the shared `lovable-common` defaults so a Reset (P18) restores
 * to the same source of truth that ships in code. Per-row delays seeded
 * separately as `DelayMs` (key-keyed) so the UI editor can edit both.
 */

import { DefaultXPaths } from "../../../lovable-common/src/xpath/default-xpaths";
import { DefaultDelaysMs } from "../../../lovable-common/src/xpath/default-delays";
import { XPathKeyCode } from "../../../lovable-common/src/xpath/xpath-key-code";

export interface XPathSettingSeed {
    KeyCode: XPathKeyCode;
    XPath: string;
    DelayMs: number;
}

const buildSeeds = (): ReadonlyArray<XPathSettingSeed> => {
    const out: XPathSettingSeed[] = [];

    for (const key of Object.values(XPathKeyCode)) {
        out.push({
            KeyCode: key,
            XPath: DefaultXPaths[key],
            DelayMs: DefaultDelaysMs[key],
        });
    }

    return Object.freeze(out);
};

export const XPATH_SETTING_SEEDS: ReadonlyArray<XPathSettingSeed> = buildSeeds();
