import { XPathKeyCode } from "./xpath-key-code";

/**
 * XPathEntry — typed shape for `XPathSetting` rows surfaced to runtime
 * code (PascalCase fields match the SQLite column names directly).
 */
export interface XPathEntry {
    KeyCode: XPathKeyCode;
    Value: string;
    DelayMs: number;
    IsCustomized: boolean;
}
