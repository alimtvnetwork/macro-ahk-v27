/**
 * Owner Switch — per-row state machine types.
 *
 * `RowExecutionContext` bundles everything a single row needs: the
 * parsed CSV row, the resolved password (row.Password ?? task.CommonPassword),
 * the shared API client, the cache bundle, and the XPath overrides.
 *
 * Q7 default: `UseIncognito` is honored at the task level (one fresh
 * incognito window per task, not per row — a 100-row CSV in 100
 * separate incognito windows is impractical). Per-row isolation is
 * achieved by sign-out between rows.
 */

import type { LovableApiClient } from "../../../lovable-common/src/api/lovable-api-client";
import type { OwnerSwitchCsvRow } from "../csv";
import type { PromoteCaches } from "./run-promote";
import type { XPathSettingSeed } from "../migrations/xpath-setting-seed";

export interface TaskExecutionParams {
    TaskId: string;
    LoginUrl: string;
    CommonPassword: string | null;
    UseIncognito: boolean;
}

export interface RowExecutionContext {
    Task: TaskExecutionParams;
    Row: OwnerSwitchCsvRow;
    Api: LovableApiClient;
    Caches: PromoteCaches;
    XPathOverrides: ReadonlyArray<XPathSettingSeed>;
}

export enum RowOutcomeCode {
    Succeeded = "Succeeded",
    LoginFailed = "LoginFailed",
    PromoteFailed = "PromoteFailed",
    /**
     * At least one OwnerEmail in the row was promoted before another
     * OwnerEmail (or sub-step) failed. Persisted distinctly so a
     * re-run can SKIP the already-promoted owners and only retry the
     * failing ones (mem://constraints/no-retry-policy still applies
     * within a single run — re-execution is operator-driven).
     *
     * Per user direction: failure is **marked**, NOT rolled back.
     */
    PromoteFailedPartial = "PromoteFailedPartial",
    PasswordMissing = "PasswordMissing",
}

/**
 * PromotedOwnerRecord — per-OwnerEmail outcome within a row.
 * Persisted as part of `RowExecutionResult.PromotedOwners` so the
 * SQLite store can serialize it (JSON column) for idempotent replay.
 */
export interface PromotedOwnerRecord {
    OwnerEmail: string;
    Promoted: boolean;
    FailedStep: string | null;
    Error: string | null;
}

export interface RowExecutionResult {
    RowIndex: number;
    Outcome: RowOutcomeCode;
    IsDone: boolean;
    HasError: boolean;
    LastError: string | null;
    DurationMs: number;
    /**
     * Per-OwnerEmail breakdown. Empty when the row never reached the
     * promote phase (e.g. login failed). Populated even on success so
     * audit history is complete.
     */
    PromotedOwners: ReadonlyArray<PromotedOwnerRecord>;
}
