/**
 * Pure helpers that build the per-category breakdown used by the
 * post-import toast description and the bundle-preview dialog.
 *
 * Extracted from ProjectsListView.tsx so the counting/formatting logic
 * can be unit-tested without React.
 */

import type { BundlePreview, DiffItem } from "@/lib/sqlite-bundle";

export interface CategoryCounts {
  readonly matched: number;
  readonly unmatched: number;
  readonly untouched: number;
}

/**
 * Count matched / unmatched / untouched for a single category.
 * - matched   : items in the bundle that already existed (overwrite).
 * - unmatched : items in the bundle that were new.
 * - untouched : items currently in the workspace that aren't in the
 *               bundle. In replace mode these get deleted, so 0.
 */
export function countCategory(
  items: DiffItem[],
  existing: number,
  mode: "merge" | "replace",
): CategoryCounts {
  const matched = items.filter((i) => i.status === "overwrite").length;
  const unmatched = items.filter((i) => i.status === "new").length;
  const untouched = mode === "replace" ? 0 : Math.max(0, existing - matched);
  return { matched, unmatched, untouched };
}

export function formatCategoryLine(label: string, c: CategoryCounts): string {
  return `${label}: ${c.matched} matched, ${c.unmatched} new, ${c.untouched} untouched`;
}

/**
 * Canonical render order for the import-summary toast.
 *
 * The toast description MUST always render Projects → Scripts → Configs in
 * this exact order, regardless of how the underlying counting code is
 * refactored. Do not reorder these entries; doing so changes user-visible
 * output and will fail the round-trip toast tests.
 */
export const SUMMARY_CATEGORY_ORDER: ReadonlyArray<{
  readonly label: "Projects" | "Scripts" | "Configs";
  readonly pick: (preview: BundlePreview) => { items: DiffItem[]; existing: number };
}> = [
  { label: "Projects", pick: (p) => ({ items: p.projectItems, existing: p.existingProjectCount }) },
  { label: "Scripts", pick: (p) => ({ items: p.scriptItems, existing: p.existingScriptCount }) },
  { label: "Configs", pick: (p) => ({ items: p.configItems, existing: p.existingConfigCount }) },
];

export function buildImportSummary(preview: BundlePreview, mode: "merge" | "replace"): string {
  const lines: string[] = [];
  let totalMatched = 0;
  let totalUnmatched = 0;
  for (const entry of SUMMARY_CATEGORY_ORDER) {
    const { items, existing } = entry.pick(preview);
    const counts = countCategory(items, existing, mode);
    lines.push(formatCategoryLine(entry.label, counts));
    totalMatched += counts.matched;
    totalUnmatched += counts.unmatched;
  }
  lines.push(`Total: ${totalMatched} matched, ${totalUnmatched} new`);
  return lines.join("\n");
}
