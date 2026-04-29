/**
 * Owner Switch — row-state persistence interface.
 *
 * Storage-agnostic. P10 wires the in-memory implementation; the
 * runtime SQLite adapter binds the same interface to actual UPDATE
 * statements against `OwnerSwitchRow`.
 *
 * Q10: log persistence uses the same dependency-inversion pattern via
 * `LogSink`.
 */

import type { PromotedOwnerRecord, RowOutcomeCode } from "./row-types";

export interface RowStateUpdate {
    RowIndex: number;
    IsDone: boolean;
    HasError: boolean;
    LastError: string | null;
    CompletedAtUtc: string | null;
    /**
     * Final outcome code — persisted alongside the boolean flags so
     * the UI can distinguish PromoteFailedPartial from PromoteFailed
     * without re-parsing `LastError`.
     */
    Outcome: RowOutcomeCode;
    /**
     * JSON-serializable per-OwnerEmail breakdown. The runtime SQLite
     * adapter writes this as a TEXT column (JSON). Empty array means
     * the row never reached the promote phase.
     */
    PromotedOwners: ReadonlyArray<PromotedOwnerRecord>;
}

export interface RowStateStore {
    update(update: RowStateUpdate): void;
}
