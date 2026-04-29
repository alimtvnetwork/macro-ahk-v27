import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Copy, Check, Download, MousePointerClick, Code2, ListChecks, Database, Terminal, FileWarning, ShieldOff } from "lucide-react";
import { readClickTrail, type ClickTrailEntry } from "@/lib/click-trail";
import { useBenignWarningStats } from "@/hooks/use-benign-warning-stats";
import type { BenignWarningTally } from "@/lib/benign-warnings";

/** Structured per-failure context — see BootErrorContext in shared/messages.ts. */
export interface BootErrorContext {
  sql: string | null;
  migrationVersion: number | null;
  migrationDescription: string | null;
  scope: string | null;
}

/** WASM HEAD-probe snapshot — see WasmProbeResult in shared/messages.ts. */
export interface WasmProbeResult {
  url: string;
  status: number | null;
  contentLength: string | null;
  headError: string | null;
  ok: boolean;
  at: string;
}

interface BootFailureBannerProps {
  bootStep?: string;
  /** Underlying error message captured by the background service worker. */
  bootError?: string | null;
  /** Underlying error stack trace captured by the background service worker. */
  bootErrorStack?: string | null;
  /** Structured failing-operation context (SQL + migration step), if known. */
  bootErrorContext?: BootErrorContext | null;
  /**
   * Snapshot of the upfront HEAD probe against the bundled WASM asset.
   * Includes status code, content-length, and any head-side error so users
   * can diagnose `wasm-missing` failures without opening the SW console.
   */
  wasmProbe?: WasmProbeResult | null;
  /**
   * Trail of UI actions captured at the moment of failure. When provided,
   * the banner renders this snapshot INSTEAD of the live sessionStorage
   * trail so the "Recent actions" section stays pinned to the failure
   * cause across popup re-opens. Falls back to live trail when null.
   */
  frozenTrail?: ClickTrailEntry[] | null;
  /**
   * Stable failure fingerprint (`failed:<step>|<msg-prefix>`) — included in
   * support reports so multiple bundles from the same underlying failure
   * can be correlated across popup re-opens and SW restarts.
   */
  failureId?: string | null;
  /** ISO timestamp of when the failure was first persisted (snapshot time). */
  failureAt?: string | null;
}

/**
 * Renders a rich diagnostic banner when the background service worker
 * boot sequence has failed. Shows:
 *  - The failed step
 *  - The underlying error message
 *  - Cause-classified, numbered fix steps
 *  - A collapsible stack trace
 *  - A collapsible trail of recent UI actions
 *  - A "copy report" button that bundles everything for support
 */
// eslint-disable-next-line max-lines-per-function, sonarjs/cognitive-complexity -- top-level boot-failure UI: probes + collapsibles + copy-report all need shared state closure
export function BootFailureBanner({ bootStep, bootError, bootErrorStack, bootErrorContext, wasmProbe, frozenTrail, failureId, failureAt }: BootFailureBannerProps) {
  const [showStack, setShowStack] = useState(false);
  const [showTrail, setShowTrail] = useState(false);
  const [showProbe, setShowProbe] = useState(true);
  const [showSuppressed, setShowSuppressed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sqlCopied, setSqlCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  // Report verbosity toggle — "short" omits stack trace, click trail, fix
  // steps, and SQL body (keeping only the correlation header, op summary,
  // WASM probe, and benign tally totals). "full" includes everything.
  // Persisted across mounts so users keep their preferred default.
  const [reportMode, setReportMode] = useState<"short" | "full">(() => {
    try {
      const saved = localStorage.getItem("marco_support_report_mode");
      return saved === "short" ? "short" : "full";
    } catch { // allow-swallow: localStorage may be denied; safe default is "full"
      return "full";
    }
  });
  const setReportModePersisted = (mode: "short" | "full"): void => {
    setReportMode(mode);
    try { localStorage.setItem("marco_support_report_mode", mode); } catch { /* storage denied */ }
  };
  // Tally of warnings the activity timeline filtered out — disclosed in the
  // support report so the suppression is auditable. `bumpKey` is keyed on
  // `bootStep` so the count refreshes when the failure identity changes.
  const benignTally = useBenignWarningStats(bootStep === undefined ? 0 : bootStep.length);

  if (!bootStep || !bootStep.startsWith("failed:")) return null;

  const failedStep = bootStep.replace("failed:", "");
  const cause = classifyCause(failedStep, bootError);
  const fixSteps = getFixSteps(cause);
  // Prefer the frozen snapshot (captured at moment of failure) — fall back to
  // the live trail only when no snapshot was preserved (e.g. preview context).
  const trail = frozenTrail ?? readClickTrail();
  const isFrozen = frozenTrail !== null && frozenTrail !== undefined;
  const ctx = bootErrorContext ?? null;
  const probe = wasmProbe ?? null;
  const failId = failureId ?? null;
  const failAt = failureAt ?? null;

  const buildCurrentReport = (): string =>
    buildReport({
      failedStep, cause, bootError, bootErrorStack, bootErrorContext: ctx, wasmProbe: probe,
      fixSteps, trail, isFrozenTrail: isFrozen, failureId: failId, failureAt: failAt,
      benignTally, mode: reportMode,
    });

  const handleCopyReport = async () => {
    try {
      await navigator.clipboard.writeText(buildCurrentReport());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { // allow-swallow: clipboard denied; textarea fallback stays visible
    }
  };

  const handleCopySql = async () => {
    if (ctx?.sql === null || ctx?.sql === undefined) return;
    try {
      await navigator.clipboard.writeText(ctx.sql);
      setSqlCopied(true);
      setTimeout(() => setSqlCopied(false), 2000);
    } catch { // allow-swallow: clipboard denied; snippet stays visible for manual copy
    }
  };

  /**
   * Saves the same plain-text bundle returned by `buildCurrentReport()` as a
   * downloadable `.txt` file. Filename embeds the failed step + an ISO-ish
   * timestamp so multiple reports from the same browser don't clobber each
   * other in the user's Downloads folder. Uses a transient `<a>` + Blob URL
   * pattern that works in both the popup and the Lovable preview.
   */
  const handleDownloadReport = () => {
    try {
      const report = buildCurrentReport();
      const blob = new Blob([report], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const safeStep = failedStep.replace(/[^a-z0-9-]+/gi, "-");
      const a = document.createElement("a");
      a.href = url;
      a.download = `marco-support-report-${reportMode}-${safeStep}-${stamp}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Defer revoke so Chrome can finish the download.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 2000);
    } catch { // allow-swallow: Blob/URL unavailable in sandbox; Copy report still works
    }
  };

  return (
    <div className="mx-4 mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 space-y-2.5">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-destructive">
            Boot failed at step: <span className="font-mono">{failedStep}</span>
            <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-destructive/20 text-destructive uppercase tracking-wide">
              {cause.label}
            </span>
          </p>
          {bootError ? (
            <p className="text-[11px] text-destructive/90 font-mono break-words whitespace-pre-wrap mt-1">
              {bootError}
            </p>
          ) : null}
        </div>
        <div className="shrink-0 flex items-center gap-1.5">
          {/* Short ⇄ Full report mode — applies to both Copy and Download. */}
          <div
            role="group"
            aria-label="Support report verbosity"
            className="inline-flex items-center rounded border border-destructive/40 overflow-hidden text-[10px] font-medium"
          >
            <button
              onClick={() => setReportModePersisted("short")}
              className={`px-1.5 py-1 transition-colors ${reportMode === "short" ? "bg-destructive/30 text-destructive" : "text-destructive/70 hover:bg-destructive/10"}`}
              title="Short report — correlation header + summary only (no stack, no click trail)"
              aria-pressed={reportMode === "short"}
            >
              Short
            </button>
            <button
              onClick={() => setReportModePersisted("full")}
              className={`px-1.5 py-1 transition-colors border-l border-destructive/40 ${reportMode === "full" ? "bg-destructive/30 text-destructive" : "text-destructive/70 hover:bg-destructive/10"}`}
              title="Full report — includes suggested fix, stack trace, SQL body, and recent UI actions"
              aria-pressed={reportMode === "full"}
            >
              Full
            </button>
          </div>
          <button
            onClick={handleCopyReport}
            className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded border border-destructive/40 hover:bg-destructive/20 text-destructive transition-colors"
            title={`Copy ${reportMode} diagnostic report to clipboard`}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy report"}
          </button>
          <button
            onClick={handleDownloadReport}
            className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded border border-destructive/40 hover:bg-destructive/20 text-destructive transition-colors"
            title={`Download ${reportMode} diagnostic report as a .txt file`}
          >
            {downloaded ? <Check className="h-3 w-3" /> : <Download className="h-3 w-3" />}
            {downloaded ? "Saved" : "Create support report"}
          </button>
        </div>
      </div>

      {/* ── Failing operation (SQL / migration step) ───────── */}
      {ctx !== null && (ctx.sql !== null || ctx.migrationDescription !== null || ctx.scope !== null) ? (
        <div className="rounded border border-destructive/30 bg-background/40 p-2 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Database className="h-3 w-3 text-destructive shrink-0" />
              <span className="text-[11px] font-semibold text-destructive uppercase tracking-wide truncate">
                Failing operation
              </span>
            </div>
            {ctx.sql !== null ? (
              <button
                onClick={handleCopySql}
                className="shrink-0 inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border border-destructive/40 hover:bg-destructive/20 text-destructive transition-colors"
                title="Copy failing SQL statement to clipboard"
              >
                {sqlCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {sqlCopied ? "Copied" : "Copy SQL"}
              </button>
            ) : null}
          </div>

          {/* Migration / scope metadata pills */}
          <div className="flex flex-wrap gap-1.5 text-[10px]">
            {ctx.migrationVersion !== null ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-destructive/10 border border-destructive/30 text-destructive font-mono">
                migration v{ctx.migrationVersion}
              </span>
            ) : null}
            {ctx.migrationDescription !== null ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-destructive/10 border border-destructive/30 text-destructive">
                step: {ctx.migrationDescription}
              </span>
            ) : null}
            {ctx.scope !== null ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-destructive/10 border border-destructive/30 text-destructive font-mono">
                scope: {ctx.scope}
              </span>
            ) : null}
          </div>

          {/* Copyable failing-statement snippet */}
          {ctx.sql !== null ? (
            <div className="relative">
              <div className="flex items-center gap-1 mb-1">
                <Terminal className="h-3 w-3 text-destructive/70" />
                <span className="text-[10px] font-medium text-destructive/70 uppercase tracking-wider">
                  Failing statement
                </span>
              </div>
              <pre className="text-[10px] font-mono text-destructive/90 bg-background/60 rounded p-2 overflow-x-auto max-h-40 whitespace-pre-wrap break-words border border-destructive/20">
{ctx.sql}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── WASM HEAD probe (collapsible, shown whenever the probe ran) ─ */}
      {probe !== null ? (
        <CollapsibleSection
          icon={<FileWarning className="h-3 w-3" />}
          // eslint-disable-next-line sonarjs/no-nested-template-literals -- inline label formatting; helper would obscure the one-line summary
          label={`WASM probe — ${probe.ok ? "ok" : "failed"} (${probe.status !== null ? `HTTP ${probe.status}` : "no response"})`}
          isOpen={showProbe}
          onToggle={() => setShowProbe((v) => !v)}
        >
          <div className="space-y-1 text-[10px] font-mono text-destructive/80 bg-background/40 rounded p-2 border border-destructive/20">
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <span><span className="text-destructive/60">status:</span> {probe.status !== null ? probe.status : "—"}</span>
              <span><span className="text-destructive/60">content-length:</span> {probe.contentLength ?? "—"}</span>
              <span><span className="text-destructive/60">ok:</span> {probe.ok ? "true" : "false"}</span>
              <span><span className="text-destructive/60">at:</span> {formatTime(probe.at)}</span>
            </div>
            <div className="break-all">
              <span className="text-destructive/60">url:</span> {probe.url}
            </div>
            {probe.headError !== null ? (
              <div className="break-words whitespace-pre-wrap pt-1 border-t border-destructive/20">
                <span className="text-destructive/60">head error:</span> {probe.headError}
              </div>
            ) : null}
          </div>
        </CollapsibleSection>
      ) : null}

      {/* ── Filtered benign warnings (always shown when SW logs reachable) ─ */}
      {benignTally.matched.length > 0 ? (
        <CollapsibleSection
          icon={<ShieldOff className="h-3 w-3" />}
          label={`Filtered benign warnings (${benignTally.total})`}
          isOpen={showSuppressed}
          onToggle={() => setShowSuppressed((v) => !v)}
        >
          <ul className="text-[10px] font-mono text-destructive/80 bg-background/40 rounded p-2 space-y-1 border border-destructive/20">
            {benignTally.matched.map((m) => (
              <li key={m.id} className="flex gap-2">
                <span className="shrink-0 text-destructive/60">[{m.count}×]</span>
                <span className="break-words">
                  <span className="text-destructive/70">{m.id}</span>
                  <span className="text-destructive/60"> — {m.label}</span>
                </span>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      ) : null}

      {/* ── Fix Steps ──────────────────────────────────────── */}
      <div className="rounded border border-destructive/30 bg-destructive/5 p-2">
        <div className="flex items-center gap-1.5 mb-1.5">
          <ListChecks className="h-3 w-3 text-destructive" />
          <span className="text-[11px] font-semibold text-destructive uppercase tracking-wide">
            Suggested fix
          </span>
        </div>
        <ol className="text-[11px] text-destructive/90 space-y-1 list-decimal list-inside">
          {fixSteps.map((step, idx) => (
            <li key={idx} className="leading-snug">
              {step}
            </li>
          ))}
        </ol>
      </div>

      {/* ── Stack Trace (collapsible) ──────────────────────── */}
      {bootErrorStack ? (
        <CollapsibleSection
          icon={<Code2 className="h-3 w-3" />}
          label={`Stack trace (${bootErrorStack.split("\n").length} frames)`}
          isOpen={showStack}
          onToggle={() => setShowStack((v) => !v)}
        >
          <pre className="text-[10px] font-mono text-destructive/80 bg-background/40 rounded p-2 overflow-x-auto max-h-48 whitespace-pre">
            {bootErrorStack}
          </pre>
        </CollapsibleSection>
      ) : null}

      {/* ── Click Trail (collapsible) ──────────────────────── */}
      {trail.length > 0 ? (
        <CollapsibleSection
          icon={<MousePointerClick className="h-3 w-3" />}
          label={`Recent actions (${trail.length})${isFrozen ? " — snapshot at failure" : ""}`}
          isOpen={showTrail}
          onToggle={() => setShowTrail((v) => !v)}
        >
          <ul className="text-[10px] font-mono text-destructive/80 bg-background/40 rounded p-2 space-y-0.5 max-h-40 overflow-y-auto">
            {trail.slice().reverse().map((entry, idx) => (
              <li key={idx} className="flex gap-2">
                <span className="text-destructive/50 shrink-0">{formatTime(entry.at)}</span>
                <span className="text-destructive/60 shrink-0 w-10">{entry.kind}</span>
                <span className="break-all">{entry.label}</span>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      ) : null}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  Sub-components                                                */
/* ────────────────────────────────────────────────────────────── */

interface CollapsibleSectionProps {
  icon: React.ReactNode;
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function CollapsibleSection({ icon, label, isOpen, onToggle, children }: CollapsibleSectionProps) {
  return (
    <div className="rounded border border-destructive/30 bg-destructive/5">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold text-destructive uppercase tracking-wide hover:bg-destructive/10 transition-colors"
      >
        {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {icon}
        <span>{label}</span>
      </button>
      {isOpen ? <div className="px-2 pb-2">{children}</div> : null}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  Cause Classification                                          */
/* ────────────────────────────────────────────────────────────── */

type CauseKind = "wasm-missing" | "wasm" | "opfs" | "storage" | "migration" | "schema" | "unknown";

interface Cause {
  kind: CauseKind;
  label: string;
}

/** Inspects the failed step + error text to classify the root cause. */
function classifyCause(failedStep: string, bootError: string | null | undefined): Cause {
  const errorText = (bootError ?? "");
  const lower = errorText.toLowerCase();

  // Highest priority: the dedicated tag emitted by verifyWasmPresence() when
  // the packaged WASM file is missing or 404. Match the literal tag so
  // semantically similar errors (e.g. an OPFS-side WASM mention) don't
  // accidentally trigger this branch.
  if (errorText.includes("[WASM_FILE_MISSING_404]") || lower.includes("wasm file missing")) {
    return { kind: "wasm-missing", label: "WASM file missing" };
  }
  if (lower.includes("wasm") || lower.includes("sql-wasm")) {
    return { kind: "wasm", label: "WASM load" };
  }
  if (lower.includes("opfs") || lower.includes("getdirectory") || lower.includes("navigator.storage")) {
    return { kind: "opfs", label: "OPFS" };
  }
  if (lower.includes("chrome.storage") || lower.includes("storage quota") || lower.includes("quota_bytes")) {
    return { kind: "storage", label: "chrome.storage" };
  }
  if (lower.includes("migration") || lower.includes("alter table") || lower.includes("create table")) {
    return { kind: "migration", label: "Schema migration" };
  }
  if (failedStep === "db-init" && lower.includes("schema")) {
    return { kind: "schema", label: "Schema" };
  }

  return { kind: "unknown", label: failedStep };
}

/* ────────────────────────────────────────────────────────────── */
/*  Fix Steps                                                     */
/* ────────────────────────────────────────────────────────────── */

/** Returns numbered, cause-specific recovery steps. */
// eslint-disable-next-line max-lines-per-function -- fix-step catalog: one branch per cause; splitting would scatter the recovery contract
function getFixSteps(cause: Cause): string[] {
  switch (cause.kind) {
    case "wasm-missing":
      return [
        "The packaged extension is missing wasm/sql-wasm.wasm (HEAD request returned 404).",
        "Rebuild with .\\run.ps1 -d — the verifyWasmAsset Vite plugin will self-heal from node_modules/sql.js/dist/, or hard-fail with the exact path if it's missing there too.",
        "Confirm chrome-extension/wasm/sql-wasm.wasm exists after the build, and that manifest.json's web_accessible_resources lists \"wasm/sql-wasm.wasm\".",
        "Open chrome://extensions and click the reload icon on Marco.",
        "Re-open this popup; the banner should disappear and Persistence should switch from \"memory\" to \"opfs\".",
      ];
    case "wasm":
      return [
        "Confirm wasm/sql-wasm.wasm exists in the chrome-extension/ build output.",
        "If missing, rebuild with .\\run.ps1 -d (regenerates the WASM copy via viteStaticCopy).",
        "Open chrome://extensions, click the reload icon on the Marco extension.",
        "Re-open this popup and confirm the banner is gone.",
      ];
    case "opfs":
      return [
        "OPFS is unavailable — the extension is running in degraded memory mode.",
        "Open chrome://settings/cookies → check site data isn't blocked for this extension.",
        "Clear extension storage: chrome://extensions → Marco → Details → \"Clear data\".",
        "Reload the extension from chrome://extensions and re-open this popup.",
      ];
    case "storage":
      return [
        "chrome.storage.local quota exceeded or unavailable.",
        "Open chrome://extensions → Marco → Details → Site settings → clear data.",
        "Reload the extension after clearing.",
        "If it persists, check chrome://settings/storage for browser-wide quota issues.",
      ];
    case "migration":
      return [
        "A schema migration failed — the database may be in an inconsistent state.",
        "Export your data first via Options → Diagnostics → \"Export DB\" (if reachable).",
        "Clear extension storage: chrome://extensions → Marco → Details → \"Clear data\".",
        "Reload the extension; migrations will re-run from a clean schema.",
      ];
    case "schema":
      return [
        "Schema initialization failed before any migration ran.",
        "Reload the extension from chrome://extensions.",
        "If the failure recurs, clear extension storage and reload.",
      ];
    case "unknown":
    default:
      return [
        `Boot failed at the "${cause.label}" step with no recognised cause pattern.`,
        "Use \"Copy report\" above and share the output for triage.",
        "Reload the extension from chrome://extensions to retry.",
      ];
  }
}

/* ────────────────────────────────────────────────────────────── */
/*  Report Builder                                                */
/* ────────────────────────────────────────────────────────────── */

interface ReportInput {
  failedStep: string;
  cause: Cause;
  bootError: string | null | undefined;
  bootErrorStack: string | null | undefined;
  bootErrorContext: BootErrorContext | null;
  wasmProbe: WasmProbeResult | null;
  fixSteps: string[];
  trail: ClickTrailEntry[];
  isFrozenTrail: boolean;
  /** Stable failure fingerprint preserved across SW restarts. */
  failureId: string | null;
  /** ISO timestamp of when the failure was first persisted. */
  failureAt: string | null;
  /** Tally of warnings filtered out of the Errors drawer. */
  benignTally: BenignWarningTally;
  /** "short" — correlation header + summary only; "full" — everything. */
  mode: "short" | "full";
}

/** Produces a plain-text bundle suitable for clipboard/issue reports. */
// eslint-disable-next-line max-lines-per-function, sonarjs/cognitive-complexity -- diagnostic report builder: one section per probe; splitting would scatter the report layout
function buildReport(input: ReportInput): string {
  const lines: string[] = [];
  const isShort = input.mode === "short";
  lines.push("═══════════════════════════════════════════");
  lines.push(`  Marco Boot Failure Report${isShort ? "  [SHORT]" : ""}`);
  lines.push(`  Generated: ${new Date().toISOString()}`);
  lines.push("═══════════════════════════════════════════");
  lines.push("");
  // Correlation block — fixed-width labels so colons align (LABEL_WIDTH
  // sized to the longest label "Error message:" + padding).
  const LABEL_WIDTH = 16;
  const field = (label: string, value: string): string =>
    `${(label + ":").padEnd(LABEL_WIDTH, " ")}${value}`;
  lines.push(field("Failure ID",    input.failureId ?? "(not persisted)"));
  lines.push(field("Snapshot at",   input.failureAt ?? "(not persisted)"));
  lines.push(field("Failed step",   input.failedStep));
  lines.push(field("Cause",         `${input.cause.label} (${input.cause.kind})`));
  lines.push(field("Error message", input.bootError ?? "(none captured)"));
  lines.push("───────────────────────────────────────────");
  lines.push("");

  if (input.bootErrorContext !== null) {
    lines.push("── Failing operation ─────────────────────");
    if (input.bootErrorContext.migrationVersion !== null) {
      lines.push(`  Migration:  v${input.bootErrorContext.migrationVersion}`);
    }
    if (input.bootErrorContext.migrationDescription !== null) {
      lines.push(`  Step:       ${input.bootErrorContext.migrationDescription}`);
    }
    if (input.bootErrorContext.scope !== null) {
      lines.push(`  Scope:      ${input.bootErrorContext.scope}`);
    }
    // SQL body is verbose — only included in full mode. Short mode shows
    // a one-line indicator so the operator knows it was captured.
    if (input.bootErrorContext.sql !== null) {
      if (isShort) {
        const sqlLines = input.bootErrorContext.sql.split("\n").length;
        lines.push(`  SQL:        (${sqlLines} line${sqlLines === 1 ? "" : "s"} — full report only)`);
      } else {
        lines.push(`  SQL:`);
        input.bootErrorContext.sql.split("\n").forEach((line) => {
          lines.push(`    ${line}`);
        });
      }
    }
    lines.push("");
  }

  if (input.wasmProbe !== null) {
    const p = input.wasmProbe;
    lines.push("── WASM HEAD probe ───────────────────────");
    lines.push(`  URL:            ${p.url}`);
    lines.push(`  Status:         ${p.status !== null ? p.status : "(no response)"}`);
    lines.push(`  Content-Length: ${p.contentLength ?? "(absent)"}`);
    lines.push(`  OK:             ${p.ok ? "true" : "false"}`);
    lines.push(`  Probed at:      ${p.at}`);
    if (p.headError !== null) {
      lines.push(`  HEAD error:     ${p.headError}`);
    }
    lines.push("");
  }

  // Filtered benign warnings — short mode emits totals only; full mode
  // enumerates each pattern + label so suppression is auditable.
  lines.push(`── Filtered benign warnings (${input.benignTally.total}) ─`);
  if (input.benignTally.matched.length === 0) {
    lines.push("  (no benign warnings suppressed)");
  } else if (isShort) {
    const ids = input.benignTally.matched.map((m) => `${m.id}×${m.count}`).join(", ");
    lines.push(`  ${ids}`);
  } else {
    input.benignTally.matched.forEach((m) => {
      lines.push(`  [${m.count}×]  ${m.id}`);
      lines.push(`         ${m.label}`);
    });
  }
  lines.push("");

  if (isShort) {
    // Short mode stops here — full report adds fix steps, stack, click trail.
    lines.push("(Short report — toggle to Full to include suggested fix, stack trace, and recent UI actions.)");
    lines.push("");
    return lines.join("\n");
  }

  lines.push("── Suggested fix ─────────────────────────");
  input.fixSteps.forEach((step, idx) => {
    lines.push(`  ${idx + 1}. ${step}`);
  });
  lines.push("");
  lines.push("── Stack trace ───────────────────────────");
  lines.push(input.bootErrorStack ?? "(unavailable)");
  lines.push("");
  lines.push(`── Recent UI actions (${input.trail.length})${input.isFrozenTrail ? " — snapshot at failure" : " — live"} ─────────`);
  if (input.trail.length === 0) {
    lines.push("  (none captured)");
  } else {
    input.trail.forEach((entry) => {
      // eslint-disable-next-line sonarjs/no-nested-template-literals -- inline trail formatting; helper would obscure the one-line summary
      lines.push(`  ${entry.at}  [${entry.kind}]  ${entry.label}${entry.target ? `  @ ${entry.target}` : ""}`);
    });
  }
  lines.push("");
  return lines.join("\n");
}

/** Formats an ISO timestamp as HH:MM:SS for compact display. */
function formatTime(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleTimeString("en-GB", { hour12: false });
  } catch {
    return iso;
  }
}
