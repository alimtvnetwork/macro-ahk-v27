/**
 * Lovable login flow — orchestrator.
 *
 * Runs the 6-step login chain in order; halts on the first thrown step
 * and surfaces the failed `LoginStepCode` to the caller. No retries
 * (mem://constraints/no-retry-policy) — fail-fast and let the per-row
 * state machine (P10) record `HasError = 1` + `LastError`.
 */

import { XPathKeyCode } from "../../../lovable-common/src/xpath/xpath-key-code";
import { LoginStepCode } from "./login-types";
import {
    stepAwaitWorkspace,
    stepClick,
    stepFillEmail,
    stepFillPassword,
    stepNavigate,
} from "./login-steps";
import type { LoginFlowOptions, LoginStepOutcome } from "./login-types";
import type { XPathSettingSeed } from "../migrations/xpath-setting-seed";

export interface LoginRunResult {
    Outcomes: ReadonlyArray<LoginStepOutcome>;
    FailedStep: LoginStepCode | null;
    Error: string | null;
}

const runChain = async (
    options: LoginFlowOptions,
    overrides: ReadonlyArray<XPathSettingSeed>,
): Promise<LoginStepOutcome[]> => {
    const out: LoginStepOutcome[] = [];
    out.push(await stepNavigate(options.LoginUrl));
    out.push(await stepFillEmail(options.Credentials, overrides));
    out.push(await stepClick(XPathKeyCode.ContinueButton, LoginStepCode.ClickContinue, overrides));
    out.push(await stepFillPassword(options.Credentials, overrides));
    out.push(await stepClick(XPathKeyCode.LoginButton, LoginStepCode.ClickLogin, overrides));
    out.push(await stepAwaitWorkspace(overrides));

    return out;
};

const failureFrom = (caught: unknown, lastStep: LoginStepCode | null): LoginRunResult => ({
    Outcomes: [],
    FailedStep: lastStep,
    Error: caught instanceof Error ? caught.message : String(caught),
});

export const runLogin = async (
    options: LoginFlowOptions,
    overrides: ReadonlyArray<XPathSettingSeed>,
): Promise<LoginRunResult> => {
    try {
        const outcomes = await runChain(options, overrides);

        return { Outcomes: outcomes, FailedStep: null, Error: null };
    } catch (caught: unknown) {
        return failureFrom(caught, null);
    }
};
