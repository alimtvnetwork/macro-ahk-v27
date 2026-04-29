# `check-no-pnpm-dlx-less` — JSON output schema

Preflight guard that fails the build when any tracked file references a
forbidden dynamic LESS compiler invocation instead of the local helper.

This document describes the **stable machine-readable contract** emitted on
stdout when the script is invoked with `--json`. CI tooling, problem matchers,
and review scripts should validate against this schema.

- **Versioning**: every envelope carries `"version": 1`. Breaking changes
  bump this integer; additive fields do not.
- **Exit codes**: `0` = clean, `1` = hits found / self-test failed,
  `2` = usage error (e.g. invalid `--scan-dir`). The exit code is preserved
  in `--json` mode so CI gates keep working unchanged.
- **Stdout vs stderr**: in `--json` mode the envelope goes to **stdout** and
  stderr stays empty on success. In human mode the failure report goes to
  stderr.

## Modes

| Invocation | `mode` value | Purpose |
|---|---|---|
| `… --json` | `"scan"` | Real filesystem scan against `cwd` (or `--scan-dir`). |
| `… --self-test --json` | `"self-test"` | Synthetic fixture suite — no filesystem touched. |

---

## Envelope: `mode = "scan"`

```jsonc
{
  "mode": "scan",                          // string literal
  "tool": "check-no-pnpm-dlx-less",        // string literal
  "version": 1,                            // integer, schema version
  "ok": false,                             // boolean — true iff totalHits === 0
  "totalHits": 1,                          // integer ≥ 0
  "hits": [ /* Hit[] — see below */ ]
}
```

## Envelope: `mode = "self-test"`

```jsonc
{
  "mode": "self-test",                     // string literal
  "tool": "check-no-pnpm-dlx-less",        // string literal
  "version": 1,                            // integer, schema version
  "total": 61,                             // integer — fixture count
  "passed": 61,                            // integer
  "failed": 0,                             // integer
  "ok": true,                              // boolean — true iff failed === 0
  "results": [ /* FixtureResult[] */ ]
}
```

### `FixtureResult`

```jsonc
{
  "name": "string",                        // fixture name
  "note": "string",                        // human-readable rationale
  "expected": "match" | "clean",           // declared expectation
  "actual":   "match" | "clean",           // observed
  "expectedHitCount":       integer | null, // null = not asserted
  "actualHitCount":         integer,
  "expectedOffendingLines": integer[] | null,
  "actualOffendingLines":   integer[],     // sorted ascending
  "expectedOffendingColumns": integer[] | null,
  "actualOffendingColumns":   integer[],   // sorted by (line, column)
  "ok": boolean,                           // true iff every assertion passed
  "hits": Hit[]                            // same Hit shape as scan mode
}
```

---

## `Hit` — per-offender record

Used in both `scan.hits[]` and `self-test.results[].hits[]`. Every field
is **always present** (no optional fields) so consumers can rely on
shape-stability.

```jsonc
{
  // ── Location ────────────────────────────────────────────────────────
  "file": "string",                        // path relative to scan root
                                           // (or "<fixture:NAME>" in self-test)
  "offendingLine":   integer,              // 1-indexed physical line number
  "offendingColumn": integer,              // 1-indexed column of first
                                           //   offending token on that line
  "firstOffendingToken": "string",         // launcher token (pnpm/npx/pnpx),
                                           //   or first non-whitespace span
                                           //   if no launcher present

  // ── Matched payload ────────────────────────────────────────────────
  "offendingCommand":          "string",   // full whitespace-normalised
                                           //   matched span (≤1000 chars).
                                           //   Preferred field for tooling
                                           //   that surfaces the offender
                                           //   to a human.
  "offendingCommandTruncated": boolean,    // true iff the 1000-char ceiling
                                           //   trimmed the snippet
  "matchedToken":              "string",   // legacy ≤120-char snippet, kept
                                           //   for back-compat
  "offendingLineText":         "string",   // raw text of the offending
                                           //   physical line (untrimmed)

  // ── Rule diagnostics ───────────────────────────────────────────────
  "rule": {
    "id":          "string",               // stable rule identifier
    "label":       "string",               // short human label
    "description": "string",               // one-sentence rationale
    "pattern":     "string"                // regex source (RegExp.source)
  },

  // ── Logical-line context (after continuation joining) ──────────────
  "logical": {
    "startLine":           integer,        // 1-indexed first physical line
    "endLine":             integer,        // 1-indexed last physical line
    "isMultiPhysicalLine": boolean,        // true if joined across `\` / `` ` ``
    "text":                "string"        // joined logical line (≤200 chars)
  },

  // ── Candidate provenance (which transformation surfaced the hit) ───
  "candidate": {
    "kind":    "original" | "statement-split" | "quoted-payload",
    "origin":  "string",                   // human-readable origin description
    "preview": "string"                    // candidate text (≤200 chars, "…" suffix if trimmed)
  },

  // ── Caret rendering (for terminal/UI replay) ───────────────────────
  "caret": {
    "column": integer,                     // same as offendingColumn
    "marker": "string"                     // "^" — single-char marker
  },
  "matchWindow": {
    "text":  "string",                     // ≤120-char window around the hit
    "caret": "string"                      // run of "^" aligned under `text`
  }
}
```

### Field stability guarantees

- All fields listed above are **required** in every Hit. Tooling may treat
  missing fields as a contract violation.
- `rule.id` is a stable identifier safe for grouping/filtering. `rule.label`
  and `rule.description` are human-facing and may be reworded.
- `rule.pattern` is the raw `RegExp.source` — useful for debugging but **not**
  guaranteed stable across versions.
- `offendingCommand` is the canonical copy-paste target for rewrite tooling.
  Prefer it over the legacy `matchedToken`.
- New fields may be **added** without bumping `version`. Field **removal** or
  type changes will bump `version` to `2`.

## Validating in CI

```bash
# Hard-fail the build on any hit, but capture the JSON for tooling.
node scripts/check-no-pnpm-dlx-less.mjs --json > preflight.json
status=$?
if [ "$status" -eq 2 ]; then
  echo "::error::preflight invocation error (bad --scan-dir?)" >&2
  exit 2
fi
jq -e '.version == 1 and (.mode == "scan" or .mode == "self-test")' preflight.json >/dev/null \
  || { echo "::error::preflight JSON envelope schema mismatch" >&2; exit 1; }
exit $status
```
