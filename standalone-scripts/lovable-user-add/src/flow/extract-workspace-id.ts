/**
 * User Add — WorkspaceUrl → WorkspaceId extractor.
 *
 * Lovable workspace URLs follow `https://lovable.dev/projects/{id}`
 * or `https://lovable.dev/workspaces/{id}`. We parse the URL, accept
 * both path segments, and return the trailing identifier. Throws a
 * typed Error on malformed input so the orchestrator records a
 * clean Step A failure.
 *
 * Pure function. Used by `run-step-a.ts` (P15) and reusable by P17
 * if the state machine wants to validate URLs ahead of time.
 */

const VALID_PATH_SEGMENTS: ReadonlyArray<string> = ["projects", "workspaces"];

const findWorkspaceSegment = (segments: ReadonlyArray<string>): number => {
    for (let i = 0; i < segments.length; i += 1) {
        if (VALID_PATH_SEGMENTS.includes(segments[i])) {
            return i;
        }
    }

    return -1;
};

export const extractWorkspaceId = (workspaceUrl: string): string => {
    const parsed = new URL(workspaceUrl);
    const segments = parsed.pathname.split("/").filter((s) => s.length > 0);
    const idx = findWorkspaceSegment(segments);

    if (idx === -1 || idx + 1 >= segments.length) {
        throw new Error(`Workspace URL missing /projects/{id} or /workspaces/{id}: ${workspaceUrl}`);
    }

    const id = segments[idx + 1];

    if (id.length === 0) {
        throw new Error(`Workspace URL has empty id segment: ${workspaceUrl}`);
    }

    return id;
};
