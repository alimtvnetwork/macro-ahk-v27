/**
 * Lovable login flow — typed input bundle.
 *
 * One immutable bundle per row execution. Built by P10 from
 * `OwnerSwitchCsvRow` + the task's `CommonPassword` fallback.
 */

export interface LoginCredentials {
    LoginEmail: string;
    Password: string;
}

export interface LoginFlowOptions {
    Credentials: LoginCredentials;
    LoginUrl: string;
}

export enum LoginStepCode {
    NavigateToLogin = "NavigateToLogin",
    FillEmail = "FillEmail",
    ClickContinue = "ClickContinue",
    FillPassword = "FillPassword",
    ClickLogin = "ClickLogin",
    AwaitWorkspace = "AwaitWorkspace",
}

export interface LoginStepOutcome {
    Step: LoginStepCode;
    DurationMs: number;
}
