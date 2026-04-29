/**
 * execution-next-preview unit tests.
 */

import { describe, it, expect } from "vitest";
import {
    buildExecutionNextPreview,
    describeNextNode,
    type PreviewStep,
    type StepLinks,
    type ProjectSummary,
} from "../execution-next-preview";

const steps: PreviewStep[] = [
    { StepId: 1, OrderIndex: 1, VariableName: "openLogin",  Label: "Open login" },
    { StepId: 2, OrderIndex: 2, VariableName: "fillEmail",  Label: "Type email" },
    { StepId: 3, OrderIndex: 3, VariableName: "submitForm", Label: "Click submit" },
];

describe("buildExecutionNextPreview", () => {
    it("links each step to the next one and ends the chain on the last step", () => {
        const preview = buildExecutionNextPreview({ steps });
        expect(preview).toHaveLength(3);
        expect(preview[0].Next).toEqual({ Kind: "Step", Step: steps[1] });
        expect(preview[1].Next).toEqual({ Kind: "Step", Step: steps[2] });
        expect(preview[2].Next).toEqual({ Kind: "End" });
        expect(preview.every((p) => p.OnSuccess === null && p.OnFailure === null)).toBe(true);
    });

    it("sorts steps by OrderIndex ASC regardless of input order", () => {
        const shuffled = [steps[2], steps[0], steps[1]];
        const preview = buildExecutionNextPreview({ steps: shuffled });
        expect(preview.map((p) => p.StepId)).toEqual([1, 2, 3]);
    });

    it("uses OnSuccess project as the default next when set", () => {
        const links = new Map<number, StepLinks>([
            [2, { OnSuccessProjectId: "checkout" }],
        ]);
        const projects = new Map<string, ProjectSummary>([
            ["checkout", { Slug: "checkout", Name: "Checkout flow" }],
        ]);
        const preview = buildExecutionNextPreview({ steps, links, projects });
        expect(preview[1].Next).toEqual({
            Kind: "Project",
            Project: { Slug: "checkout", Name: "Checkout flow" },
            Branch: "Success",
        });
        expect(preview[1].OnSuccess).toEqual(preview[1].Next);
    });

    it("surfaces OnFailure separately without overriding the default next", () => {
        const links = new Map<number, StepLinks>([
            [3, { OnFailureProjectId: "report-bug" }],
        ]);
        const preview = buildExecutionNextPreview({ steps, links });
        expect(preview[2].Next).toEqual({ Kind: "End" });
        expect(preview[2].OnFailure).toEqual({
            Kind: "Project",
            Project: { Slug: "report-bug", Name: "report-bug" },
            Branch: "Failure",
        });
    });

    it("falls back to the slug when the project lookup misses", () => {
        const links = new Map<number, StepLinks>([
            [1, { OnSuccessProjectId: "ghost-slug" }],
        ]);
        const preview = buildExecutionNextPreview({ steps, links });
        const next = preview[0].Next;
        expect(next.Kind).toBe("Project");
        if (next.Kind === "Project") {
            expect(next.Project.Slug).toBe("ghost-slug");
            expect(next.Project.Name).toBe("ghost-slug");
        }
    });
});

describe("describeNextNode", () => {
    it("renders friendly sentences for every node kind", () => {
        expect(describeNextNode({ Kind: "End" })).toBe("End of chain");
        expect(describeNextNode({ Kind: "Step", Step: steps[0] })).toContain("Step #1");
        expect(describeNextNode({
            Kind: "Project",
            Project: { Slug: "ck", Name: "Checkout" },
            Branch: "Success",
        })).toBe('Run project "Checkout" (success branch)');
    });
});
