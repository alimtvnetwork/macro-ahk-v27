import { XPathKeyCode } from "./xpath-key-code";

/**
 * DefaultDelaysMs — wait-after-action defaults per XPath key.
 *
 * Conservative values; user-editable in popup, persisted to
 * `XPathSetting.DelayMs`, restored from this map on Reset.
 */
export const DefaultDelaysMs: Readonly<Record<XPathKeyCode, number>> = Object.freeze({
    [XPathKeyCode.LoginEmailInput]: 400,
    [XPathKeyCode.ContinueButton]: 800,
    [XPathKeyCode.PasswordInput]: 400,
    [XPathKeyCode.LoginButton]: 1500,
    [XPathKeyCode.WorkspaceButton]: 2000,
    [XPathKeyCode.SettingsButton]: 600,
    [XPathKeyCode.ProfileButton]: 600,
    [XPathKeyCode.SignOutButton]: 1200,
});
