/**
 * Pure formatter: converts a WebhookDeliveryResult into a human-readable
 * clipboard log block. Mirrors the v2 schema documented in
 * mem://features/webhook-result-schema-version.
 *
 * Intentionally tolerant: missing/legacy fields are rendered as
 * "<missing>" rather than throwing, so debug copies still work for
 * corrupted entries surfaced by scripts/audit-webhook-results.mjs.
 */

export interface WebhookDeliveryResult {
  SchemaVersion?: number;
  DeliveryId?: string;
  ProjectId?: string;
  Url?: string;
  StatusCode?: number | null;
  Success?: boolean;
  DispatchedAt?: string;
  DurationMs?: number;
  ErrorReason?: string | null;
  ErrorDetail?: string | null;
  RequestHeaders?: Record<string, string>;
  RequestBody?: string;
  ResponseBody?: string;
}

const MISSING = "<missing>";

function fmt(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return MISSING;
  }
  return String(value);
}

function fmtHeaders(headers: Record<string, string> | undefined): string {
  if (!headers || Object.keys(headers).length === 0) {
    return "  (none)";
  }
  return Object.entries(headers)
    .map(([key, value]) => `  ${key}: ${value}`)
    .join("\n");
}

function fmtBody(body: string | undefined, label: string): string {
  if (!body) {
    return `${label}:\n  (empty)`;
  }
  return `${label}:\n${body
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n")}`;
}

export function formatWebhookDeliveryLog(entry: WebhookDeliveryResult): string {
  const status = entry.Success === true ? "SUCCESS" : entry.Success === false ? "FAILURE" : MISSING;
  const lines: string[] = [
    "=== Webhook Delivery Log ===",
    `Status:        ${status}`,
    `SchemaVersion: ${fmt(entry.SchemaVersion)}`,
    `DeliveryId:    ${fmt(entry.DeliveryId)}`,
    `ProjectId:     ${fmt(entry.ProjectId)}`,
    `DispatchedAt:  ${fmt(entry.DispatchedAt)}`,
    `DurationMs:    ${fmt(entry.DurationMs)}`,
    `Url:           ${fmt(entry.Url)}`,
    `StatusCode:    ${fmt(entry.StatusCode)}`,
    `ErrorReason:   ${fmt(entry.ErrorReason)}`,
    `ErrorDetail:   ${fmt(entry.ErrorDetail)}`,
    "",
    "RequestHeaders:",
    fmtHeaders(entry.RequestHeaders),
    "",
    fmtBody(entry.RequestBody, "RequestBody"),
    "",
    fmtBody(entry.ResponseBody, "ResponseBody"),
    "============================",
  ];
  return lines.join("\n");
}
