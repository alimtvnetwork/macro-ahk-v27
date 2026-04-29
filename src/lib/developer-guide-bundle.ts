/**
 * Developer Guide Knowledge Base — Export utility
 *
 * Lazy-loads the bundled guide data (developer-guide-data.generated.ts)
 * via dynamic import so the ~hundreds of KB of markdown only ship when
 * a user clicks "Export AI Knowledge Base" inside the Project Detail view.
 */

const SEPARATOR = "\n\n---\n\n";

export interface ExportOptions {
  /** Chrome extension ID for path resolution */
  extensionId?: string;
  /** Project root path */
  projectRoot?: string;
  /** Project-specific context to prepend */
  projectContext?: {
    name: string;
    slug: string;
    codeName: string;
    version: string;
  };
}

/** Returns the bundled guide section count (lazy). */
export async function getGuideSectionCount(): Promise<number> {
  const mod = await import("./developer-guide-data.generated");
  return mod.GUIDE_SECTION_COUNT;
}

/**
 * Concatenates all developer guide documents into a single markdown string
 * with resolved placeholders and optional project context header.
 *
 * Async — the underlying guide data is dynamically imported.
 */
export async function exportKnowledgeBase(options: ExportOptions = {}): Promise<string> {
  const { GUIDE_SECTIONS } = await import("./developer-guide-data.generated");
  const header = buildHeader(options);
  const body = GUIDE_SECTIONS.join(SEPARATOR);
  const resolved = resolvePlaceholders(body, options);

  return header + resolved;
}

function buildHeader(options: ExportOptions): string {
  const lines: string[] = [
    "# Rise Up Macro — AI Knowledge Base",
    "",
    `> Exported: ${new Date().toISOString()}`,
  ];

  if (options.extensionId) {
    lines.push(`> Extension ID: ${options.extensionId}`);
  }

  if (options.projectContext) {
    const ctx = options.projectContext;
    lines.push(`> Project: ${ctx.name} (${ctx.slug}) v${ctx.version}`);
    lines.push(`> SDK Namespace: \`RiseupAsiaMacroExt.Projects.${ctx.codeName}\``);
  }

  lines.push("", "---", "", "");
  return lines.join("\n");
}

function resolvePlaceholders(content: string, options: ExportOptions): string {
  let resolved = content;

  if (options.extensionId) {
    resolved = resolved.replace(/\{EXTENSION_ID\}/g, options.extensionId);
  }

  if (options.projectRoot) {
    resolved = resolved.replace(/\{PROJECT_ROOT\}/g, options.projectRoot);
  }

  return resolved;
}
