---
name: Preflight guard — `check-no-pnpm-dlx-less`
description: Standalone CI preflight script that fails fast on `pnpm dlx --package=less` (and npx/pnpx variants). Documents the JSON envelope, fixture suite, and caret-integrity guarantees.
type: feature
---

# Preflight Guard — `check-no-pnpm-dlx-less`

> **Purpose:** Fail the build before CI ever shells out the broken
> `pnpm dlx --package=less …` invocation, which is rejected by every
> available pnpm resolver (`ERR_PNPM_SPEC_NOT_SUPPORTED_BY_ANY_RESOLVER`).
> The fix is to compile LESS via `scripts/compile-less.mjs` (Node API,
> no CLI dlx round-trip).

## Files

| Path | Role |
|---|---|
| `scripts/check-no-pnpm-dlx-less.mjs` | The preflight guard (executable, Node 18+, no deps). |
| `scripts/check-no-pnpm-dlx-less.readme.md` | JSON-schema reference for CI tooling. |

## CLI surface

| Flag | Effect |
|---|---|
| _(none)_ | Scan `process.cwd()`, human-readable failure report on stderr. |
| `--json` | Emit machine-readable envelope on **stdout**, exit code preserved. |
| `--self-test` | Run the synthetic fixture suite (no filesystem touched). |
| `--scan-dir <path>` / `--scan-dir=<path>` | Scan a specific folder. Reported file paths are made relative to this root. |

All flags compose. `--scan-dir x --json` and `--self-test --json` both work.

### Exit codes (stable contract)

| Code | Meaning |
|---|---|
| `0` | Clean repo (or self-test passed). |
| `1` | Hits found / self-test failed. |
| `2` | Usage error (e.g. invalid `--scan-dir`) — **distinct from lint failure** so CI can tell a misconfigured invocation apart from a real find. |

## JSON envelope (version 1)

Two envelope shapes share `tool: "check-no-pnpm-dlx-less"` and `version: 1`:

- **`mode: "scan"`** — `{ ok, totalHits, hits: Hit[] }`
- **`mode: "self-test"`** — `{ total, passed, failed, ok, results: FixtureResult[] }`

### `Hit` shape (always-present fields)

```
file, offendingLine, offendingColumn, firstOffendingToken,
offendingCommand, offendingCommandTruncated, matchedToken (legacy ≤120),
offendingLineText,
rule: { id, label, description, pattern },
logical: { startLine, endLine, isMultiPhysicalLine, text },
candidate: { kind, origin, preview },
caret: { column, marker },
matchWindow: { text, caret }
```

- `offendingCommand` is the **canonical copy-paste rewrite target** (full whitespace-normalised matched span, ≤1000 chars). Prefer over the legacy `matchedToken`.
- `rule.id` is stable; `rule.label`/`description` are human-facing and may be reworded.
- New fields may be **added** without bumping `version`. Removal or type change → `version: 2`.

Full schema lives in `scripts/check-no-pnpm-dlx-less.readme.md`, including a copy-pasteable `jq`-based CI validation snippet.

## Fixture suite (current count: 67)

Organised in `SELF_TEST_FIXTURES` by category — every fixture carries `name`, `text`, `shouldMatch`, and `note`. Optional fields lock in finer-grained behavior:

| Optional field | Purpose |
|---|---|
| `expectedHitCount` | Asserts exact hit count (catches regressions to "one hit per logical line"). |
| `expectedOffendingLines: number[]` | Asserts the exact set of physical line numbers reported. |
| `expectedOffendingColumns: number[]` | Pinned `(line, column)` tuples — locks in `locateMatchInLogicalLine` mapping. Requires `expectedOffendingLines`. |

### Categories covered

1. **Single-line variants** — pnpm dlx, pnpm exec, npx, pnpx, bare `less`, version-pinned (`less@x.y.z`), quoted specs, flag-before-subcommand smuggling.
2. **Multi-line continuations** — POSIX `\`, PowerShell backtick `` ` ``, mixed styles in one blob.
3. **Per-physical-line reporting** — multiple offenders in one file each surface their own hit (locked via `expectedOffendingLines` + `expectedHitCount`).
4. **Whitespace obfuscation** — leading tabs/spaces, tab between flag and value.
5. **Statement-separator smuggling** — `;`, `&&`, `||`, `|` chains.
6. **Quoted `-c` / `-Command` payloads** — `bash -c`, `sh -c`, `pwsh -Command`, `powershell -Command`, `cmd /c`, `zsh -c`, with separators and escaped quotes inside.
7. **Tricky quoting / escaping (column regression)** — nested `bash -c`, escaped `\"`, mixed quote styles, prose with launcher token, multi-launcher lines, payload-spanning POSIX continuations.
8. **Multi-line quoted payloads + backticks (caret regression)** — payload spans physical lines (offender reported at its **true** physical line, not the launcher line); literal backticks inside `bash -c '…`whoami`…'` must NOT be confused with PowerShell continuations; pwsh `-Command` payload that itself uses backtick line-continuations.
9. **Negative cases** — clean prose, `--package=lessc-plugin`, `--package-lock=false` lookbehind guard, unrelated `tsc -c`, escaped-quote prose, allow-marker (`// preflight-allow-line`).

### Universal caret-integrity check

Runs on **every** fixture's hits via `toJsonHit(h)` projection (same shape `--json` consumers receive). For each projected hit it asserts:

1. `caret.column === offendingColumn` — convenience caret mirrors canonical column.
2. `matchWindow.caret` is leading whitespace + a non-empty run of `^` (no other characters).
3. Whitespace prefix length doesn't overflow `matchWindow.text` length.

**Why it matters:** catches regressions where the rendered terminal/UI marker visually drifts even though line/col numbers stay correct — invisible to numeric assertions, obvious to humans.

## Why a separate `expandCommandCandidates` step exists

The matcher tests every line through up to three candidate kinds (recorded in `hit.candidate.kind`):

| Kind | Origin |
|---|---|
| `original` | Raw logical line (after continuation joining). |
| `statement-split` | One side of a `;` / `&&` / `||` / `|` chain. |
| `quoted-payload` | Body of a `bash -c "…"` / `pwsh -Command "…"` / etc. — recursively re-expanded up to depth 3. |

The original line is **always** kept as a candidate, so any pattern that matched before continues to match — expansion is purely additive.

## Iteration history (this session)

| Step | Change |
|---|---|
| 1 | Launcher-token extraction prefers `pnpm`/`npx`/`pnpx` before falling back to first non-whitespace span. |
| 2 | `--json` output mode (envelope + per-hit fields). |
| 3 | Per-physical-line reporting (was: one hit per logical line). |
| 4 | `--scan-dir <path>` / `--scan-dir=<path>` flag, exit code `2` on usage errors. |
| 5 | `offendingCommand` (≤1000-char full snippet) + `offendingCommandTruncated`; legacy `matchedToken` (≤120) preserved. |
| 6 | 9 tricky quoting/escaping fixtures + `expectedOffendingColumns` runner support. |
| 7 | `scripts/check-no-pnpm-dlx-less.readme.md` JSON-schema reference. |
| 8 | 6 multi-line/backtick fixtures + universal caret-integrity check via `toJsonHit` projection. |

## Stability guarantees for CI tooling

- `version: 1` envelope — additive changes only without bump.
- All `Hit` fields are **always present** (no optional fields in the projected shape).
- `rule.id` is stable for grouping/filtering.
- Exit codes `0` / `1` / `2` are stable.
- `offendingCommand` is the canonical rewrite target.

## Anti-patterns to avoid

- **Don't** consume `rule.pattern` as a stable contract — it's `RegExp.source` and may change with rule tuning.
- **Don't** parse the human-readable stderr output — use `--json`.
- **Don't** treat `matchedToken` as authoritative — prefer `offendingCommand`.
- **Don't** skip the `version` field check in CI — it's the only signal of breaking changes.
