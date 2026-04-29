/**
 * Popup Page — Structural Smoke Test
 *
 * Verifies the Popup page renders its key structural landmarks without
 * crashing. Replaces the previous full-DOM snapshot, which produced
 * brittle diffs across CI environments where snapshots could not be
 * auto-created (CI=true blocks new snapshot writes).
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/* ── Mock hooks before importing the component ──────────────────── */

vi.mock("@/hooks/use-popup-data", () => ({
  usePopupData: () => ({
    projectData: {
      activeProject: { id: "proj-1", name: "Lovable Dashboard", version: "1.2.0", description: "Automation scripts" },
      allProjects: [
        { id: "proj-1", name: "Lovable Dashboard", version: "1.2.0" },
        { id: "proj-2", name: "GitHub Enhancements", version: "0.3.1" },
      ],
    },
    status: {
      connection: "online",
      token: { status: "valid", expiresIn: "23h" },
      config: { status: "loaded", source: "storage", lastSyncAt: null },
      loggingMode: "sqlite",
      version: "1.19.0",
      latencyMs: 12,
    },
    health: { state: "HEALTHY", details: [] },
    opfsStatus: { sessionId: "test-session", dirExists: true, files: [], healthy: true },
    injections: { scriptIds: ["s1"], timestamp: "2026-03-18T00:00:00Z", projectId: "proj-1" },
    scripts: [
      { id: "s1", name: "macro-looping.js", order: 1, isEnabled: true, runAt: "document_idle" },
    ],
    loading: false,
    debugMode: false,
    refresh: vi.fn(),
    setActiveProject: vi.fn(),
    toggleScript: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-popup-actions", () => ({
  usePopupActions: () => ({
    logsLoading: false,
    exportLoading: false,
    dbExportLoading: false,
    dbImportLoading: false,
    previewLoading: false,
    importPreview: null,
    importPreviewOpen: false,
    setImportPreviewOpen: vi.fn(),
    importMode: { current: "replace" as const },
    handleViewLogs: vi.fn(),
    handleExport: vi.fn(),
    handleDbExport: vi.fn(),
    handleDbImport: vi.fn(),
    handleConfirmImport: vi.fn(),
    handleCancelImport: vi.fn(),
  }),
}));

vi.mock("@/lib/message-client", () => ({
  sendMessage: vi.fn().mockResolvedValue({}),
}));

import PopupPage from "@/pages/Popup";

describe("Popup Page — Structural Smoke Test", () => {
  it("renders core landmarks without crashing", () => {
    const { container } = render(<PopupPage />);

    // Header brand mark + action buttons
    expect(screen.getByAltText("Marco logo")).toBeInTheDocument();
    expect(screen.getByLabelText("Refresh")).toBeInTheDocument();
    expect(screen.getByLabelText("Open Options")).toBeInTheDocument();
    expect(screen.getByLabelText("Help")).toBeInTheDocument();

    // Primary action + footer log control
    expect(screen.getByText("Run Scripts")).toBeInTheDocument();
    expect(screen.getByText("Logs")).toBeInTheDocument();

    // Container has the expected popup width class
    const root = container.firstElementChild as HTMLElement | null;
    expect(root).not.toBeNull();
    expect(root?.className).toContain("w-[520px]");
  });
});
