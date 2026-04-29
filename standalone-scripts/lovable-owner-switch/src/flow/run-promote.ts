/**
 * Owner Switch — promote orchestrator.
 *
 * Three-step chain (ResolveWorkspace → ResolveUserId → PromoteToOwner).
 * Calls `LovableApiClient.promoteToOwner(...)` — the SAME method User
 * Add Step B will reuse (R12 invariant: only one PUT call site across
 * `standalone-scripts/lovable-*`).
 *
 * On failure, returns the exact `FailedStep` so the per-row store can
 * persist *which* sub-step broke (e.g. ResolveUserId vs PromoteToOwner)
 * for replay diagnosis. No rollback is attempted — failure marking
 * only (per operator direction).
 */

import { LovableApiClient } from "../../../lovable-common/src/api/lovable-api-client";
import { resolveUserId, resolveWorkspaceId } from "./promote-resolvers";
import { TtlCache } from "./ttl-cache";
import { PromoteStepCode } from "./promote-types";
import type { PromoteRowOutcome, PromoteRowRequest, PromoteRowResult } from "./promote-types";

export interface PromoteCaches {
    WorkspaceByLoginEmail: TtlCache<string>;
    UserIdByEmail: TtlCache<string>;
}

interface MeasuredString {
    DurationMs: number;
    Value: string;
}

const measureString = async (run: () => Promise<string>): Promise<MeasuredString> => {
    const startedAt = Date.now();
    const value = await run();

    return { DurationMs: Date.now() - startedAt, Value: value };
};

const measureVoid = async (run: () => Promise<unknown>): Promise<number> => {
    const startedAt = Date.now();
    await run();

    return Date.now() - startedAt;
};

interface ChainState {
    Outcomes: PromoteRowOutcome[];
    WorkspaceId: string;
    UserId: string;
}

interface StepTaggedError extends Error {
    step: PromoteStepCode;
}

const failingStep = (caught: unknown, fallback: PromoteStepCode): PromoteStepCode => {
    if (caught instanceof Error && "step" in caught && typeof (caught as { step?: unknown }).step === "string") {
        return (caught as { step: PromoteStepCode }).step;
    }

    return fallback;
};

const tagAndThrow = (caught: unknown, fallback: PromoteStepCode): never => {
    throw Object.assign(
        new Error(caught instanceof Error ? caught.message : String(caught)),
        { step: failingStep(caught, fallback) },
    ) as StepTaggedError;
};

const runChain = async (
    api: LovableApiClient,
    caches: PromoteCaches,
    request: PromoteRowRequest,
): Promise<ChainState> => {
    let ws: MeasuredString;

    try {
        ws = await measureString(() =>
            resolveWorkspaceId(api, caches.WorkspaceByLoginEmail, request.LoginEmail));
    } catch (caught: unknown) {
        return tagAndThrow(caught, PromoteStepCode.ResolveWorkspace);
    }

    let uid: MeasuredString;

    try {
        uid = await measureString(() =>
            resolveUserId(api, caches.UserIdByEmail, ws.Value, request.OwnerEmail));
    } catch (caught: unknown) {
        return tagAndThrow(caught, PromoteStepCode.ResolveUserId);
    }

    let promoMs: number;

    try {
        promoMs = await measureVoid(() => api.promoteToOwner(ws.Value, uid.Value));
    } catch (caught: unknown) {
        return tagAndThrow(caught, PromoteStepCode.PromoteToOwner);
    }

    return {
        Outcomes: [
            { Step: PromoteStepCode.ResolveWorkspace, DurationMs: ws.DurationMs, WorkspaceId: ws.Value, UserId: null },
            { Step: PromoteStepCode.ResolveUserId, DurationMs: uid.DurationMs, WorkspaceId: ws.Value, UserId: uid.Value },
            { Step: PromoteStepCode.PromoteToOwner, DurationMs: promoMs, WorkspaceId: ws.Value, UserId: uid.Value },
        ],
        WorkspaceId: ws.Value,
        UserId: uid.Value,
    };
};

const failureFrom = (caught: unknown): PromoteRowResult => {
    const step = caught instanceof Error && "step" in caught
        ? (caught as { step: PromoteStepCode }).step
        : null;

    return {
        Outcomes: [],
        FailedStep: step,
        Error: caught instanceof Error ? caught.message : String(caught),
    };
};

export const runPromote = async (
    api: LovableApiClient,
    caches: PromoteCaches,
    request: PromoteRowRequest,
): Promise<PromoteRowResult> => {
    try {
        const chain = await runChain(api, caches, request);

        return { Outcomes: chain.Outcomes, FailedStep: null, Error: null };
    } catch (caught: unknown) {
        return failureFrom(caught);
    }
};
