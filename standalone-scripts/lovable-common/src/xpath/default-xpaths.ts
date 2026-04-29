import { XPathKeyCode } from "./xpath-key-code";

/**
 * DefaultXPaths — code-side source of truth restored on Reset.
 *
 * Captured from spec/.../70-lovable-owner-switch/03-xpaths-and-defaults.md
 * and spec/.../71-lovable-user-add/01-overview.md (identical defaults).
 */
export const DefaultXPaths: Readonly<Record<XPathKeyCode, string>> = Object.freeze({
    [XPathKeyCode.LoginEmailInput]: "/html/body/div[2]/div[1]/div/div[1]/main/div[2]/div/div/form/div/div[1]/div/input",
    [XPathKeyCode.ContinueButton]: "/html/body/div[2]/div[1]/div/div[1]/main/div[2]/div/div/form/div/div[2]/div[1]/div/button",
    [XPathKeyCode.PasswordInput]: "/html/body/div[2]/div[1]/div/div[1]/main/div[2]/div/div/form/div/div[1]/div[3]/input",
    [XPathKeyCode.LoginButton]: "/html/body/div[2]/div[1]/div/div[1]/main/div[2]/div/div/form/div/div[2]/div[1]/div[1]/button",
    [XPathKeyCode.WorkspaceButton]: "/html/body/div[2]/div[1]/div[2]/aside/div/div[2]/button",
    [XPathKeyCode.SettingsButton]: "/html/body/div[5]/div/div[2]/button[1]",
    [XPathKeyCode.ProfileButton]: "/html/body/div[2]/div[1]/div[2]/aside/div/div[4]/button",
    [XPathKeyCode.SignOutButton]: "/html/body/div[5]/div/div[7]",
});
