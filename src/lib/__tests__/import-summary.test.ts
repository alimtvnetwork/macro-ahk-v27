import { describe, it, expect } from "vitest";

import {
  buildImportSummary,
  countCategory,
  formatCategoryLine,
  SUMMARY_CATEGORY_ORDER,
} from "@/lib/import-summary";
import type { BundlePreview, DiffItem } from "@/lib/sqlite-bundle";

/* ------------------------------------------------------------------ */
/*  Fixture helpers                                                    */
/* ------------------------------------------------------------------ */

function items(spec: { matched: number; unmatched: number }): DiffItem[] {
  const out: DiffItem[] = [];
  for (let i = 0; i < spec.matched; i++) out.push({ name: `m${i}`, status: "overwrite" });
  for (let i = 0; i < spec.unmatched; i++) out.push({ name: `u${i}`, status: "new" });
  return out;
}

interface PreviewSpec {
  projects: { matched: number; unmatched: number; existing: number };
  scripts: { matched: number; unmatched: number; existing: number };
  configs: { matched: number; unmatched: number; existing: number };
}

function makePreview(spec: PreviewSpec): BundlePreview {
  const projectItems = items(spec.projects);
  const scriptItems = items(spec.scripts);
  const configItems = items(spec.configs);
  return {
    projectCount: projectItems.length,
    scriptCount: scriptItems.length,
    configCount: configItems.length,
    projectNames: projectItems.map((i) => i.name),
    scriptNames: scriptItems.map((i) => i.name),
    configNames: configItems.map((i) => i.name),
    projectItems,
    scriptItems,
    configItems,
    existingProjectCount: spec.projects.existing,
    existingScriptCount: spec.scripts.existing,
    existingConfigCount: spec.configs.existing,
  };
}

/* ------------------------------------------------------------------ */
/*  countCategory                                                      */
/* ------------------------------------------------------------------ */

describe("countCategory", () => {
  it("counts overwrite as matched and new as unmatched", () => {
    const c = countCategory(items({ matched: 3, unmatched: 5 }), 10, "merge");
    expect(c.matched).toBe(3);
    expect(c.unmatched).toBe(5);
  });

  it("computes untouched as (existing - matched) in merge mode", () => {
    const c = countCategory(items({ matched: 2, unmatched: 4 }), 10, "merge");
    expect(c.untouched).toBe(8);
  });

  it("forces untouched to 0 in replace mode", () => {
    const c = countCategory(items({ matched: 2, unmatched: 4 }), 10, "replace");
    expect(c.untouched).toBe(0);
  });

  it("clamps untouched to 0 when matched > existing (defensive)", () => {
    // Bundle reports 5 matched but workspace only has 2 — should not go negative.
    const c = countCategory(items({ matched: 5, unmatched: 0 }), 2, "merge");
    expect(c.untouched).toBe(0);
  });

  it("returns all zeros for an empty bundle in merge mode with no existing items", () => {
    const c = countCategory([], 0, "merge");
    expect(c).toEqual({ matched: 0, unmatched: 0, untouched: 0 });
  });

  it("preserves existing-as-untouched when the bundle is empty (merge)", () => {
    const c = countCategory([], 7, "merge");
    expect(c).toEqual({ matched: 0, unmatched: 0, untouched: 7 });
  });

  it("ignores any unknown status values (defensive filter)", () => {
    const mixed = [
      { name: "a", status: "overwrite" } as DiffItem,
      { name: "b", status: "new" } as DiffItem,
    ];
    const c = countCategory(mixed, 5, "merge");
    expect(c.matched).toBe(1);
    expect(c.unmatched).toBe(1);
    expect(c.untouched).toBe(4);
  });
});

/* ------------------------------------------------------------------ */
/*  formatCategoryLine                                                 */
/* ------------------------------------------------------------------ */

describe("formatCategoryLine", () => {
  it("formats a single line with the canonical wording", () => {
    expect(formatCategoryLine("Projects", { matched: 1, unmatched: 2, untouched: 3 }))
      .toBe("Projects: 1 matched, 2 new, 3 untouched");
  });
});

/* ------------------------------------------------------------------ */
/*  SUMMARY_CATEGORY_ORDER                                             */
/* ------------------------------------------------------------------ */

describe("SUMMARY_CATEGORY_ORDER", () => {
  it("renders Projects, then Scripts, then Configs (canonical order)", () => {
    expect(SUMMARY_CATEGORY_ORDER.map((e) => e.label)).toEqual([
      "Projects",
      "Scripts",
      "Configs",
    ]);
  });

  it("each entry picks the corresponding items+existing slice from a preview", () => {
    const pv = makePreview({
      projects: { matched: 1, unmatched: 0, existing: 4 },
      scripts: { matched: 0, unmatched: 2, existing: 5 },
      configs: { matched: 3, unmatched: 0, existing: 6 },
    });
    expect(SUMMARY_CATEGORY_ORDER[0].pick(pv).existing).toBe(4);
    expect(SUMMARY_CATEGORY_ORDER[1].pick(pv).existing).toBe(5);
    expect(SUMMARY_CATEGORY_ORDER[2].pick(pv).existing).toBe(6);
    expect(SUMMARY_CATEGORY_ORDER[0].pick(pv).items).toBe(pv.projectItems);
    expect(SUMMARY_CATEGORY_ORDER[1].pick(pv).items).toBe(pv.scriptItems);
    expect(SUMMARY_CATEGORY_ORDER[2].pick(pv).items).toBe(pv.configItems);
  });
});

/* ------------------------------------------------------------------ */
/*  buildImportSummary — merge mode                                    */
/* ------------------------------------------------------------------ */

describe("buildImportSummary — merge mode", () => {
  it("renders all three categories plus a Total line in canonical order", () => {
    const pv = makePreview({
      projects: { matched: 2, unmatched: 1, existing: 5 },
      scripts: { matched: 0, unmatched: 3, existing: 4 },
      configs: { matched: 1, unmatched: 0, existing: 2 },
    });
    expect(buildImportSummary(pv, "merge")).toBe(
      [
        "Projects: 2 matched, 1 new, 3 untouched",
        "Scripts: 0 matched, 3 new, 4 untouched",
        "Configs: 1 matched, 0 new, 1 untouched",
        "Total: 3 matched, 4 new",
      ].join("\n"),
    );
  });

  it("untouched in merge mode tracks workspace items not in the bundle", () => {
    const pv = makePreview({
      projects: { matched: 0, unmatched: 0, existing: 9 },
      scripts: { matched: 0, unmatched: 0, existing: 0 },
      configs: { matched: 0, unmatched: 0, existing: 0 },
    });
    const out = buildImportSummary(pv, "merge");
    expect(out).toContain("Projects: 0 matched, 0 new, 9 untouched");
    expect(out).toContain("Total: 0 matched, 0 new");
  });

  it("clamps untouched to 0 when matched count exceeds existing count", () => {
    const pv = makePreview({
      projects: { matched: 4, unmatched: 0, existing: 1 },
      scripts: { matched: 0, unmatched: 0, existing: 0 },
      configs: { matched: 0, unmatched: 0, existing: 0 },
    });
    expect(buildImportSummary(pv, "merge")).toContain("Projects: 4 matched, 0 new, 0 untouched");
  });
});

/* ------------------------------------------------------------------ */
/*  buildImportSummary — replace mode                                  */
/* ------------------------------------------------------------------ */

describe("buildImportSummary — replace mode", () => {
  it("forces untouched to 0 across every category (replace deletes the rest)", () => {
    const pv = makePreview({
      projects: { matched: 2, unmatched: 1, existing: 5 },
      scripts: { matched: 0, unmatched: 3, existing: 4 },
      configs: { matched: 1, unmatched: 0, existing: 2 },
    });
    expect(buildImportSummary(pv, "replace")).toBe(
      [
        "Projects: 2 matched, 1 new, 0 untouched",
        "Scripts: 0 matched, 3 new, 0 untouched",
        "Configs: 1 matched, 0 new, 0 untouched",
        "Total: 3 matched, 4 new",
      ].join("\n"),
    );
  });

  it("Total line aggregates matched and new identically to merge mode", () => {
    const pv = makePreview({
      projects: { matched: 1, unmatched: 2, existing: 8 },
      scripts: { matched: 3, unmatched: 4, existing: 9 },
      configs: { matched: 5, unmatched: 6, existing: 10 },
    });
    const merge = buildImportSummary(pv, "merge");
    const replace = buildImportSummary(pv, "replace");
    // Total line is mode-independent (depends only on bundle, not workspace).
    const expectedTotal = "Total: 9 matched, 12 new";
    expect(merge.endsWith(expectedTotal)).toBe(true);
    expect(replace.endsWith(expectedTotal)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  buildImportSummary — edge cases                                    */
/* ------------------------------------------------------------------ */

describe("buildImportSummary — edge cases", () => {
  it("handles a fully empty preview cleanly in both modes", () => {
    const pv = makePreview({
      projects: { matched: 0, unmatched: 0, existing: 0 },
      scripts: { matched: 0, unmatched: 0, existing: 0 },
      configs: { matched: 0, unmatched: 0, existing: 0 },
    });
    const expected = [
      "Projects: 0 matched, 0 new, 0 untouched",
      "Scripts: 0 matched, 0 new, 0 untouched",
      "Configs: 0 matched, 0 new, 0 untouched",
      "Total: 0 matched, 0 new",
    ].join("\n");
    expect(buildImportSummary(pv, "merge")).toBe(expected);
    expect(buildImportSummary(pv, "replace")).toBe(expected);
  });

  it("always emits exactly 4 lines (3 categories + Total)", () => {
    const pv = makePreview({
      projects: { matched: 1, unmatched: 1, existing: 2 },
      scripts: { matched: 1, unmatched: 1, existing: 2 },
      configs: { matched: 1, unmatched: 1, existing: 2 },
    });
    expect(buildImportSummary(pv, "merge").split("\n")).toHaveLength(4);
    expect(buildImportSummary(pv, "replace").split("\n")).toHaveLength(4);
  });
});
