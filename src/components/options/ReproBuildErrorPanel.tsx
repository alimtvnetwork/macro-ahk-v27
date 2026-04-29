/**
 * ReproBuildErrorPanel
 * --------------------
 * Presentation-only diagnostics panel. The extension UI cannot spawn shell
 * commands, so the "Reproduce build error" button:
 *   1. Shows the resolved import path for the `result-webhook` module.
 *   2. Copies the exact terminal command (`pnpm run repro:build`) to the
 *      clipboard so the developer can paste it into a terminal.
 *
 * The actual repro work is done by `scripts/repro-build-error.mjs`, which
 * runs `vite build --mode development` and prints the resolved path.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const REPRO_COMMAND = "pnpm run repro:build";
const RESULT_WEBHOOK_ALIAS_IMPORT =
  '@/background/recorder/step-library/result-webhook';
const RESULT_WEBHOOK_REL_PATH =
  "src/background/recorder/step-library/result-webhook.ts";

export function ReproBuildErrorPanel() {
  const [copied, setCopied] = useState(false);

  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText(REPRO_COMMAND);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Reproduce build error</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Re-runs <code className="font-mono">vite build --mode development</code>{" "}
          and prints the resolved import path for the{" "}
          <code className="font-mono">result-webhook</code> module.
        </p>
      </div>

      <div className="rounded-md border border-border bg-muted/40 p-3 space-y-1 text-xs font-mono">
        <div>
          <span className="text-muted-foreground">resolved path: </span>
          {RESULT_WEBHOOK_REL_PATH}
        </div>
        <div>
          <span className="text-muted-foreground">alias import : </span>
          {RESULT_WEBHOOK_ALIAS_IMPORT}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleClick}>
          {copied ? "Command copied ✓" : "Reproduce build error"}
        </Button>
        <code className="text-xs font-mono text-muted-foreground">
          {REPRO_COMMAND}
        </code>
      </div>
    </Card>
  );
}

export default ReproBuildErrorPanel;
