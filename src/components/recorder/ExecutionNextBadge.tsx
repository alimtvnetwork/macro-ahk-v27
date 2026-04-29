/**
 * Marco Extension — Execution Next Badge
 *
 * Inline badge that renders below a step row to show "what runs next"
 * after this node: the next step, a linked extension project (success or
 * failure branch), or the end of the chain.
 *
 * Pure presentation. Compute the preview once with
 * `buildExecutionNextPreview` and pass the matching {@link ExecutionNextPreview}
 * down per row.
 */

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowRight, Flag, FolderInput, AlertTriangle } from "lucide-react";
import {
    describeNextNode,
    type ExecutionNextPreview,
    type NextNode,
} from "@/background/recorder/execution-next-preview";

interface ExecutionNextBadgeProps {
    readonly preview: ExecutionNextPreview;
}

function NodePill({ node, branch }: { node: NextNode; branch: "Default" | "Success" | "Failure" }) {
    const variant = branch === "Failure" ? "destructive"
        : node.Kind === "End" ? "outline"
        : node.Kind === "Project" ? "default"
        : "secondary";

    const Icon = node.Kind === "End"     ? Flag
              : node.Kind === "Project" ? FolderInput
              : ArrowRight;

    const label =
        node.Kind === "End" ? "End of chain"
      : node.Kind === "Step" ? `#${node.Step.OrderIndex} ${node.Step.VariableName}`
      : `→ ${node.Project.Name}`;

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Badge
                        variant={variant}
                        className="text-[10px] px-1.5 py-0 inline-flex items-center gap-1 max-w-[12rem] truncate"
                    >
                        <Icon className="h-3 w-3 shrink-0" aria-hidden />
                        <span className="truncate">{label}</span>
                    </Badge>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">
                    {describeNextNode(node)}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}

export function ExecutionNextBadge({ preview }: ExecutionNextBadgeProps) {
    const showFailureSeparately = preview.OnFailure !== null;

    return (
        <div className="flex flex-wrap items-center gap-1.5 pl-8 pr-2 pb-1">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Next</span>
            <NodePill node={preview.Next} branch="Default" />
            {showFailureSeparately && (
                <>
                    <AlertTriangle className="h-3 w-3 text-amber-500" aria-hidden />
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">on failure</span>
                    <NodePill node={preview.OnFailure!} branch="Failure" />
                </>
            )}
        </div>
    );
}
