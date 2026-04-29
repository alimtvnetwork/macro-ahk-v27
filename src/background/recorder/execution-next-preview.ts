/**
 * Marco Extension — Execution Next Preview
 *
 * Pure helper that, given an ordered list of recorded Steps and an optional
 * lookup of cross-project links per step, returns "what runs after this
 * node" for every Step in the chain.
 *
 * The result powers the chain-graph "execution next" badge so the user can
 * see at a glance:
 *
 *   - The next Step in the same project (by `OrderIndex`).
 *   - The cross-project hand-off (`OnSuccessProjectId` /
 *     `OnFailureProjectId`) when the planned chaining feature is wired —
 *     the helper accepts an explicit `links` map so it works today (links
 *     resolve to `null`) and stays correct once the columns land.
 *   - The terminal end of the chain (no next node).
 *
 * Pure: no DOM, no chrome.*, no I/O. Easy to unit-test and call from any
 * surface (toolbar preview, options chain view, hover-card).
 *
 * @see spec/31-macro-recorder/14-step-chaining-and-cross-project-links.md
 */

export interface PreviewStep {
    readonly StepId: number;
    readonly OrderIndex: number;
    readonly VariableName: string;
    readonly Label: string;
}

export interface StepLinks {
    /** Extension project slug to dispatch when the step succeeds. */
    readonly OnSuccessProjectId?: string | null;
    /** Extension project slug to dispatch when the step fails. */
    readonly OnFailureProjectId?: string | null;
}

export interface ProjectSummary {
    readonly Slug: string;
    readonly Name: string;
}

export type NextNode =
    | { readonly Kind: "Step";    readonly Step: PreviewStep }
    | { readonly Kind: "Project"; readonly Project: ProjectSummary; readonly Branch: "Success" | "Failure" }
    | { readonly Kind: "End" };

export interface ExecutionNextPreview {
    readonly StepId: number;
    /** Default flow: the next step in the chain (or End). */
    readonly Next: NextNode;
    /** Hand-off when this step succeeds (also surfaced separately for branch UIs). */
    readonly OnSuccess: NextNode | null;
    /** Hand-off when this step fails. */
    readonly OnFailure: NextNode | null;
}

export interface BuildPreviewInput {
    readonly steps: ReadonlyArray<PreviewStep>;
    /** Map: StepId → cross-project link slugs. Missing keys = no link. */
    readonly links?: ReadonlyMap<number, StepLinks>;
    /** Map: project slug → display name. Missing keys render the slug verbatim. */
    readonly projects?: ReadonlyMap<string, ProjectSummary>;
}

/**
 * Compute the "execution next" preview for every step in the chain.
 * Steps are sorted by `OrderIndex` ASC so the output is independent of input
 * order.
 */
export function buildExecutionNextPreview(
    input: BuildPreviewInput,
): ReadonlyArray<ExecutionNextPreview> {
    const sorted = [...input.steps].sort((a, b) => a.OrderIndex - b.OrderIndex);
    const links = input.links ?? new Map<number, StepLinks>();
    const projects = input.projects ?? new Map<string, ProjectSummary>();

    return sorted.map((step, idx): ExecutionNextPreview => {
        const next = sorted[idx + 1];
        const link = links.get(step.StepId);

        const onSuccess = link?.OnSuccessProjectId !== undefined && link.OnSuccessProjectId !== null
            ? projectNode(link.OnSuccessProjectId, "Success", projects)
            : null;
        const onFailure = link?.OnFailureProjectId !== undefined && link.OnFailureProjectId !== null
            ? projectNode(link.OnFailureProjectId, "Failure", projects)
            : null;

        // Default flow: success branch wins over the sequential next when set.
        // Sequential fallback otherwise; End if neither.
        const defaultNext: NextNode = onSuccess !== null
            ? onSuccess
            : next !== undefined
                ? { Kind: "Step", Step: next }
                : { Kind: "End" };

        return {
            StepId: step.StepId,
            Next: defaultNext,
            OnSuccess: onSuccess,
            OnFailure: onFailure,
        };
    });
}

/** Human-readable "what runs next" sentence — handy for tooltips. */
export function describeNextNode(node: NextNode): string {
    if (node.Kind === "End")     return "End of chain";
    if (node.Kind === "Step")    return `Step #${node.Step.OrderIndex} — ${node.Step.VariableName}`;
    return `Run project "${node.Project.Name}" (${node.Branch.toLowerCase()} branch)`;
}

function projectNode(
    slug: string,
    branch: "Success" | "Failure",
    projects: ReadonlyMap<string, ProjectSummary>,
): NextNode {
    const summary = projects.get(slug) ?? { Slug: slug, Name: slug };
    return { Kind: "Project", Project: summary, Branch: branch };
}
