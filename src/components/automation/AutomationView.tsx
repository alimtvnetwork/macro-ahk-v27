/* eslint-disable @typescript-eslint/no-explicit-any, max-lines-per-function -- untyped extension message types */
/**
 * AutomationView — Spec 21
 *
 * Main view for the Automation tab in Options.
 * Lists chains, allows creation/editing, and shows execution progress.
 * Chains are project-scoped — a project selector dropdown filters chains.
 */

import { useState, useCallback, useRef, useEffect, lazy, Suspense } from "react";
import { sendMessage } from "@/lib/message-client";
import type { AutomationChain, ChainExecutionState } from "@/lib/automation-types";
import { flattenSteps, STEP_TYPE_META } from "@/lib/automation-types";
import { ChainRunner } from "@/lib/chain-runner";
// Lazy — pulls in @dnd-kit/{core,sortable,utilities} (~80 kB) only when the editor opens.
const ChainBuilder = lazy(() =>
  import("@/components/automation/ChainBuilder").then((m) => ({ default: m.ChainBuilder })),
);
import { StepCard } from "@/components/automation/StepCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Play, Pause, Square, Trash2, Edit2, Plus, Download, Upload,
  Loader2, Zap, AlertCircle, FolderOpen,
} from "lucide-react";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Project-scoped chain storage via message handlers                   */
/* ------------------------------------------------------------------ */

async function loadChains(project: string): Promise<AutomationChain[]> {
  try {
    const result = await sendMessage<{ isOk: boolean; chains?: AutomationChain[] }>({
      type: "GET_AUTOMATION_CHAINS",
      project,
    });
    return result.isOk && result.chains ? result.chains : [];
  } catch {
    return [];
  }
}

async function saveChainToDb(chain: Partial<AutomationChain>, project: string): Promise<boolean> {
  const result = await sendMessage<{ isOk: boolean }>({
    type: "SAVE_AUTOMATION_CHAIN",
    project,
    chain,
  } as any);
  return result.isOk;
}

async function deleteChainFromDb(chainId: string, project: string): Promise<boolean> {
  const result = await sendMessage<{ isOk: boolean }>({
    type: "DELETE_AUTOMATION_CHAIN",
    project,
    chainId,
  } as any);
  return result.isOk;
}

async function toggleChainInDb(chainId: string, project: string): Promise<boolean> {
  const result = await sendMessage<{ isOk: boolean }>({
    type: "TOGGLE_AUTOMATION_CHAIN",
    project,
    chainId,
  } as any);
  return result.isOk;
}

async function importChainsToDb(chains: AutomationChain[], project: string): Promise<number> {
  const result = await sendMessage<{ isOk: boolean; imported?: number }>({
    type: "IMPORT_AUTOMATION_CHAINS",
    project,
    chains,
  } as any);
  return result.imported ?? 0;
}

async function loadProjects(): Promise<Array<{ id: string; name: string; slug: string }>> {
  try {
    const result = await sendMessage<{ isOk: boolean; projects?: Array<{ id: string; name: string; slug?: string }> }>({
      type: "GET_PROJECTS" as any,
    });
    if (result.isOk && result.projects) {
      return result.projects.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug || p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      }));
    }
    return [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export function AutomationView() {
  const [chains, setChains] = useState<AutomationChain[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AutomationChain | "new" | null>(null);
  const [execution, setExecution] = useState<ChainExecutionState | null>(null);
  const runnerRef = useRef<ChainRunner | null>(null);

  // Project scoping
  const [projects, setProjects] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");

  // Load projects on mount
  useEffect(() => {
    void loadProjects().then((p) => {
      setProjects(p);
      if (p.length > 0 && !selectedProject) {
        setSelectedProject(p[0].slug);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshChains = useCallback(async () => {
    if (!selectedProject) return;
    setLoading(true);
    const loaded = await loadChains(selectedProject);
    setChains(loaded);
    setLoading(false);
  }, [selectedProject]);

  useEffect(() => {
    if (selectedProject) {
      void refreshChains();
    }
  }, [selectedProject, refreshChains]);

  // Listen for automation-notify events from the step executor
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { message: string; level: string };
      const fn = detail.level === "error" ? toast.error
        : detail.level === "warning" ? toast.warning
        : detail.level === "success" ? toast.success
        : toast.info;
      fn(detail.message);
    };
    window.addEventListener("automation-notify", handler);
    return () => window.removeEventListener("automation-notify", handler);
  }, []);

  const handleSave = useCallback(async (partial: Partial<AutomationChain>) => {
    const ok = await saveChainToDb(partial, selectedProject);
    if (ok) {
      toast.success(partial.id ? "Chain updated" : "Chain created");
      setEditing(null);
      void refreshChains();
    } else {
      toast.error("Failed to save chain");
    }
  }, [refreshChains, selectedProject]);

  const handleDelete = useCallback(async (id: string) => {
    const ok = await deleteChainFromDb(id, selectedProject);
    if (ok) {
      toast.success("Chain deleted");
      void refreshChains();
    }
  }, [refreshChains, selectedProject]);

  const handleToggle = useCallback(async (id: string) => {
    await toggleChainInDb(id, selectedProject);
    void refreshChains();
  }, [refreshChains, selectedProject]);

  const handleRun = useCallback((chain: AutomationChain) => {
    const runner = new ChainRunner(chain, setExecution);
    runnerRef.current = runner;
    void runner.run();
  }, []);

  const handlePause = useCallback(() => runnerRef.current?.pause(), []);
  const handleResume = useCallback(() => runnerRef.current?.resume(), []);
  const handleCancel = useCallback(() => { runnerRef.current?.cancel(); }, []);
  const handleDismiss = useCallback(() => { setExecution(null); runnerRef.current = null; }, []);

  const handleExport = useCallback(() => {
    const blob = new Blob([JSON.stringify(chains, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedProject}-automation-chains.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Chains exported");
  }, [chains, selectedProject]);

  const handleImport = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const imported = JSON.parse(text) as AutomationChain[];
        if (!Array.isArray(imported)) throw new Error("Invalid format");
        const count = await importChainsToDb(imported, selectedProject);
        toast.success(`Imported ${count} chain(s)`);
        void refreshChains();
      } catch {
        toast.error("Failed to import chains");
      }
    };
    input.click();
  }, [refreshChains, selectedProject]);

  const isRunning = execution?.status === "running";
  const isPaused = execution?.status === "paused";
  const selectedProjectName = projects.find((p) => p.slug === selectedProject)?.name ?? selectedProject;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" /> Automation Chains
        </h2>
        <p className="text-xs text-muted-foreground">
          Build multi-step automation sequences with conditional branching, DOM interactions, and scheduling.
        </p>
      </div>

      {/* Project selector */}
      <div className="flex items-center gap-2">
        <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Project:</span>
        <Select value={selectedProject} onValueChange={setSelectedProject}>
          <SelectTrigger className="h-7 w-52 text-xs">
            <SelectValue placeholder="Select project…" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((p) => (
              <SelectItem key={p.slug} value={p.slug} className="text-xs">
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedProject && (
          <Badge variant="outline" className="text-[9px] font-mono">{selectedProject}</Badge>
        )}
      </div>

      {!selectedProject && (
        <div className="text-center py-12 text-xs text-muted-foreground">
          <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Select a project to manage its automation chains</p>
        </div>
      )}

      {selectedProject && (
        <>
          {/* Execution progress */}
          {execution && (
            <Card className="border-primary/40 bg-primary/5">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold flex items-center gap-2">
                    {isRunning && <Loader2 className="h-3 w-3 animate-spin" />}
                    {execution.chainName} — {execution.status}
                  </span>
                  <div className="flex gap-1">
                    {isRunning && (
                      <Button size="sm" variant="outline" className="h-6 text-xs gap-1" onClick={handlePause}>
                        <Pause className="h-3 w-3" /> Pause
                      </Button>
                    )}
                    {isPaused && (
                      <Button size="sm" variant="outline" className="h-6 text-xs gap-1" onClick={handleResume}>
                        <Play className="h-3 w-3" /> Resume
                      </Button>
                    )}
                    {(isRunning || isPaused) && (
                      <Button size="sm" variant="destructive" className="h-6 text-xs gap-1" onClick={handleCancel}>
                        <Square className="h-3 w-3" /> Stop
                      </Button>
                    )}
                    {!isRunning && !isPaused && (
                      <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={handleDismiss}>Dismiss</Button>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  {execution.flatSteps.map((fs, i) => (
                    <StepCard
                      key={i}
                      flatStep={fs}
                      index={i}
                      total={execution.flatSteps.length}
                      status={execution.stepStatuses[i]}
                      editing={false}
                      sortableId={`exec-${i}`}
                      onChange={() => {}}
                      onRemove={() => {}}
                    />
                  ))}
                </div>

                {execution.error && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> {execution.error}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Editor */}
          {editing && (
            <Suspense fallback={<div className="text-xs text-muted-foreground p-3">Loading editor…</div>}>
              <ChainBuilder
                chain={editing === "new" ? undefined : editing}
                onSave={handleSave}
                onCancel={() => setEditing(null)}
              />
            </Suspense>
          )}

          {/* Chain list */}
          {!editing && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{chains.length} chain{chains.length !== 1 ? "s" : ""}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={handleImport}>
                    <Upload className="h-3 w-3" /> Import
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={handleExport} disabled={chains.length === 0}>
                    <Download className="h-3 w-3" /> Export
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setEditing("new")}>
                    <Plus className="h-3 w-3" /> New Chain
                  </Button>
                </div>
              </div>

              {loading ? (
                <p className="text-xs text-muted-foreground text-center py-8">Loading chains…</p>
              ) : chains.length === 0 ? (
                <div className="text-center py-12 text-xs text-muted-foreground">
                  <Zap className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No automation chains for {selectedProjectName}</p>
                  <p>Create a chain to automate multi-step workflows.</p>
                </div>
              ) : null}
              {!loading && chains.map((chain) => {
                const flat = flattenSteps(chain.steps);
                return (
                  <Card key={chain.id} className={!chain.enabled ? "opacity-60" : ""}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Switch checked={chain.enabled} onCheckedChange={() => handleToggle(chain.id)} />
                          <span className="text-sm font-bold">{chain.name}</span>
                          <Badge variant="outline" className="text-[9px] font-mono">{chain.slug}</Badge>
                          <Badge variant="secondary" className="text-[9px]">{chain.triggerType}</Badge>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="icon" variant="ghost" className="h-7 w-7" title="Run"
                            disabled={isRunning || !chain.enabled}
                            onClick={() => handleRun(chain)}
                          >
                            <Play className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(chain)}>
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete chain?</AlertDialogTitle>
                                <AlertDialogDescription>Delete "{chain.name}"? This cannot be undone.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(chain.id)}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>

                      {/* Step summary */}
                      <div className="flex flex-wrap gap-1.5">
                        {flat.map((fs, i) => {
                          const meta = STEP_TYPE_META[fs.step.type];
                          return (
                            <Badge key={i} variant="outline" className="text-[9px] gap-1" style={{ marginLeft: fs.depth * 8 }}>
                              {meta.icon} {meta.label}
                            </Badge>
                          );
                        })}
                      </div>

                      <p className="text-[10px] text-muted-foreground">
                        {chain.steps.length} step{chain.steps.length !== 1 ? "s" : ""} · Created {new Date(chain.createdAt).toLocaleDateString()}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </>
          )}
        </>
      )}
    </div>
  );
}

export default AutomationView;
