/**
 * Marco Extension — Keyword Events SQLite Export tests
 *
 * Builds the partial bundle with real sql.js, then re-opens the resulting
 * blob to assert table shape, row content, and Meta markers — the same
 * round-trip strategy used by the full `marco-backup.zip` tests.
 *
 * jsdom can't fetch the hosted WASM, so we mirror the technique used by
 * `sqlite-bundle-roundtrip.test.ts`: mock `sql.js` to override
 * `locateFile` to point at the in-package WASM on the local filesystem.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

vi.mock("sql.js", async () => {
    const real = await vi.importActual<typeof import("sql.js")>("sql.js");
    const realInit = real.default;
    const wasmDir = resolvePath(__dirname, "../../../node_modules/sql.js/dist");
    const localInit: typeof realInit = ((cfg) =>
        realInit({
            ...(cfg ?? {}),
            locateFile: (file: string) => resolvePath(wasmDir, file),
        })) as typeof realInit;
    return { ...real, default: localInit };
});

beforeEach(() => {
    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: string) => {
            const path = String(input);
            if (path.endsWith(".wasm")) {
                const buf = readFileSync(
                    resolvePath(__dirname, "../../../node_modules/sql.js/dist/sql-wasm.wasm"),
                );
                return new Response(buf, { status: 200 });
            }
            throw new Error(`Unexpected fetch in test: ${path}`);
        }),
    );
});

afterEach(() => {
    vi.unstubAllGlobals();
});

import initSqlJs from "sql.js";
import {
    KEYWORD_EVENTS_BUNDLE_KIND,
    KEYWORD_EVENTS_FORMAT_VERSION,
    buildKeywordEventsSqliteDb,
    buildKeywordEventsZip,
} from "../keyword-events-sqlite-export";
import type { KeywordEvent } from "@/hooks/use-keyword-events";

const sample: KeywordEvent[] = [
    {
        Id: "ke-1",
        Keyword: "Login",
        Description: "Open + sign in",
        Enabled: true,
        Steps: [
            { Kind: "Key", Id: "s1", Combo: "Enter" },
            { Kind: "Wait", Id: "s2", DurationMs: 250 },
        ],
        Tags: ["smoke", "auth"],
        Category: "Auth",
        PauseAfterMs: 100,
    },
    {
        Id: "ke-2",
        Keyword: "Logout",
        Description: "",
        Enabled: false,
        Steps: [{ Kind: "Key", Id: "s3", Combo: "Ctrl+Q" }],
        Target: { Kind: "Selector", Selector: "#logout" },
    },
];

async function openDb(data: Uint8Array) {
    const SQL = await initSqlJs();
    return new SQL.Database(data);
}

describe("buildKeywordEventsSqliteDb", () => {
    it("emits PascalCase tables with the expected columns", async () => {
        const data = await buildKeywordEventsSqliteDb(sample);
        const db = await openDb(data);
        try {
            const tables = db
                .exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")[0]
                .values.map((r) => String(r[0]))
                .sort();
            expect(tables).toEqual(["KeywordEvents", "Meta"]);

            const cols = db
                .exec("PRAGMA table_info(\"KeywordEvents\")")[0]
                .values.map((r) => String(r[1]));
            expect(cols).toEqual([
                "Id", "Uid", "Keyword", "Description", "Enabled", "Steps",
                "Target", "Tags", "Category", "PauseAfterMs", "SortOrder",
                "CreatedAt", "UpdatedAt",
            ]);
        } finally {
            db.close();
        }
    });

    it("round-trips events with steps, tags, category, target, and pause", async () => {
        const data = await buildKeywordEventsSqliteDb(sample);
        const db = await openDb(data);
        try {
            const rows = db.exec(
                "SELECT Uid, Keyword, Enabled, Steps, Tags, Category, Target, PauseAfterMs, SortOrder FROM KeywordEvents ORDER BY SortOrder",
            )[0];
            expect(rows.values).toHaveLength(2);

            const [uid1, kw1, en1, steps1, tags1, cat1, target1, pause1, sort1] = rows.values[0];
            expect(uid1).toBe("ke-1");
            expect(kw1).toBe("Login");
            expect(en1).toBe(1);
            expect(JSON.parse(String(steps1))).toEqual(sample[0].Steps);
            expect(JSON.parse(String(tags1))).toEqual(["smoke", "auth"]);
            expect(cat1).toBe("Auth");
            expect(target1).toBeNull();
            expect(pause1).toBe(100);
            expect(sort1).toBe(0);

            const [uid2, , en2, , tags2, cat2, target2, pause2] = rows.values[1];
            expect(uid2).toBe("ke-2");
            expect(en2).toBe(0);
            expect(tags2).toBeNull();
            expect(cat2).toBeNull();
            expect(JSON.parse(String(target2))).toEqual({ Kind: "Selector", Selector: "#logout" });
            expect(pause2).toBeNull();
        } finally {
            db.close();
        }
    });

    it("writes Meta markers (format_version, bundle_kind, exported_at, event_count)", async () => {
        const data = await buildKeywordEventsSqliteDb(sample);
        const db = await openDb(data);
        try {
            const rows = db.exec("SELECT Key, Value FROM Meta")[0];
            const meta = Object.fromEntries(rows.values.map((r) => [String(r[0]), String(r[1])]));
            expect(meta.format_version).toBe(KEYWORD_EVENTS_FORMAT_VERSION);
            expect(meta.bundle_kind).toBe(KEYWORD_EVENTS_BUNDLE_KIND);
            expect(meta.event_count).toBe("2");
            expect(meta.exported_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        } finally {
            db.close();
        }
    });
});

describe("buildKeywordEventsZip", () => {
    it("packages the SQLite DB and JSON snapshot side-by-side", async () => {
        const result = await buildKeywordEventsZip(sample);
        expect(result.filename).toMatch(/^marco-keyword-events-.*\.zip$/);
        expect(result.blob.size).toBeGreaterThan(0);

        const { default: JSZip } = await import("jszip");
        const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
        const names = Object.keys(zip.files).sort();
        expect(names).toEqual(["keyword-events.db", "keyword-events.json"]);

        const json = JSON.parse(await zip.file("keyword-events.json")!.async("string"));
        expect(json.Format).toBe("marco.keyword-events.v1");
        expect(json.Events).toHaveLength(2);

        // The .db entry must be a real SQLite file (header bytes "SQLite format 3\0").
        const dbBytes = await zip.file("keyword-events.db")!.async("uint8array");
        const header = new TextDecoder("utf-8", { fatal: false }).decode(dbBytes.slice(0, 15));
        expect(header).toBe("SQLite format 3");
    });
});
