/**
 * Marco Extension — Condition Step Routing (Spec 18 §4.2 + §5)
 *
 * Pure helpers for resolving the `OnTrue` / `OnFalse` route of a
 * StepKindId=8 Condition step into a concrete cursor move within the
 * current step group, with a hard cap on jumps to detect loops.
 */

export type RouteAction =
    | { readonly Kind: "Continue" }
    | { readonly Kind: "GoToLabel"; readonly Label: string }
    | { readonly Kind: "GoToStepId"; readonly StepId: number }
    | { readonly Kind: "RunGroup"; readonly StepGroupId: number }
    | { readonly Kind: "EndRun"; readonly Outcome: "Pass" | "Fail" };

export const MAX_ROUTE_JUMPS = 256;

export interface RouteableStep {
    readonly StepId: number;
    readonly Label: string;
}

export type RouteResolution =
    | { readonly Kind: "Cursor"; readonly NextIndex: number; readonly JumpsUsed: number }
    | { readonly Kind: "RunGroup"; readonly StepGroupId: number; readonly NextIndex: number; readonly JumpsUsed: number }
    | { readonly Kind: "End"; readonly Outcome: "Pass" | "Fail"; readonly JumpsUsed: number }
    | { readonly Kind: "Error"; readonly Reason: "InvalidRouteTarget" | "RouteLoopDetected"; readonly Detail: string };

export interface RouteContext {
    readonly Steps: ReadonlyArray<RouteableStep>;
    readonly CurrentIndex: number;
    readonly JumpsUsed: number;
}

export function resolveRoute(action: RouteAction, ctx: RouteContext): RouteResolution {
    const nextJumps = ctx.JumpsUsed + 1;
    if (nextJumps > MAX_ROUTE_JUMPS) {
        return {
            Kind: "Error",
            Reason: "RouteLoopDetected",
            Detail: `Route jumps exceeded ${MAX_ROUTE_JUMPS}`,
        };
    }

    switch (action.Kind) {
        case "Continue":
            return { Kind: "Cursor", NextIndex: ctx.CurrentIndex + 1, JumpsUsed: nextJumps };

        case "EndRun":
            return { Kind: "End", Outcome: action.Outcome, JumpsUsed: nextJumps };

        case "GoToLabel": {
            const idx = ctx.Steps.findIndex((s) => s.Label === action.Label);
            if (idx < 0) {
                return {
                    Kind: "Error",
                    Reason: "InvalidRouteTarget",
                    Detail: `No step with Label='${action.Label}' in current group`,
                };
            }
            return { Kind: "Cursor", NextIndex: idx, JumpsUsed: nextJumps };
        }

        case "GoToStepId": {
            const idx = ctx.Steps.findIndex((s) => s.StepId === action.StepId);
            if (idx < 0) {
                return {
                    Kind: "Error",
                    Reason: "InvalidRouteTarget",
                    Detail: `No step with StepId=${action.StepId} in current group`,
                };
            }
            return { Kind: "Cursor", NextIndex: idx, JumpsUsed: nextJumps };
        }

        case "RunGroup":
            return {
                Kind: "RunGroup",
                StepGroupId: action.StepGroupId,
                NextIndex: ctx.CurrentIndex + 1,
                JumpsUsed: nextJumps,
            };
    }
}
