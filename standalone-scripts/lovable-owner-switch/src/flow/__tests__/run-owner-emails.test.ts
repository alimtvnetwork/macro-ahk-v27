/**
 * Owner Switch — failure-marking + replay-safety tests.
 *
 * Verifies the no-rollback contract:
 *   1. Multi-owner row: owner1 promotes OK, owner2 fails →
 *      Failure populated, PromotedOwners[0].Promoted = true,
 *      PromotedOwners[1].Promoted = false.
 *   2. A WARN log line is emitted explicitly stating no rollback.
 *   3. Single-owner row: only owner fails → Failure populated,
 *      PromotedOwners[0].Promoted = false (and no rollback warning,
 *      because nothing was already promoted).
 */

import { describe, expect, it, vi } from "vitest";
import { runOwnerEmails } from "../run-owner-emails";
import { LogPhase, LogSeverity } from "../log-sink";
import type { LogEntry, LogSink } from "../log-sink";
import type { RowExecutionContext } from "../row-types";
import type { OwnerSwitchCsvRow } from "../../csv/csv-types";
import * as runPromoteModule from "../run-promote";

const buildRow = (overrides: Partial<OwnerSwitchCsvRow> = {}): OwnerSwitchCsvRow => ({
    RowIndex: 1,
    LoginEmail: "[email protected]",
    Password: "pw",
    OwnerEmail1: "[email protected]",
    OwnerEmail2: "[email protected]",
    Notes: null,
    ...overrides,
});

const buildCtx = (row: OwnerSwitchCsvRow): RowExecutionContext => ({
    Task: {
        TaskId: "task-1", LoginUrl: "https://lovable.dev/login",
        CommonPassword: null, UseIncognito: false,
    },
    Row: row,
    Api: {} as RowExecutionContext["Api"],
    Caches: {} as RowExecutionContext["Caches"],
    XPathOverrides: [],
});

const collectingSink = (): { sink: LogSink; entries: LogEntry[] } => {
    const entries: LogEntry[] = [];

    return { sink: { write: (e) => entries.push(e) }, entries };
};

describe("runOwnerEmails — failure marking, no rollback", () => {
    it("multi-owner: owner1 succeeds, owner2 fails → partial state + warn log", async () => {
        const { sink, entries } = collectingSink();
        const spy = vi.spyOn(runPromoteModule, "runPromote")
            .mockResolvedValueOnce({ Outcomes: [], FailedStep: null, Error: null })
            .mockResolvedValueOnce({
                Outcomes: [], FailedStep: null, Error: "PUT 500 server error",
            });

        const result = await runOwnerEmails(buildCtx(buildRow()), sink);

        expect(spy).toHaveBeenCalledTimes(2);
        expect(result.Failure).not.toBeNull();
        expect(result.Failure?.Email).toBe("[email protected]");
        expect(result.Records).toHaveLength(2);
        expect(result.Records[0]).toEqual({
            OwnerEmail: "[email protected]", Promoted: true, FailedStep: null, Error: null,
        });
        expect(result.Records[1]).toMatchObject({
            OwnerEmail: "[email protected]", Promoted: false, Error: "PUT 500 server error",
        });

        const warnEntry = entries.find(
            (e) => e.Phase === LogPhase.Promote && e.Severity === LogSeverity.Warn,
        );
        expect(warnEntry).toBeDefined();
        expect(warnEntry?.Message).toMatch(/No rollback performed/);
        expect(warnEntry?.Message).toMatch(/[email protected]/);

        spy.mockRestore();
    });

    it("single-owner failure: no warn log (nothing was promoted before)", async () => {
        const { sink, entries } = collectingSink();
        const spy = vi.spyOn(runPromoteModule, "runPromote")
            .mockResolvedValueOnce({
                Outcomes: [], FailedStep: null, Error: "membership not found",
            });

        const result = await runOwnerEmails(buildCtx(buildRow({ OwnerEmail2: null })), sink);

        expect(result.Records).toHaveLength(1);
        expect(result.Records[0].Promoted).toBe(false);
        expect(result.Failure?.Email).toBe("[email protected]");

        const warnEntries = entries.filter((e) => e.Severity === LogSeverity.Warn);
        expect(warnEntries).toHaveLength(0);

        spy.mockRestore();
    });

    it("all owners succeed → no failure, every record marked Promoted=true", async () => {
        const { sink } = collectingSink();
        const spy = vi.spyOn(runPromoteModule, "runPromote")
            .mockResolvedValue({ Outcomes: [], FailedStep: null, Error: null });

        const result = await runOwnerEmails(buildCtx(buildRow()), sink);

        expect(result.Failure).toBeNull();
        expect(result.Records.every((r) => r.Promoted)).toBe(true);

        spy.mockRestore();
    });
});
