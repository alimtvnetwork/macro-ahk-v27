#!/usr/bin/env node
/**
 * audit-checklist.mjs
 *
 * Prints any remaining audit / workstream items discovered from project memory
 * and plan files. Designed to be run at the start of a session so the next
 * command always surfaces open work (Waves 3-5 swallow conversion, idle-loop
 * PERF items, recorder phase tracker, etc.).
 *
 * Sources scanned (read-only):
 *   - .lovable/memory/index.md          (Core + Memories list)
 *   - .lovable/memory/performance/idle-loop-audit-2026-04-25.md
 *   - .lovable/audits/*.md              (latest dated audit)
 *   - plan.md                           (PERF table + LOG sections)
 *   - .lovable/memory/project/macro-recorder-phase-progress.md
 *
 * Heuristics: an item is "open" when its line contains a status marker that is
 * NOT one of: ✅, [x], DONE, Closed, Fixed, Resolved, Skipped (case-insensitive).
 * Lines containing 🟡, 🔴, [ ], TODO, Open, Pending, In Progress are surfaced.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(process.cwd());
const OPEN_RX  = /(🟡|🔴|⏳|\[ \]|\bTODO\b|\bOpen\b|\bPending\b|\bIn Progress\b|\bRemaining\b)/i;
const DONE_RX  = /(✅|\[x\]|\bDONE\b|\bClosed\b|\bFixed\b|\bResolved\b|\bSkipped\b|\bN\/A\b)/i;

function safeRead(path) {
  try { return readFileSync(path, "utf8"); } catch { return null; }
}

function scanLines(label, path, opts = {}) {
  const text = safeRead(path);
  if (text === null) return { label, path, missing: true, items: [] };
  const items = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!OPEN_RX.test(line)) continue;
    if (DONE_RX.test(line)) continue;
    if (opts.minLen && line.trim().length < opts.minLen) continue;
    items.push({ lineNo: i + 1, text: line.trim() });
  }
  return { label, path, missing: false, items };
}

function latestAuditDoc() {
  const dir = join(ROOT, ".lovable/audits");
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter(f => f.endsWith(".md"))
    .map(f => ({ f, t: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return files[0] ? join(dir, files[0].f) : null;
}

const sources = [
  scanLines("Memory index Core/Memories", join(ROOT, ".lovable/memory/index.md"), { minLen: 6 }),
  scanLines("Idle-loop perf audit",       join(ROOT, ".lovable/memory/performance/idle-loop-audit-2026-04-25.md")),
  scanLines("Recorder phase tracker",     join(ROOT, ".lovable/memory/project/macro-recorder-phase-progress.md")),
  scanLines("plan.md",                    join(ROOT, "plan.md"), { minLen: 6 }),
];
const latest = latestAuditDoc();
if (latest) sources.push(scanLines(`Latest audit (${latest.replace(ROOT + "/", "")})`, latest));

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m", green: "\x1b[32m", gray: "\x1b[90m",
};

console.log(`${C.bold}${C.cyan}📋 Remaining audit / workstream checklist${C.reset}`);
console.log(`${C.gray}  scanned ${sources.length} source(s)  •  ${new Date().toISOString()}${C.reset}\n`);

let totalOpen = 0;
for (const src of sources) {
  if (src.missing) {
    console.log(`${C.dim}— ${src.label}: (file not present: ${src.path.replace(ROOT + "/", "")})${C.reset}`);
    continue;
  }
  if (src.items.length === 0) {
    console.log(`${C.green}✓ ${src.label}: no open items detected${C.reset}`);
    continue;
  }
  console.log(`${C.bold}${C.yellow}● ${src.label}${C.reset} ${C.gray}(${src.path.replace(ROOT + "/", "")})${C.reset}`);
  for (const it of src.items.slice(0, 25)) {
    const trimmed = it.text.length > 200 ? it.text.slice(0, 197) + "…" : it.text;
    console.log(`   ${C.dim}L${String(it.lineNo).padStart(4)}${C.reset}  ${trimmed}`);
    totalOpen++;
  }
  if (src.items.length > 25) {
    console.log(`   ${C.dim}… +${src.items.length - 25} more${C.reset}`);
    totalOpen += src.items.length - 25;
  }
  console.log();
}

console.log(
  totalOpen === 0
    ? `${C.green}${C.bold}🎉 All scanned sources report no open items.${C.reset}`
    : `${C.bold}Total open lines surfaced: ${C.yellow}${totalOpen}${C.reset}`
);
console.log(`${C.gray}Tip: run \`pnpm audit:checklist\` (or \`node scripts/audit-checklist.mjs\`) anytime.${C.reset}`);
