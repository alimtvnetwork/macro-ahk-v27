/**
 * SyncBadge — Cross-Project Sync status indicator
 *
 * Extracted from LibraryView.tsx so non-lazy consumers (ProjectScriptSelector,
 * PromptManagerPanel) can import it without pulling the entire LibraryView
 * module — which is dynamically imported by Options.tsx and must remain in
 * its own chunk for the bundle splitter to work.
 */

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ArrowUpCircle, Pin, RefreshCw, Unlink } from "lucide-react";

export type LinkState = "synced" | "pinned" | "detached";

interface SyncBadgeProps {
  state: LinkState;
  pinnedVersion?: string | null;
  updateAvailable?: boolean;
}

export function SyncBadge({ state, pinnedVersion, updateAvailable }: SyncBadgeProps) {
  const config: Record<LinkState, { label: string; className: string; icon: typeof RefreshCw }> = {
    synced: {
      label: "Synced",
      className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
      icon: RefreshCw,
    },
    pinned: {
      label: pinnedVersion ? `Pinned @ ${pinnedVersion}` : "Pinned",
      className: "bg-amber-500/15 text-amber-400 border-amber-500/30",
      icon: Pin,
    },
    detached: {
      label: "Detached",
      className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
      icon: Unlink,
    },
  };

  const { label, className, icon: Icon } = config[state];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1">
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 gap-1 ${className}`}>
              <Icon className="h-2.5 w-2.5" />
              {label}
            </Badge>
            {updateAvailable && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1 bg-amber-500/20 text-amber-300 border-amber-400/40 animate-pulse">
                <ArrowUpCircle className="h-2.5 w-2.5" />
                Update Available
              </Badge>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {state === "synced" && "Auto-updates when library version changes"}
          {state === "pinned" && !updateAvailable && `Locked to version ${pinnedVersion ?? "unknown"}. Manual update only.`}
          {state === "pinned" && updateAvailable && `Pinned at ${pinnedVersion} — a newer version is available in the library`}
          {state === "detached" && "Independent copy — no longer linked to library"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
