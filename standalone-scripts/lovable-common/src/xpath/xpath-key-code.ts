/**
 * XPathKeyCode — closed enum used by Lovable Owner Switch + User Add.
 *
 * Members must stay PascalCase to match the SQLite `XPathSetting.KeyCode`
 * column convention (mem://architecture/storage/database-naming-convention).
 */

export enum XPathKeyCode {
    LoginEmailInput = "LoginEmailInput",
    ContinueButton = "ContinueButton",
    PasswordInput = "PasswordInput",
    LoginButton = "LoginButton",
    WorkspaceButton = "WorkspaceButton",
    SettingsButton = "SettingsButton",
    ProfileButton = "ProfileButton",
    SignOutButton = "SignOutButton",
}
