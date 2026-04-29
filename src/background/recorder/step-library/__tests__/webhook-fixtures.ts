/**
 * Marco Extension — Webhook delivery result fixture factories
 *
 * Test-only helpers that produce well-typed `WebhookDeliverySuccess`,
 * `WebhookDeliverySkipped`, and `WebhookDeliveryFailure` values with
 * sensible defaults. Each factory accepts a `Partial<...>` override so
 * tests only spell out the fields they care about — the rest stays
 * realistic and stable across the suite.
 *
 * Why a factory and not just shared constants?
 *   - Constants force callers to spread + overwrite, which loses
 *     IDE autocomplete on overrides and is error-prone (e.g. forgetting
 *     to rewrite `Kind` after a spread).
 *   - Factories return a fresh object each call (no aliasing bugs in
 *     tests that mutate the result, e.g. payload-equality checks).
 *   - Centralising the defaults means a future field addition to
 *     `WebhookDeliveryResult` is a single edit, not a sweep across
 *     every test file.
 *
 * Usage:
 *   const ok      = makeWebhookSuccess();
 *   const slow    = makeWebhookSuccess({ DurationMs: 9999 });
 *   const skipped = makeWebhookSkipped({ SkipReason: "URL empty" });
 *   const failed  = makeWebhookFailure({ Status: null, Error: "DNS" });
 */

import {
    WEBHOOK_RESULT_SCHEMA_VERSION,
    type WebhookDeliveryFailure,
    type WebhookDeliveryResult,
    type WebhookDeliverySkipped,
    type WebhookDeliverySuccess,
    type WebhookEventKind,
} from "../result-webhook";

/* ------------------------------------------------------------------ */
/*  Shared defaults                                                    */
/* ------------------------------------------------------------------ */

const DEFAULT_URL = "https://example.com/hook";
const DEFAULT_EMITTED_AT = "2026-04-27T00:00:00.000Z";
const DEFAULT_DURATION_MS = 42;

/* ------------------------------------------------------------------ */
/*  Factories                                                          */
/* ------------------------------------------------------------------ */

export function makeWebhookSuccess(
    overrides: Partial<WebhookDeliverySuccess> = {},
): WebhookDeliverySuccess {
    return {
        SchemaVersion: WEBHOOK_RESULT_SCHEMA_VERSION,
        Kind: "success",
        Ok: true,
        Skipped: false,
        Event: "GroupRunSucceeded" satisfies WebhookEventKind,
        Url: DEFAULT_URL,
        Status: 200,
        DurationMs: DEFAULT_DURATION_MS,
        EmittedAt: DEFAULT_EMITTED_AT,
        Payload: null,
        ...overrides,
    };
}

export function makeWebhookSkipped(
    overrides: Partial<WebhookDeliverySkipped> = {},
): WebhookDeliverySkipped {
    return {
        SchemaVersion: WEBHOOK_RESULT_SCHEMA_VERSION,
        Kind: "skipped",
        Ok: true,
        Skipped: true,
        Event: "GroupRunFailed" satisfies WebhookEventKind,
        Url: null,
        SkipReason: "Webhook disabled",
        DurationMs: 0,
        EmittedAt: DEFAULT_EMITTED_AT,
        Payload: null,
        ...overrides,
    };
}

export function makeWebhookFailure(
    overrides: Partial<WebhookDeliveryFailure> = {},
): WebhookDeliveryFailure {
    return {
        SchemaVersion: WEBHOOK_RESULT_SCHEMA_VERSION,
        Kind: "failure",
        Ok: false,
        Skipped: false,
        Event: "BatchComplete" satisfies WebhookEventKind,
        Url: DEFAULT_URL,
        Status: 500,
        Error: "HTTP 500 Internal Server Error",
        DurationMs: DEFAULT_DURATION_MS,
        EmittedAt: DEFAULT_EMITTED_AT,
        Payload: null,
        ...overrides,
    };
}

/**
 * Convenience: produce one of each variant in a stable order.
 * Useful for tests that iterate over all variants (e.g. guard
 * exhaustiveness, badge-rendering snapshots).
 */
export function makeWebhookFixtureSet(): {
    success: WebhookDeliverySuccess;
    skipped: WebhookDeliverySkipped;
    failure: WebhookDeliveryFailure;
    all: ReadonlyArray<WebhookDeliveryResult>;
} {
    const success = makeWebhookSuccess();
    const skipped = makeWebhookSkipped();
    const failure = makeWebhookFailure();
    return { success, skipped, failure, all: [success, skipped, failure] };
}
