/**
 * Tests for failure-logger ↔ form-snapshot integration.
 *
 * Verifies the contract from
 * mem://standards/verbose-logging-and-failure-diagnostics +
 * mem://features/form-snapshot-capture:
 *   - Field NAMES + types attached to every report whose Target lives in a form.
 *   - Values gated by the Verbose flag.
 *   - Caller-supplied snapshot wins over the live capture.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { buildFailureReport } from "../failure-logger";

const FIXED = () => new Date("2026-04-26T08:00:00.000Z");

beforeEach(() => {
    document.body.innerHTML = `
        <form id="login">
            <input name="email" value="alice@x.com" />
            <input name="password" type="password" value="hunter2" />
            <button id="submit" type="submit">Go</button>
        </form>
    `;
});

describe("FailureReport.FormSnapshot", () => {
    it("captures field names + types but no values when Verbose=false", () => {
        const target = document.getElementById("submit")!;
        const r = buildFailureReport({
            Phase: "Replay", Error: new Error("miss"),
            Target: target, SourceFile: "x", Now: FIXED,
        });
        expect(r.FormSnapshot).not.toBeNull();
        expect(r.FormSnapshot!.Fields.map((f) => f.Name)).toEqual([
            "email", "password",
        ]);
        expect(r.FormSnapshot!.Values).toBeNull();
        expect(r.FormSnapshot!.Verbose).toBe(false);
        expect(r.FormSnapshot!.Fields.find((f) => f.Name === "password")!.Sensitive).toBe(true);
    });

    it("includes masked values when Verbose=true", () => {
        const target = document.getElementById("submit")!;
        const r = buildFailureReport({
            Phase: "Replay", Error: new Error("miss"),
            Target: target, Verbose: true, SourceFile: "x", Now: FIXED,
        });
        expect(r.FormSnapshot!.Values).not.toBeNull();
        const pw = r.FormSnapshot!.Values!.find((v) => v.Name === "password")!;
        expect(pw.Masked).toBe(true);
        expect(pw.Value).toBe("*".repeat("hunter2".length));
        const email = r.FormSnapshot!.Values!.find((v) => v.Name === "email")!;
        expect(email.Value).toBe("alice@x.com");
    });

    it("uses caller-supplied FormSnapshot verbatim", () => {
        const r = buildFailureReport({
            Phase: "Record", Error: new Error("x"),
            FormSnapshot: {
                Form: { Tag: "form", Id: "supplied", Name: null, Action: null, Method: null },
                Fields: [{ Name: "x", Type: "text", NativeName: "x", Id: null, Required: false, Sensitive: false }],
                Values: null,
                Verbose: false,
                CapturedAt: "2026-04-26T08:00:00.000Z",
            },
            SourceFile: "x", Now: FIXED,
        });
        expect(r.FormSnapshot!.Form.Id).toBe("supplied");
    });

    it("FormSnapshot=null suppresses live capture", () => {
        const target = document.getElementById("submit")!;
        const r = buildFailureReport({
            Phase: "Replay", Error: new Error("miss"),
            Target: target, FormSnapshot: null, SourceFile: "x", Now: FIXED,
        });
        expect(r.FormSnapshot).toBeNull();
    });

    it("returns null FormSnapshot when target has no nearby form", () => {
        document.body.innerHTML = `<button id="lonely">Hi</button>`;
        const r = buildFailureReport({
            Phase: "Replay", Error: new Error("x"),
            Target: document.getElementById("lonely"),
            SourceFile: "x", Now: FIXED,
        });
        expect(r.FormSnapshot).toBeNull();
    });
});
