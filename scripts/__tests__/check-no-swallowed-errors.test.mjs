#!/usr/bin/env node
/**
 * Self-test for `scripts/check-no-swallowed-errors.mjs`.
 *
 * Builds isolated fixture trees under a temp dir and invokes the
 * scanner with `--root=<fixture>` so the assertions don't depend on
 * the real repo's content. Verifies:
 *   1. Clean tree → exit 0.
 *   2. Empty `catch (e) { }` → exit 1, finding reported with line.
 *   3. TS-style `catch { }` (optional binding) → exit 1.
 *   4. `.catch(() => {})` and `.catch(() => null)` → exit 1.
 *   5. `.catch(noop)` (NO_OP_IDENTIFIERS hit) → exit 1.
 *   6. `// allow-swallow:` waiver suppresses the finding.
 *   7. `catch` keyword inside a string literal does NOT fire.
 *   8. Catch block containing real statements does NOT fire.
 *   9. `__tests__/` folder is excluded from the scan.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, "..", "check-no-swallowed-errors.mjs");

function makeFixture(files) {
    const root = mkdtempSync(join(tmpdir(), "swallow-scan-"));
    for (const [rel, contents] of Object.entries(files)) {
        const abs = join(root, rel);
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, contents, "utf-8");
    }
    return root;
}

function run(root) {
    return spawnSync("node", [SCRIPT, `--root=${root}`, "--json"], { encoding: "utf-8" });
}

function parseJson(stdout) {
    return JSON.parse(stdout);
}

test("clean tree → exit 0, zero findings", () => {
    const root = makeFixture({
        "src/clean.ts": `
            try { doStuff(); }
            catch (err) { console.error("boom", err); }
            promise.catch((e) => Logger.error(e));
        `,
    });
    try {
        const r = run(root);
        assert.equal(r.status, 0, r.stdout + r.stderr);
        const out = parseJson(r.stdout);
        assert.equal(out.FindingCount, 0);
    } finally { rmSync(root, { recursive: true, force: true }); }
});

test("empty catch (e) { } → finding", () => {
    const root = makeFixture({ "src/a.ts": `try { x(); } catch (e) {  }\n` });
    try {
        const r = run(root);
        assert.equal(r.status, 1);
        const out = parseJson(r.stdout);
        assert.equal(out.FindingCount, 1);
        assert.equal(out.Findings[0].kind, "empty-catch");
        assert.equal(out.Findings[0].line, 1);
    } finally { rmSync(root, { recursive: true, force: true }); }
});

test("TS optional-binding catch { } → finding", () => {
    const root = makeFixture({ "src/a.ts": `try { x(); } catch {\n\n}\n` });
    try {
        const r = run(root);
        assert.equal(r.status, 1);
        const out = parseJson(r.stdout);
        assert.equal(out.FindingCount, 1);
        assert.equal(out.Findings[0].kind, "empty-catch");
    } finally { rmSync(root, { recursive: true, force: true }); }
});

test(".catch(() => {}) and .catch(() => null) → 2 findings", () => {
    const root = makeFixture({
        "src/p.ts": `
            p1.catch(() => {});
            p2.catch(() => null);
            p3.catch((_e) => undefined);
        `,
    });
    try {
        const r = run(root);
        assert.equal(r.status, 1);
        const out = parseJson(r.stdout);
        assert.equal(out.FindingCount, 3);
        for (const f of out.Findings) assert.equal(f.kind, "promise-catch-noop");
    } finally { rmSync(root, { recursive: true, force: true }); }
});

test(".catch(noop) → finding via NO_OP_IDENTIFIERS", () => {
    const root = makeFixture({ "src/p.ts": `import { noop } from "lodash"; p.catch(noop);\n` });
    try {
        const r = run(root);
        assert.equal(r.status, 1);
        const out = parseJson(r.stdout);
        assert.equal(out.FindingCount, 1);
        assert.equal(out.Findings[0].kind, "promise-catch-noop-ident");
    } finally { rmSync(root, { recursive: true, force: true }); }
});

test("// allow-swallow: waiver suppresses findings", () => {
    const root = makeFixture({
        "src/w.ts":
            `try { x(); } catch (e) { } // allow-swallow: legacy listener with no logger\n` +
            `p.catch(() => {}) // allow-swallow: fire-and-forget metric\n`,
    });
    try {
        const r = run(root);
        assert.equal(r.status, 0, r.stdout + r.stderr);
        const out = parseJson(r.stdout);
        assert.equal(out.FindingCount, 0);
    } finally { rmSync(root, { recursive: true, force: true }); }
});

test("catch keyword inside string literal is NOT flagged", () => {
    const root = makeFixture({
        "src/s.ts":
            `const msg = "use try { } catch (e) { } pattern";\n` +
            `const re = /catch\\s*\\(\\)\\s*\\{\\s*\\}/;\n` +
            `void msg; void re;\n`,
    });
    try {
        const r = run(root);
        assert.equal(r.status, 0, r.stdout + r.stderr);
        const out = parseJson(r.stdout);
        assert.equal(out.FindingCount, 0);
    } finally { rmSync(root, { recursive: true, force: true }); }
});

test("non-empty catch body is NOT flagged", () => {
    const root = makeFixture({
        "src/ok.ts": `try { x(); } catch (e) { Logger.error("ctx", e); throw e; }\n`,
    });
    try {
        const r = run(root);
        assert.equal(r.status, 0, r.stdout + r.stderr);
        const out = parseJson(r.stdout);
        assert.equal(out.FindingCount, 0);
    } finally { rmSync(root, { recursive: true, force: true }); }
});

test("__tests__/ folder is excluded", () => {
    const root = makeFixture({
        "src/__tests__/a.ts": `try { x(); } catch (e) { }\n`,
        "src/foo.test.ts":   `try { x(); } catch (e) { }\n`,
    });
    try {
        const r = run(root);
        assert.equal(r.status, 0, r.stdout + r.stderr);
        const out = parseJson(r.stdout);
        assert.equal(out.FindingCount, 0);
    } finally { rmSync(root, { recursive: true, force: true }); }
});
