import { BootDiagnosticsPanel } from "./BootDiagnosticsPanel";
import { RunStatsPanel } from "./RunStatsPanel";
import { LogViewerPanel } from "./LogViewerPanel";
import { XPathValidationPanel } from "./XPathValidationPanel";
import { AuthHealthPanel } from "./AuthHealthPanel";
import { TokenSeederDiagnosticsPanel } from "./TokenSeederDiagnosticsPanel";
import { OpfsSessionBrowserPanel } from "./OpfsSessionBrowserPanel";
import { ReproBuildErrorPanel } from "./ReproBuildErrorPanel";

export function GlobalDiagnosticsView() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold tracking-tight">Diagnostics</h2>
      <p className="text-xs text-muted-foreground">
        Boot diagnostics, run statistics, auth health, token seeder access errors, log viewer, OPFS browser, and XPath validation.
      </p>
      <AuthHealthPanel />
      <TokenSeederDiagnosticsPanel />
      <RunStatsPanel />
      <LogViewerPanel />
      <OpfsSessionBrowserPanel />
      <XPathValidationPanel />
      <BootDiagnosticsPanel />
      <ReproBuildErrorPanel />
    </div>
  );
}

export default GlobalDiagnosticsView;
