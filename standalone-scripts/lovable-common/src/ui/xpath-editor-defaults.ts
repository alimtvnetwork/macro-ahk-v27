/**
 * Shared XPath Editor — defaults builder.
 *
 * Pure function: builds the canonical `XPathEditorRow[]` from
 * `lovable-common`'s `DefaultXPaths` + `DefaultDelaysMs`. Used by
 * Reset and as the seed for first-time mounts.
 */

import { DefaultXPaths } from "../xpath/default-xpaths";
import { DefaultDelaysMs } from "../xpath/default-delays";
import { XPathKeyCode } from "../xpath/xpath-key-code";
import type { XPathEditorRow } from "./xpath-editor-types";

export const buildDefaultEditorRows = (): ReadonlyArray<XPathEditorRow> => {
    const out: XPathEditorRow[] = [];

    for (const key of Object.values(XPathKeyCode)) {
        out.push({
            KeyCode: key,
            XPath: DefaultXPaths[key],
            DelayMs: DefaultDelaysMs[key],
        });
    }

    return Object.freeze(out);
};
