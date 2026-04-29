import { describe, expect, it } from "vitest";
import { formatWebhookDeliveryLog } from "../format-webhook-log";

describe("formatWebhookDeliveryLog", () => {
  it("formats a complete success entry with all sections", () => {
    const out = formatWebhookDeliveryLog({
      SchemaVersion: 2,
      DeliveryId: "d-1",
      ProjectId: "p-1",
      Url: "https://example.com/hook",
      StatusCode: 200,
      Success: true,
      DispatchedAt: "2026-04-27T10:00:00.000Z",
      DurationMs: 123,
      ErrorReason: null,
      ErrorDetail: null,
      RequestHeaders: { "Content-Type": "application/json" },
      RequestBody: '{"ok":true}',
      ResponseBody: "ok",
    });
    expect(out).toContain("Status:        SUCCESS");
    expect(out).toContain("SchemaVersion: 2");
    expect(out).toContain("DeliveryId:    d-1");
    expect(out).toContain("Content-Type: application/json");
    expect(out).toContain('  {"ok":true}');
    expect(out).toContain("=== Webhook Delivery Log ===");
  });

  it("renders <missing> for absent fields without throwing", () => {
    const out = formatWebhookDeliveryLog({});
    expect(out).toContain("Status:        <missing>");
    expect(out).toContain("DeliveryId:    <missing>");
    expect(out).toContain("(none)");
    expect(out).toContain("(empty)");
  });

  it("marks failures and preserves error fields", () => {
    const out = formatWebhookDeliveryLog({
      SchemaVersion: 2,
      DeliveryId: "d-2",
      Success: false,
      StatusCode: 500,
      ErrorReason: "HttpError",
      ErrorDetail: "500 from server",
    });
    expect(out).toContain("Status:        FAILURE");
    expect(out).toContain("ErrorReason:   HttpError");
    expect(out).toContain("ErrorDetail:   500 from server");
  });
});
