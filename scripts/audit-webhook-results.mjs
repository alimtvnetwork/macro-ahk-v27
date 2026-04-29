#!/usr/bin/env node
/**
 * Audit a WebhookDeliveryResult log dump and emit JSON + CSV reports
 * of corrupted entries with their validation errors.
 *
 * Schema contract (mirrors src/.../webhook-result-schema.ts):
 *   - SchemaVersion: number  (current = 2)
 *   - DeliveryId:    string (uuid-ish, non-empty)
 *   - ProjectId:     string (non-empty)
 *   - Url:           string (http/https)
 *   - StatusCode:    number | null
 *   - Success:       boolean
 *   - DispatchedAt:  ISO-8601 string
 *   - DurationMs:    number >= 0
 *   - ErrorReason:   string | null
 *   - ErrorDetail:   string | null
 *
 * Usage:
 *   node scripts/audit-webhook-results.mjs <input.json|.ndjson> [--out <dir>]
 *
 * Defaults: --out /mnt/documents
 *
 * Fail-fast (per mem://constraints/no-retry-policy + webhook-fail-fast):
 *   single pass, no retries, no network.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const CURRENT_SCHEMA_VERSION = 2;

function parseArgs(argv) {
  const args = { input: null, outDir: "/mnt/documents" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") args.outDir = argv[++i];
    else if (!args.input) args.input = a;
  }
  return args;
}

function loadEntries(file) {
  const raw = fs.readFileSync(file, "utf8").trim();
  if (!raw) return [];
  // NDJSON if first non-blank line parses standalone and there are newlines between objects
  if (raw.startsWith("[")) {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error(`Expected JSON array at top level of ${file}`);
    }
    return parsed;
  }
  // NDJSON path
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  return lines.map((line, idx) => {
    try {
      return JSON.parse(line);
    } catch (err) {
      return { __parseError: true, __line: idx + 1, __raw: line, __err: String(err) };
    }
  });
}

/**
 * Migrate a legacy v1 entry (no SchemaVersion) to v2 shape.
 * Mirrors migrateWebhookDeliveryResult — additive only, never throws.
 */
function migrate(entry) {
  if (!entry || typeof entry !== "object") return entry;
  if (typeof entry.SchemaVersion === "number") return entry;
  // Legacy v1: assume PascalCase already; stamp version.
  return { ...entry, SchemaVersion: 1, __migratedFrom: "v1-implicit" };
}

function isNonEmptyString(v) {
  return typeof v === "string" && v.length > 0;
}

function isIsoTimestamp(v) {
  if (typeof v !== "string") return false;
  const d = new Date(v);
  return !Number.isNaN(d.getTime()) && /\d{4}-\d{2}-\d{2}T/.test(v);
}

function validate(entry) {
  const errors = [];

  if (entry?.__parseError) {
    errors.push({ field: "<root>", reason: "JSONParseError", detail: entry.__err });
    return errors;
  }
  if (!entry || typeof entry !== "object") {
    errors.push({ field: "<root>", reason: "NotAnObject", detail: typeof entry });
    return errors;
  }

  // SchemaVersion
  if (typeof entry.SchemaVersion !== "number") {
    errors.push({ field: "SchemaVersion", reason: "MissingOrWrongType", detail: typeof entry.SchemaVersion });
  } else if (entry.SchemaVersion > CURRENT_SCHEMA_VERSION) {
    errors.push({
      field: "SchemaVersion",
      reason: "UnknownFutureVersion",
      detail: `got ${entry.SchemaVersion}, max supported ${CURRENT_SCHEMA_VERSION}`,
    });
  } else if (entry.SchemaVersion < 1) {
    errors.push({ field: "SchemaVersion", reason: "InvalidVersion", detail: String(entry.SchemaVersion) });
  }

  if (!isNonEmptyString(entry.DeliveryId)) errors.push({ field: "DeliveryId", reason: "MissingOrEmpty", detail: String(entry.DeliveryId) });
  if (!isNonEmptyString(entry.ProjectId)) errors.push({ field: "ProjectId", reason: "MissingOrEmpty", detail: String(entry.ProjectId) });

  if (!isNonEmptyString(entry.Url)) {
    errors.push({ field: "Url", reason: "MissingOrEmpty", detail: String(entry.Url) });
  } else if (!/^https?:\/\//i.test(entry.Url)) {
    errors.push({ field: "Url", reason: "InvalidScheme", detail: entry.Url });
  }

  if (entry.StatusCode !== null && entry.StatusCode !== undefined && typeof entry.StatusCode !== "number") {
    errors.push({ field: "StatusCode", reason: "WrongType", detail: typeof entry.StatusCode });
  }
  if (typeof entry.StatusCode === "number" && (entry.StatusCode < 100 || entry.StatusCode > 599)) {
    errors.push({ field: "StatusCode", reason: "OutOfRange", detail: String(entry.StatusCode) });
  }

  if (typeof entry.Success !== "boolean") {
    errors.push({ field: "Success", reason: "MissingOrWrongType", detail: typeof entry.Success });
  }

  if (!isIsoTimestamp(entry.DispatchedAt)) {
    errors.push({ field: "DispatchedAt", reason: "InvalidIsoTimestamp", detail: String(entry.DispatchedAt) });
  }

  if (typeof entry.DurationMs !== "number" || !Number.isFinite(entry.DurationMs) || entry.DurationMs < 0) {
    errors.push({ field: "DurationMs", reason: "InvalidNumber", detail: String(entry.DurationMs) });
  }

  if (entry.ErrorReason !== null && entry.ErrorReason !== undefined && typeof entry.ErrorReason !== "string") {
    errors.push({ field: "ErrorReason", reason: "WrongType", detail: typeof entry.ErrorReason });
  }
  if (entry.ErrorDetail !== null && entry.ErrorDetail !== undefined && typeof entry.ErrorDetail !== "string") {
    errors.push({ field: "ErrorDetail", reason: "WrongType", detail: typeof entry.ErrorDetail });
  }

  // Cross-field: failure must have ErrorReason
  if (entry.Success === false && !isNonEmptyString(entry.ErrorReason)) {
    errors.push({ field: "ErrorReason", reason: "MissingOnFailure", detail: "Success=false requires ErrorReason" });
  }

  return errors;
}

function csvEscape(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeReports(corrupted, outDir, sourceFile) {
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = `webhook-corrupted-${stamp}`;
  const jsonPath = path.join(outDir, `${base}.json`);
  const csvPath = path.join(outDir, `${base}.csv`);

  const jsonPayload = {
    GeneratedAt: new Date().toISOString(),
    SourceFile: path.resolve(sourceFile),
    SchemaVersion: CURRENT_SCHEMA_VERSION,
    CorruptedCount: corrupted.length,
    Entries: corrupted,
  };
  fs.writeFileSync(jsonPath, JSON.stringify(jsonPayload, null, 2), "utf8");

  const headers = [
    "Index",
    "DeliveryId",
    "ProjectId",
    "SchemaVersion",
    "MigratedFrom",
    "ErrorCount",
    "ErrorFields",
    "ErrorReasons",
    "ErrorDetails",
    "RawEntry",
  ];
  const rows = [headers.join(",")];
  for (const c of corrupted) {
    rows.push([
      c.Index,
      csvEscape(c.Entry?.DeliveryId ?? ""),
      csvEscape(c.Entry?.ProjectId ?? ""),
      csvEscape(c.Entry?.SchemaVersion ?? ""),
      csvEscape(c.Entry?.__migratedFrom ?? ""),
      c.Errors.length,
      csvEscape(c.Errors.map((e) => e.field).join("|")),
      csvEscape(c.Errors.map((e) => e.reason).join("|")),
      csvEscape(c.Errors.map((e) => e.detail).join("|")),
      csvEscape(JSON.stringify(c.Entry)),
    ].join(","));
  }
  fs.writeFileSync(csvPath, rows.join("\n"), "utf8");

  return { jsonPath, csvPath };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    console.error("Usage: node scripts/audit-webhook-results.mjs <input.json|.ndjson> [--out <dir>]");
    process.exit(2);
  }
  if (!fs.existsSync(args.input)) {
    // Hard error — file path missing, per mem://constraints/file-path-error-logging-code-red
    console.error(JSON.stringify({
      Level: "HardError",
      Reason: "InputFileMissing",
      Path: path.resolve(args.input),
      Missing: "WebhookDeliveryResult log dump",
      Why: "User passed a path that does not exist on disk; cannot audit non-existent file.",
    }, null, 2));
    process.exit(1);
  }

  const raw = loadEntries(args.input);
  const corrupted = [];
  let migratedCount = 0;
  for (let i = 0; i < raw.length; i++) {
    const migrated = migrate(raw[i]);
    if (migrated && migrated.__migratedFrom) migratedCount++;
    const errors = validate(migrated);
    if (errors.length > 0) {
      corrupted.push({ Index: i, Errors: errors, Entry: migrated });
    }
  }

  const { jsonPath, csvPath } = writeReports(corrupted, args.outDir, args.input);
  console.log(JSON.stringify({
    Status: corrupted.length === 0 ? "Clean" : "CorruptionFound",
    TotalEntries: raw.length,
    MigratedFromV1: migratedCount,
    CorruptedCount: corrupted.length,
    Reports: { Json: jsonPath, Csv: csvPath },
  }, null, 2));
}

main();
