#!/usr/bin/env node
/**
 * check-no-pnpm-dlx-less.mjs
 *
 * Preflight guard: fails fast if any tracked file references the broken
 *   `pnpm dlx --package=less ...`
 * invocation. That spec is rejected by every available pnpm resolver and
 * crashes CI with `ERR_PNPM_SPEC_NOT_SUPPORTED_BY_ANY_RESOLVER`.
 *
 * The fix is to compile LESS via the local `scripts/compile-less.mjs`
 * helper (Node API, no CLI dlx round-trip). This script makes sure nobody
 * accidentally re-introduces the broken form in package.json scripts,
 * GitHub workflow YAML, PowerShell modules, docs, etc.
 *
 * Exits 0 on a clean repo, 1 with an actionable error otherwise.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

const ROOT = process.cwd();

// CLI flags. Kept dead simple — no full arg parser, just a presence check
// plus a tiny inline parser for `--scan-dir`.
//   --json            : emit machine-readable output on stdout instead of the
//                       human-readable failure report on stderr. Exit code is
//                       preserved (0 = clean, 1 = hits found / self-test failed)
//                       so CI gates keep working unchanged. Designed to be
//                       consumed by tooling such as GitHub Actions problem
//                       matchers, JetBrains "Run Anything" parsers, and the
//                       `jq`-based review scripts in `.lovable/scripts/`.
//   --self-test       : run the synthetic fixture suite (existing flag).
//   --scan-dir <path> : scan a specific folder instead of `process.cwd()`.
//                       Both `--scan-dir <path>` and `--scan-dir=<path>` are
//                       accepted. Relative paths are resolved against the
//                       current working directory. Reported file paths in
//                       both human and JSON output are made relative to the
//                       scan root, so editors can click through correctly.
// All flags compose: `--scan-dir x --json` and `--self-test --json` both work.
const JSON_MODE = process.argv.includes("--json");

/**
 * Parse `--scan-dir <path>` / `--scan-dir=<path>` from argv. Returns the
 * absolute resolved path, or `null` if the flag isn't present. Exits with
 * code 2 (distinct from the "hits found" exit 1) on usage errors so CI can
 * tell a misconfigured invocation apart from a real lint failure.
 */
function parseScanDirFlag(argv) {
    let raw = null;
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--scan-dir") {
            raw = argv[i + 1];
            if (raw === undefined || raw.startsWith("-")) {
                console.error(`[preflight] usage error: --scan-dir requires a path argument`);
                console.error(`            example: node scripts/check-no-pnpm-dlx-less.mjs --scan-dir ./standalone-scripts`);
                process.exit(2);
            }
            break;
        }
        if (a.startsWith("--scan-dir=")) {
            raw = a.slice("--scan-dir=".length);
            if (raw === "") {
                console.error(`[preflight] usage error: --scan-dir= requires a non-empty path`);
                process.exit(2);
            }
            break;
        }
    }
    if (raw === null) return null;
    const abs = isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
    let stats;
    try {
        stats = statSync(abs);
    } catch {
        console.error(`[preflight] usage error: --scan-dir path does not exist or is unreadable`);
        console.error(`            requested : ${raw}`);
        console.error(`            resolved  : ${abs}`);
        process.exit(2);
    }
    if (!stats.isDirectory()) {
        console.error(`[preflight] usage error: --scan-dir path is not a directory`);
        console.error(`            requested : ${raw}`);
        console.error(`            resolved  : ${abs}`);
        process.exit(2);
    }
    return abs;
}

const SCAN_DIR_OVERRIDE = parseScanDirFlag(process.argv.slice(2));
// Effective scan root: explicit override wins, otherwise the cwd. The walker
// and the per-hit `relative(...)` calls must use the SAME root so reported
// file paths line up with the directory the user asked us to scan.
const SCAN_ROOT = SCAN_DIR_OVERRIDE ?? ROOT;

/**
 * Build the structured per-hit payload emitted in `--json` mode. Keeping the
 * shape in ONE place guarantees the human report and the JSON report stay in
 * sync — every field a CI tool wants to act on is derived from the same
 * `hit` object the human formatter already consumes.
 *
 * Stable contract (additive changes only):
 *   file, rule:{id,label,description,pattern}
 *   offendingLine, offendingColumn          ← 1-indexed, point at first token
 *   firstOffendingToken                     ← launcher (`pnpm`/`npx`/`pnpx`)
 *   matchedToken                            ← full matched span (≤120 chars)
 *   offendingLineText                       ← raw source line (≤200 chars)
 *   logical:{startLine,endLine,isMultiPhysicalLine,text}
 *   candidate:{kind,origin,preview}
 *   caret:{column,marker}                   ← physical-line caret pin
 *   matchWindow:{text,caret}                ← ±32-char window with `^^^`
 */
function toJsonHit(hit) {
    return {
        file: hit.file,
        rule: {
            id: hit.ruleId,
            label: hit.ruleLabel,
            description: hit.ruleDescription,
            pattern: hit.rulePattern,
        },
        offendingLine: hit.offendingLine,
        offendingColumn: hit.offendingColumn,
        firstOffendingToken: hit.firstOffendingToken,
        // Full whitespace-normalised matched command snippet (≤1000 chars).
        // Tooling should prefer this field over `matchedToken` when surfacing
        // the offender to a human — it's the copy-paste-ready rewrite target.
        offendingCommand: hit.offendingCommand,
        offendingCommandTruncated: hit.offendingCommandTruncated === true,
        matchedToken: hit.matchedToken,
        offendingLineText: hit.offendingLineText,
        logical: {
            startLine: hit.logicalLine,
            endLine: hit.lastLine,
            isMultiPhysicalLine: hit.isMultiPhysicalLine,
            text: hit.logicalText,
        },
        candidate: {
            kind: hit.candidateKind,
            origin: hit.candidateOrigin,
            preview: hit.candidatePreview,
        },
        caret: {
            column: hit.offendingColumn,
            marker: hit.physicalCaret,
        },
        matchWindow: {
            text: hit.matchWindow,
            caret: hit.matchCaret,
        },
    };
}

// Patterns we explicitly forbid. The regexes are deliberately tolerant so
// that reformatting, extra flags, or shell line-continuations cannot smuggle
// the bad command past this preflight check.
//
// All of these crash pnpm-managed CI runners with:
//   ERR_PNPM_SPEC_NOT_SUPPORTED_BY_ANY_RESOLVER
//     --package=less isn't supported by any available resolver.
// because pnpm rejects the npx-style `--package` flag as a package spec.
// Use scripts/compile-less.mjs (which imports `less` directly) instead.
//
// Notes on tolerance:
//  - `[^\n]*?` between the launcher token and `--package` permits any number
//    of intermediate flags (e.g. `--silent`, `-y`, `--prefer-offline`)
//    without allowing a newline to escape the match. Line continuations are
//    pre-normalized below so multi-line forms collapse onto a single logical
//    line before matching.
//  - `(?:less(?:@[^\s'"`]+)?)` matches both bare `less` and version-pinned
//    `less@4.2.0` specs, with optional surrounding quotes.
// Trailing `(?![\w-])` anchors `less` at a word/hyphen boundary on its right
// edge so package specs like `lessc-plugin` or `lessfs` do NOT match while
// `less`, `less@4.2.0`, `"less"`, `'less@x'` all do.
const PKG_SPEC = String.raw`(?:["']?less(?![\w-])(?:@[^\s'"\x60]+)?["']?)`;
// Lookbehind `(?<![\w-])` enforces a clean boundary before `--package` so
// neither `harmless` nor `--package-lock=false` get matched, while still
// allowing a leading space, quote, or start-of-string.
const PKG_FLAG = String.raw`(?<![\w-])--package(?:\s*=\s*|\s+)${PKG_SPEC}`;

// Each entry pairs a stable `id` and human-readable `label` with the regex,
// so that when the checker fires we can tell the user EXACTLY which rule
// matched and why. The `description` shows up under "Detection rationale"
// in the failure report — keep it short, one sentence, no trailing period.
const FORBIDDEN_PATTERNS = [
    {
        id: "pnpm-dlx--package-less",
        label: "`pnpm dlx … --package[=| ]less[…]`",
        description: "pnpm dlx with a `--package=less` (or space-separated) spec — the canonical broken form",
        pattern: new RegExp(String.raw`\bpnpm\s+dlx\b[^\n]*?${PKG_FLAG}`),
    },
    {
        id: "pnpm-exec--package-less",
        label: "`pnpm exec … --package[=| ]less[…]`",
        description: "pnpm exec with `--package=less` — same broken resolver path as `pnpm dlx`",
        pattern: new RegExp(String.raw`\bpnpm\s+exec\b[^\n]*?${PKG_FLAG}`),
    },
    {
        id: "pnpm-flag-before-subcommand",
        label: "`pnpm … --package=less … dlx|exec` (flag before subcommand)",
        description: "pnpm with `--package=less` placed before the `dlx`/`exec` subcommand — flag-smuggling variant",
        pattern: new RegExp(String.raw`\bpnpm\b[^\n]*?${PKG_FLAG}[^\n]*?\b(?:dlx|exec)\b`),
    },
    {
        id: "npx--package-less",
        label: "`npx … --package[=| ]less[…]`",
        description: "npx with `--package=less` — also fails when `npx` is shimmed by pnpm in CI",
        pattern: new RegExp(String.raw`\bnpx\b[^\n]*?${PKG_FLAG}`),
    },
    {
        id: "pnpx--package-less",
        label: "`pnpx … --package[=| ]less[…]`",
        description: "legacy `pnpx` alias with `--package=less` — same failure mode as `pnpm dlx`",
        pattern: new RegExp(String.raw`\bpnpx\b[^\n]*?${PKG_FLAG}`),
    },
    {
        id: "pnpm-dlx-bare-less",
        label: "`pnpm dlx less[@…]` (bare package)",
        description: "bare `pnpm dlx less` (with or without version pin) — funnels through the same broken resolver path",
        pattern: new RegExp(String.raw`\bpnpm\s+dlx\s+(?:-{1,2}[^\s]+\s+)*${PKG_SPEC}(?:\s|$)`),
    },
    {
        id: "pnpx-bare-less",
        label: "`pnpx less[@…]` (bare package)",
        description: "bare `pnpx less` form — same failure mode",
        pattern: new RegExp(String.raw`\bpnpx\s+(?:-{1,2}[^\s]+\s+)*${PKG_SPEC}(?:\s|$)`),
    },
];

// Folders that are either generated, archived, or out of scope.
const SKIP_DIRS = new Set([
    "node_modules",
    ".git",
    ".release",
    "skipped",
    "dist",
    ".cache",
    ".lovable",
    "v1.133-working", // archived snapshot — read-only per project policy
]);

// Only scan text-ish files. Anything else (images, fonts, lockfiles,
// binaries) is skipped to keep the preflight cheap.
const SCAN_EXTENSIONS = new Set([
    ".json", ".js", ".mjs", ".cjs", ".ts", ".tsx",
    ".yml", ".yaml",
    ".md", ".txt",
    ".ps1", ".psm1", ".sh", ".bash",
    ".less", ".css", ".html",
]);

// Files that legitimately document the forbidden pattern (i.e. this script
// itself, or a future "what NOT to do" note). Keep this allow-list tiny.
const ALLOWLIST = new Set([
    "scripts/check-no-pnpm-dlx-less.mjs",
]);

function shouldScanFile(relPath) {
    if (ALLOWLIST.has(relPath.split(sep).join("/"))) return false;
    const lastDot = relPath.lastIndexOf(".");
    if (lastDot === -1) return false;
    const ext = relPath.slice(lastDot).toLowerCase();
    return SCAN_EXTENSIONS.has(ext);
}

/**
 * Core matcher — given a raw text blob (as if read from a file), returns
 * the list of forbidden-invocation hits found inside it. Shared by the
 * filesystem walker AND the `--self-test` fixture runner so they exercise
 * the exact same code path.
 */
function matchTextForOffenders(text, relPath) {
    const found = [];
    const rawLines = text.split(/\r?\n/);

    // Build "logical lines" by joining shell continuations so a command
    // split across multiple physical lines is matched as a single string.
    // We track each segment's source line + its byte offset within the
    // joined buffer so a match's `index` can be mapped back to the exact
    // physical line that contains the first offending token.
    //
    // Recognized continuations:
    //   - POSIX shell:    trailing `\` at end of line
    //   - PowerShell:     trailing backtick `` ` `` at end of line
    const logical = [];
    let buffer = "";
    let bufferStartLine = 1;
    let segments = [];
    for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i];
        const continued = /[\\\x60]\s*$/.test(line);
        const stripped = continued ? line.replace(/[\\\x60]\s*$/, "") : line;
        if (buffer === "") {
            bufferStartLine = i + 1;
            segments = [];
        }
        const joiner = buffer ? " " : "";
        const segmentOffset = buffer.length + joiner.length;
        buffer += joiner + stripped;
        segments.push({ sourceLine: i + 1, offsetInBuffer: segmentOffset, length: stripped.length });
        if (!continued) {
            logical.push({ line: bufferStartLine, text: buffer, segments });
            buffer = "";
            segments = [];
        }
    }
    if (buffer !== "") {
        logical.push({ line: bufferStartLine, text: buffer, segments });
    }

    // Per-FILE deduplication keyed by physical line. Previously the matcher
    // recorded at most ONE hit per logical line — so if a single file had
    // forbidden invocations on, say, lines 12, 47, and 88 (each on its own
    // logical line, or even multiple within the same multi-line continuation),
    // the report would still pinpoint just one of them and the developer
    // would have to re-run the checker after each fix to discover the next.
    //
    // We now surface ONE hit PER PHYSICAL LINE that contains a forbidden
    // token, so a single run lists every offender. Within a given physical
    // line we still keep only the FIRST rule that fires (avoids duplicate
    // noise when, e.g., both `pnpm-dlx--package-less` and
    // `pnpm-flag-before-subcommand` could conceivably match the same span).
    /** @type {Map<number, object>} */
    const hitsByPhysicalLine = new Map();

    for (const { line: logicalLineNo, text: logicalLine, segments: lineSegments } of logical) {
        // Expand the logical line into one-or-more candidate command strings:
        //   1. The original logical line itself (covers the simple case).
        //   2. Each statement after splitting on shell separators
        //      (`;`, `&&`, `||`, `|`) — so `foo; pnpm dlx --package=less x`
        //      is checked as the second statement on its own.
        //   3. The unwrapped contents of quoted `-c "..."` / `-Command "..."`
        //      / `--command "..."` payloads (bash, sh, zsh, pwsh, powershell,
        //      cmd /c) — so `bash -c "pnpm dlx --package=less ..."` is
        //      re-scanned with quotes peeled off.
        //
        // Every candidate carries the SAME `lineSegments` from the parent
        // logical line, so a hit's `match.index` still maps back to the
        // correct physical source line via the existing segment walk. The
        // candidate's `offsetInCandidate` is purely cosmetic and not used
        // for line attribution — we conservatively attribute multi-statement
        // and unwrapped-quote hits to the first physical line of the parent
        // logical command, which is always correct (no false attribution).
        const candidates = expandCommandCandidates(logicalLine);

        for (const candidate of candidates) {
            const candidateText = candidate.text;
            for (const rule of FORBIDDEN_PATTERNS) {
                // Walk EVERY occurrence of this rule inside the candidate, not
                // just the first. The forbidden patterns are non-global, so we
                // re-run `pattern.exec` against successively shorter slices of
                // the candidate text and accumulate the absolute index by hand.
                // This lets us detect e.g. two separate offenders on the same
                // logical line that happen to live on different physical lines:
                //   `pnpm dlx --package=less a` <newline> `npx --package less b`
                // collapses into one logical buffer (no continuation), but each
                // physical line should still surface its own hit.
                let cursor = 0;
                while (cursor <= candidateText.length) {
                    const slice = candidateText.slice(cursor);
                    const localMatch = rule.pattern.exec(slice);
                    if (localMatch === null) break;
                    const match = {
                        0: localMatch[0],
                        index: cursor + localMatch.index,
                    };
                    // Advance the cursor past this match so the next iteration
                    // looks for a SUBSEQUENT occurrence. Use +1 as a floor to
                    // guarantee progress on zero-length pathological matches.
                    cursor = match.index + Math.max(1, localMatch[0].length);


                // Map back to a physical line + column.
                //
                // For the ORIGINAL candidate, `match.index` directly points
                // into the joined logical line, so the segment walk gives us
                // an exact (line, column).
                //
                // For DERIVED candidates (statement-split / quoted-payload),
                // `match.index` only points into the synthetic candidate
                // string, which doesn't share a coordinate space with the
                // joined logical line. To recover precision, we anchor on
                // the matched token's first significant token (the launcher:
                // `pnpm`/`npx`/`pnpx`) and look it up inside the original
                // logical line. That gives us a real index in the joined
                // buffer, which then maps to the exact physical line.
                const isOriginalCandidate = candidate.kind === "original";
                const indexInLogical = locateMatchInLogicalLine(
                    logicalLine,
                    match[0],
                    isOriginalCandidate ? match.index : -1,
                );

                let offendingSegment = lineSegments[0];
                for (const seg of lineSegments) {
                    if (seg.offsetInBuffer <= indexInLogical) offendingSegment = seg;
                    else break;
                }
                const offendingLine = offendingSegment?.sourceLine ?? logicalLineNo;
                // Column within the offending physical line (1-indexed).
                // The segment ALWAYS starts at column 1 of its source line —
                // we only strip a trailing continuation marker (`\` / `` ` ``)
                // from the END of the line during normalisation, never the
                // start. So the column is just the offset inside the segment
                // plus 1, bounded by the physical line's actual length.
                const rawOffendingLine = rawLines[offendingLine - 1] ?? "";
                const offsetInSegment = indexInLogical - (offendingSegment?.offsetInBuffer ?? 0);
                const offendingColumn = Math.max(
                    1,
                    Math.min(
                        Math.max(rawOffendingLine.length, 1),
                        offsetInSegment + 1,
                    ),
                );
                const offendingLineText = rawOffendingLine.trim().slice(0, 200);

                // Inline allow-list: any physical line in the joined logical
                // command ending with the marker `preflight-allow-line` (in a
                // // or # or * comment) suppresses the hit. Used for genuine
                // documentation strings that have to mention the bad pattern.
                // Only the SPECIFIC offending physical line is consulted (not
                // every segment of the logical command) so a multi-line
                // continuation can suppress one offender without masking
                // unrelated offenders elsewhere in the same logical buffer.
                const ALLOW_MARKER = /preflight-allow-line/;
                const offendingLineAllowed = ALLOW_MARKER.test(rawOffendingLine);
                // Also honour the legacy semantics: if ANY segment of the
                // logical command carries the marker, suppress — this keeps
                // existing allow-marker fixtures working unchanged.
                const anySegmentAllowed = lineSegments.some((seg) =>
                    ALLOW_MARKER.test(rawLines[seg.sourceLine - 1] ?? "")
                );
                if (offendingLineAllowed || anySegmentAllowed) continue;

                // Per-PHYSICAL-LINE dedup: only the first rule that fires for
                // a given physical line is kept. Subsequent matches on the
                // same physical line (whether from a later rule, a derived
                // candidate, or a re-scan) are silently ignored — they would
                // pinpoint the same offender to the same column.
                if (hitsByPhysicalLine.has(offendingLine)) continue;

                const isMultiPhysicalLine = lineSegments.length > 1;
                const lastSegmentLine = lineSegments[lineSegments.length - 1]?.sourceLine ?? logicalLineNo;

                // Build a "matched substring with caret" preview so the user
                // sees EXACTLY which slice of the candidate fired the rule.
                // We bound the window to ±32 chars around the match so the
                // line stays readable even on very long commands.
                const WINDOW = 32;
                const winStart = Math.max(0, match.index - WINDOW);
                const winEnd = Math.min(candidateText.length, match.index + match[0].length + WINDOW);
                const windowText = candidateText.slice(winStart, winEnd);
                const caretPad = " ".repeat(match.index - winStart);
                const caretBar = "^".repeat(Math.max(1, Math.min(match[0].length, winEnd - match.index)));

                // Same-line caret pinned to the EXACT column inside the raw
                // physical source line — this is the new precision feature.
                // Useful when the match starts mid-line (e.g. after `bash -c "`).
                const physicalCaret = " ".repeat(Math.max(0, offendingColumn - 1)) + "^";
                // First "offending token" — we PREFER the launcher command
                // (`pnpm` / `npx` / `pnpx`) since that's the actionable verb
                // a developer needs to locate and rewrite. The matched span
                // can begin with a stray quote, an open paren from a shell
                // wrapper, or a flag that was hoisted before the subcommand
                // (the `pnpm-flag-before-subcommand` rule), so a naive "first
                // non-whitespace run" reports something cosmetic like `"pnpm`
                // or `--package=less` instead of the launcher itself.
                //
                // Strategy:
                //   1. Scan the matched span for the first whole-word
                //      occurrence of `pnpm`, `npx`, or `pnpx` (in matched-
                //      span order, so `pnpm dlx` reports `pnpm`, not `npx`
                //      even if `npx` shows up later in the same line). We
                //      use a word-boundary regex so `pnpmx` / `npx-cli` /
                //      `pnpxxx` are correctly rejected.
                //   2. If no launcher is found inside the matched span (a
                //      defensive case — every current rule embeds one), fall
                //      back to the prior behaviour: the leading run of
                //      non-whitespace characters of the matched span.
                //
                // The result is always trimmed to ≤ 60 chars so it stays
                // readable in the failure report.
                const LAUNCHER_TOKEN = /\b(pnpm|npx|pnpx)\b/;
                const launcherMatch = match[0].match(LAUNCHER_TOKEN);
                const firstOffendingToken = (
                    launcherMatch?.[0]
                        ?? match[0].match(/^\S+/)?.[0]
                        ?? match[0]
                ).slice(0, 60);

                // The FULL matched span — same payload as `matchedToken` but
                // without the legacy ≤120-char ceiling that was originally
                // chosen to keep the report compact. We cap at 1000 chars
                // purely as a safety net against pathological input (e.g. a
                // single-line minified blob); typical real-world offenders
                // are well under 200 chars and surface untruncated. We also
                // collapse internal runs of whitespace (including the spaces
                // we synthesise when joining shell continuations) into a
                // single space so the snippet renders as one tidy command.
                const offendingCommandRaw = match[0].trim();
                const offendingCommandNormalised = offendingCommandRaw.replace(/\s+/g, " ");
                const OFFENDING_CMD_CEILING = 1000;
                const offendingCommand = offendingCommandNormalised.length > OFFENDING_CMD_CEILING
                    ? offendingCommandNormalised.slice(0, OFFENDING_CMD_CEILING) + "…"
                    : offendingCommandNormalised;
                const offendingCommandTruncated = offendingCommandNormalised.length > OFFENDING_CMD_CEILING;

                hitsByPhysicalLine.set(offendingLine, {
                    file: relPath,
                    logicalLine: logicalLineNo,
                    lastLine: lastSegmentLine,
                    offendingLine,
                    offendingColumn,
                    firstOffendingToken,
                    physicalCaret,
                    isMultiPhysicalLine,
                    matchedToken: match[0].trim().slice(0, 120),
                    // Full offending command snippet (whitespace-normalised,
                    // capped at 1000 chars). This is the value to copy/paste
                    // when rewriting — `matchedToken` is kept for
                    // back-compat with downstream consumers that already
                    // depend on the ≤120-char ceiling.
                    offendingCommand,
                    offendingCommandTruncated,
                    logicalText: logicalLine.trim().slice(0, 200),
                    offendingLineText,
                    // Rule-level diagnostics (which forbidden pattern fired):
                    ruleId: rule.id,
                    ruleLabel: rule.label,
                    ruleDescription: rule.description,
                    rulePattern: rule.pattern.source,
                    // Candidate-level diagnostics (which transformation surfaced it):
                    candidateKind: candidate.kind, // "original" | "statement-split" | "quoted-payload"
                    candidateOrigin: candidate.origin, // human-readable origin description
                    candidatePreview: candidateText.length > 200
                        ? candidateText.slice(0, 200) + "…"
                        : candidateText,
                    matchWindow: windowText,
                    matchCaret: caretPad + caretBar,
                });
                }
                // NOTE: we deliberately do NOT `break` out of the rule loop
                // here. A single candidate can contain multiple offenders on
                // DIFFERENT physical lines (e.g. two non-continued shell
                // commands sharing the same logical buffer), and we want
                // every physical line to get its own hit. The per-line
                // `hitsByPhysicalLine.has(...)` guard above prevents
                // duplicate noise on the SAME physical line.
            }
            // We also do NOT break out of the candidate loop early — derived
            // candidates (statement-split / quoted-payload) may surface
            // offenders that the original candidate missed (e.g. a hit
            // hidden inside a `bash -c "…"` payload that the top-level
            // regex skipped because the launcher token was inside quotes).
        }
    }

    // Flatten the per-physical-line map into the returned array, sorted by
    // physical line ascending so the failure report walks the file top-to-
    // bottom — easier for a developer to skim and fix in one editor pass.
    const sortedLines = [...hitsByPhysicalLine.keys()].sort((a, b) => a - b);
    for (const lineNo of sortedLines) {
        const hit = hitsByPhysicalLine.get(lineNo);
        if (hit !== undefined) found.push(hit);
    }
    return found;
}

/**
 * Find the absolute index of `matchedText` inside the joined `logicalLine`.
 *
 * For the original candidate the caller already knows the index — pass it
 * via `knownIndex` (≥ 0) to short-circuit the search. For derived candidates
 * (statement-split / quoted-payload), `knownIndex` is -1 and we have to
 * recover the position by searching.
 *
 * Strategy:
 *   1. Try a direct `indexOf(matchedText)` — fast path, works when the
 *      candidate text appears verbatim in the logical line (i.e. the
 *      statement-split case where we just sliced the logical line).
 *   2. If that misses (e.g. quoted-payload case where escapes were
 *      unwrapped), fall back to anchoring on the leading non-whitespace
 *      token of the match (always one of `pnpm`/`npx`/`pnpx`). We scan
 *      every occurrence of that anchor in the logical line and pick the
 *      first one whose surrounding slice still mentions `--package` or
 *      the bare `less` spec downstream — strong evidence it's the offender.
 *   3. As a final defensive fallback, return 0 — that maps to the first
 *      physical line, which is the prior behaviour (no regression).
 *
 * Returns an integer in [0, logicalLine.length).
 */
function locateMatchInLogicalLine(logicalLine, matchedText, knownIndex) {
    if (knownIndex >= 0) return knownIndex;

    // (1) Verbatim search.
    const direct = logicalLine.indexOf(matchedText);
    if (direct !== -1) return direct;

    // (2) Anchor on the leading token of the match.
    const anchor = matchedText.match(/^\S+/)?.[0];
    if (!anchor) return 0;

    let bestIdx = -1;
    let searchFrom = 0;
    while (searchFrom < logicalLine.length) {
        const idx = logicalLine.indexOf(anchor, searchFrom);
        if (idx === -1) break;
        // Word-boundary check so `pnpm` doesn't match inside `pnpmx`.
        const before = idx === 0 ? "" : logicalLine[idx - 1];
        const after = logicalLine[idx + anchor.length] ?? "";
        const leftOK = idx === 0 || /\s/.test(before) || /["'`]/.test(before);
        const rightOK = after === "" || /\s/.test(after) || /["'`]/.test(after);
        if (leftOK && rightOK) {
            const lookahead = logicalLine.slice(idx, idx + 200);
            if (/--package|(?<![\w-])less(?![\w-])/.test(lookahead)) {
                bestIdx = idx;
                break;
            }
            if (bestIdx === -1) bestIdx = idx; // remember as fallback
        }
        searchFrom = idx + anchor.length;
    }

    return bestIdx >= 0 ? bestIdx : 0;
}

/**
 * Expand a logical command line into the list of candidate strings that
 * should each be tested against the FORBIDDEN_PATTERNS. The expansion is
 * conservative — it only adds candidates, never removes the original — so
 * any pattern that already matched on the raw line continues to match.
 *
 * The expansion handles two smuggling vectors:
 *
 *   (a) Statement separators: shell operators `;`, `&&`, `||`, `|` chain
 *       multiple commands on one logical line. We split on those, OUTSIDE
 *       quoted regions, and add each non-empty statement as its own
 *       candidate. Example:
 *           `echo go; pnpm dlx --package=less x`
 *       becomes candidates:
 *           [<original>, "echo go", "pnpm dlx --package=less x"]
 *
 *   (b) Quoted `-c` / `-Command` / `--command` payloads: `bash -c "..."`,
 *       `sh -c '...'`, `pwsh -Command "..."`, `powershell -Command "..."`,
 *       `cmd /c "..."`, `zsh -c "..."`. We extract the quoted body and add
 *       it as a candidate (with internal `\"` / `\'` escapes unescaped),
 *       then recursively expand that body too so nested separators inside
 *       a `-c` payload are also caught. Example:
 *           `bash -c "pnpm dlx --package=less x; echo done"`
 *       becomes candidates:
 *           [<original>, "pnpm dlx --package=less x; echo done",
 *            "pnpm dlx --package=less x", "echo done"]
 *
 * Recursion depth is capped at 3 to bound work on adversarial input.
 */
function expandCommandCandidates(logicalLine, depth = 0, parentOrigin = "logical line") {
    /** @type {Array<{text:string, kind:string, origin:string}>} */
    const candidates = [{
        text: logicalLine,
        kind: depth === 0 ? "original" : "quoted-payload",
        origin: depth === 0 ? "raw logical line" : parentOrigin,
    }];
    const seen = new Set([logicalLine]);
    if (depth >= 3) return candidates;

    // (b) Extract quoted payloads from `-c "..."` / `-Command "..."` etc.
    // The launcher token is matched case-insensitively against a small
    // whitelist of known shell wrappers so we don't false-positive on
    // unrelated `-c` flags (e.g. `tsc -c`).
    const QUOTED_CMD_PATTERN = new RegExp(
        String.raw`\b(bash|sh|zsh|pwsh|powershell|cmd)\s+(-c|-Command|--command|/c|/C)\s+("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')`,
        "gi",
    );
    let m;
    while ((m = QUOTED_CMD_PATTERN.exec(logicalLine)) !== null) {
        const launcher = m[1];
        const flag = m[2];
        const raw = m[3];
        // Strip outer quote and unescape the matching quote-char.
        const quote = raw[0];
        const body = raw.slice(1, -1).replace(new RegExp(`\\\\${quote}`, "g"), quote);
        if (body && !seen.has(body)) {
            seen.add(body);
            const origin = `unwrapped from \`${launcher} ${flag} ${quote}…${quote}\``;
            // Recurse so separators INSIDE the quoted body are also split.
            for (const nested of expandCommandCandidates(body, depth + 1, origin)) {
                if (!seen.has(nested.text)) {
                    seen.add(nested.text);
                    candidates.push(nested);
                }
            }
        }
    }

    // (a) Split on shell statement separators OUTSIDE quoted regions.
    // We track quote state (' and ") and skip operator characters that
    // appear inside a quoted span. Backtick is also treated as a quote
    // char to avoid splitting inside command substitution `$(...)` is
    // left untouched on purpose (rare in our scan corpus and would need
    // a real parser).
    const statements = splitOnShellSeparators(logicalLine);
    if (statements.length > 1) {
        for (const stmt of statements) {
            const trimmed = stmt.trim();
            if (trimmed && !seen.has(trimmed)) {
                seen.add(trimmed);
                candidates.push({
                    text: trimmed,
                    kind: "statement-split",
                    origin: depth === 0
                        ? "split on shell separator (`;` / `&&` / `||` / `|`)"
                        : `split on shell separator inside ${parentOrigin}`,
                });
            }
        }
    }

    return candidates;
}

/**
 * Split a command string on top-level shell statement separators
 * (`;`, `&&`, `||`, `|`) while respecting single-quote, double-quote, and
 * backtick boundaries. Returns the list of statement substrings (un-trimmed).
 */
function splitOnShellSeparators(text) {
    const out = [];
    let buf = "";
    let quote = null; // ' " ` or null
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const next = text[i + 1];
        if (quote) {
            // Honour `\X` escapes inside double-quoted strings only (POSIX).
            if (quote === '"' && ch === "\\" && next !== undefined) {
                buf += ch + next;
                i++;
                continue;
            }
            buf += ch;
            if (ch === quote) quote = null;
            continue;
        }
        if (ch === '"' || ch === "'" || ch === "`") {
            quote = ch;
            buf += ch;
            continue;
        }
        // Two-char operators first.
        if ((ch === "&" && next === "&") || (ch === "|" && next === "|")) {
            out.push(buf);
            buf = "";
            i++;
            continue;
        }
        // One-char separators.
        if (ch === ";" || ch === "|") {
            out.push(buf);
            buf = "";
            continue;
        }
        buf += ch;
    }
    if (buf !== "") out.push(buf);
    return out;
}

function walk(dir, hits) {
    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    } catch {
        return;
    }

    for (const entry of entries) {
        const abs = join(dir, entry.name);
        // Report file paths RELATIVE TO THE SCAN ROOT so that when the user
        // passes `--scan-dir <subdir>`, the reported paths are anchored at
        // that subdir (e.g. `pkg/foo.sh`) instead of being absolute or
        // anchored at cwd. Editors / CI parsers can then resolve them by
        // joining with the scan root the user already knows about.
        const rel = relative(SCAN_ROOT, abs);

        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) continue;
            walk(abs, hits);
            continue;
        }

        if (!entry.isFile()) continue;
        if (!shouldScanFile(rel)) continue;

        let stats;
        try { stats = statSync(abs); } catch { continue; }
        if (stats.size > 2 * 1024 * 1024) continue;

        let text;
        try {
            text = readFileSync(abs, "utf-8");
        } catch {
            continue;
        }

        for (const hit of matchTextForOffenders(text, rel.split(sep).join("/"))) {
            hits.push(hit);
        }
    }
}

/* ─────────────────────────────────────────────────────────────────────── */
/*  Self-test mode (`--self-test`)                                         */
/* ─────────────────────────────────────────────────────────────────────── */
/*  Synthetic fixtures exercising every smuggling vector this guard is     */
/*  expected to catch — plus legitimate-looking strings it must NOT flag.  */
/*  Each fixture: { name, text, shouldMatch, note }.                      */
/* ─────────────────────────────────────────────────────────────────────── */

const SELF_TEST_FIXTURES = [
    /* ── positive: single-line variants ─────────────────────────────── */
    { name: "single-line: pnpm dlx --package=less",
      text: "pnpm dlx --package=less lessc in.less out.css\n",
      shouldMatch: true, note: "canonical broken form" },
    { name: "single-line: pnpm dlx --package <space> spec",
      text: "pnpm dlx --package less lessc in.less out.css\n",
      shouldMatch: true, note: "space separator instead of `=`" },
    { name: "single-line: extra flags between dlx and --package",
      text: "pnpm dlx --silent --prefer-offline --no-color --package=less lessc x y\n",
      shouldMatch: true, note: "many intervening flags" },
    { name: "single-line: version-pinned spec",
      text: "pnpm dlx --package=less@4.2.0 lessc in.less out.css\n",
      shouldMatch: true, note: "less@x.y.z version pin" },
    { name: "single-line: double-quoted spec",
      text: `pnpm dlx --package "less" lessc in.less out.css\n`,
      shouldMatch: true, note: "double-quoted package name" },
    { name: "single-line: single-quoted version-pinned spec",
      text: `pnpm dlx --package='less@4.2.0' lessc in.less out.css\n`,
      shouldMatch: true, note: "single-quoted version-pinned spec" },

    /* ── positive: pnpm exec variants ────────────────────────────────── */
    { name: "single-line: pnpm exec --package less",
      text: "pnpm exec --package less lessc in.less out.css\n",
      shouldMatch: true, note: "pnpm exec (same broken resolver path)" },
    { name: "single-line: pnpm exec with extra flags + version pin",
      text: "pnpm exec --silent -y --package=less@4.2.0 lessc x y\n",
      shouldMatch: true, note: "pnpm exec + flags + version pin" },
    { name: "single-line: pnpm --package=less ... dlx (flag before subcommand)",
      text: "pnpm --silent --package=less dlx lessc in.less out.css\n",
      shouldMatch: true, note: "flag-before-subcommand smuggling" },
    { name: "single-line: pnpm --package=less ... exec",
      text: "pnpm --package=less exec lessc in.less out.css\n",
      shouldMatch: true, note: "flag-before-exec subcommand" },

    /* ── positive: npx / pnpx variants ───────────────────────────────── */
    { name: "single-line: npx --package less",
      text: "npx --package less lessc in.less out.css\n",
      shouldMatch: true, note: "npx (also crashes when run under pnpm shim)" },
    { name: "single-line: npx -y --package=less@x",
      text: "npx -y --package=less@4.2.0 lessc in.less out.css\n",
      shouldMatch: true, note: "npx with -y flag and version pin" },
    { name: "single-line: pnpx --package less",
      text: "pnpx --package less lessc in.less out.css\n",
      shouldMatch: true, note: "legacy pnpx alias" },

    /* ── positive: bare-package forms ────────────────────────────────── */
    { name: "single-line: bare `pnpm dlx less`",
      text: "pnpm dlx less in.less out.css\n",
      shouldMatch: true, note: "bare package without --package flag still hits resolver bug" },
    { name: "single-line: bare `pnpm dlx less@x`",
      text: "pnpm dlx less@4.2.0 in.less out.css\n",
      shouldMatch: true, note: "bare version-pinned form" },
    { name: "single-line: bare `pnpx less`",
      text: "pnpx less in.less out.css\n",
      shouldMatch: true, note: "bare pnpx form" },

    /* ── positive: multi-line POSIX `\\` continuations ───────────────── */
    { name: "multi-line POSIX: pnpm dlx \\\\ --package=less \\\\ lessc",
      text: "pnpm dlx \\\n  --package=less \\\n  lessc in.less out.css\n",
      shouldMatch: true, note: "POSIX backslash continuation across 3 lines" },
    { name: "multi-line POSIX: every token on its own line",
      text: "pnpm \\\n  dlx \\\n  --silent \\\n  --package=less \\\n  lessc x y\n",
      shouldMatch: true, note: "every token on its own line via backslash" },
    { name: "multi-line POSIX: npx with version-pinned spec",
      text: "npx -y \\\n  --package=less@4.2.0 \\\n  lessc in.less out.css\n",
      shouldMatch: true, note: "npx + version-pin across continuation" },

    /* ── positive: multi-line PowerShell backtick continuations ──────── */
    { name: "multi-line PS: pnpm dlx ` --package less ` lessc",
      text: "pnpm dlx `\n  --silent `\n  --package less `\n  lessc in.less out.css\n",
      shouldMatch: true, note: "PowerShell backtick continuation" },
    { name: "multi-line PS: pnpm exec ` --package=less@x",
      text: "pnpm exec `\n  --package=less@4.2.0 `\n  lessc in.less out.css\n",
      shouldMatch: true, note: "PowerShell + pnpm exec + version-pin" },

    /* ── positive: mixed continuation styles in same blob ────────────── */
    { name: "mixed: PS backtick then POSIX backslash in same file",
      text: "pnpm dlx `\n  --package=less `\n  lessc a b\n\nnpx \\\n  --package less \\\n  lessc c d\n",
      shouldMatch: true, note: "two separate offenders, different continuation styles",
      // Two distinct logical commands → two physical-line hits (lines 1 and 5).
      expectedHitCount: 2,
      expectedOffendingLines: [1, 5] },

    /* ── positive: per-physical-line reporting ───────────────────────── */
    // These fixtures lock in the new "one hit per offending physical line"
    // contract — previously the matcher reported only the first hit per
    // logical line and stopped, so multi-offender files needed multiple
    // checker runs to surface every problem.
    { name: "per-line: three separate single-line offenders in one file",
      text:
          "echo first\n" +
          "pnpm dlx --package=less compile a.less a.css\n" +
          "echo middle\n" +
          "npx --silent --package less compile b.less b.css\n" +
          "echo third\n" +
          "pnpm exec --package=less@4.2.0 compile c.less c.css\n",
      shouldMatch: true,
      note: "three separate offenders on lines 2/4/6 must each surface their own hit",
      expectedHitCount: 3,
      expectedOffendingLines: [2, 4, 6] },
    { name: "per-line: bare offender + quoted-payload offender on consecutive lines",
      text:
          "pnpm dlx --package=less compile x.less x.css\n" +
          `bash -c "pnpm dlx --package=less compile y.less y.css"\n`,
      shouldMatch: true,
      note: "bare line 1 (col 1) + quoted-payload line 2 (col 10) — both surface separately",
      expectedHitCount: 2,
      expectedOffendingLines: [1, 2] },

    /* ── positive: whitespace obfuscation ────────────────────────────── */
    { name: "obfuscation: leading whitespace + tabs",
      text: "\t\t  pnpm   dlx    --package=less   lessc in.less out.css\n",
      shouldMatch: true, note: "extra tabs and spaces between tokens" },
    { name: "obfuscation: tab between --package and value",
      text: "pnpm dlx --package\tless lessc in.less out.css\n",
      shouldMatch: true, note: "tab as separator between --package and spec" },

    /* ── positive: semicolon / && / || / | statement-separator smuggling ─ */
    { name: "separator `;`: hidden as 2nd statement",
      text: "echo go; pnpm dlx --package=less x\n",
      shouldMatch: true, note: "second statement after `;` is the offender" },
    { name: "separator `&&`: hidden as RHS",
      text: "pnpm install && pnpm dlx --package=less lessc a b\n",
      shouldMatch: true, note: "RHS of `&&` is the offender" },
    { name: "separator `||`: hidden as fallback",
      text: "command-that-doesnt-exist || pnpm dlx --package=less x\n",
      shouldMatch: true, note: "fallback after `||` is the offender" },
    { name: "separator `|`: hidden after pipe",
      text: "echo less | pnpm dlx --package=less lessc x y\n",
      shouldMatch: true, note: "RHS of pipe is the offender" },
    { name: "separator: three statements, middle one offends",
      text: "echo go; pnpm dlx --package=less x; echo done\n",
      shouldMatch: true, note: "middle statement of three" },
    { name: "separator: pnpm exec smuggled after `&&`",
      text: "pnpm install && pnpm exec --package=less@4.2.0 lessc a b\n",
      shouldMatch: true, note: "pnpm exec variant past `&&`" },

    /* ── positive: quoted -c / -Command continuation patterns ──────────── */
    { name: "quoted: bash -c \"pnpm dlx --package=less ...\"",
      text: `bash -c "pnpm dlx --package=less lessc in.less out.css"\n`,
      shouldMatch: true, note: "command smuggled inside bash -c double-quoted payload" },
    { name: "quoted: sh -c '...' single-quoted",
      text: `sh -c 'pnpm dlx --package=less lessc in.less out.css'\n`,
      shouldMatch: true, note: "single-quoted sh -c payload" },
    { name: "quoted: pwsh -Command \"...\"",
      text: `pwsh -Command "pnpm dlx --package=less lessc in.less out.css"\n`,
      shouldMatch: true, note: "PowerShell -Command quoted payload" },
    { name: "quoted: powershell -Command \"...\"",
      text: `powershell -Command "pnpm exec --package=less@4.2.0 lessc x y"\n`,
      shouldMatch: true, note: "Windows PowerShell -Command quoted payload" },
    { name: "quoted: cmd /c \"...\"",
      text: `cmd /c "pnpm dlx --package=less lessc in.less out.css"\n`,
      shouldMatch: true, note: "Windows cmd /c quoted payload" },
    { name: "quoted: zsh -c \"...\"",
      text: `zsh -c "npx --package=less@4.2.0 lessc x y"\n`,
      shouldMatch: true, note: "zsh -c with npx variant inside" },
    { name: "quoted: bash -c with separator INSIDE quotes",
      text: `bash -c "echo go; pnpm dlx --package=less x"\n`,
      shouldMatch: true, note: "separator nested inside quoted -c payload — recursive expansion" },
    { name: "quoted: bash -c with escaped inner double quotes",
      text: `bash -c "echo \\"hi\\"; pnpm dlx --package=less x"\n`,
      shouldMatch: true, note: "escaped \\\" inside bash -c payload still parsed" },
    { name: "quoted: pwsh -Command with `&&` inside",
      text: `pwsh -Command "pnpm install && pnpm dlx --package=less lessc a b"\n`,
      shouldMatch: true, note: "&& separator inside PowerShell -Command payload" },

    /* ── negative: must NOT match ────────────────────────────────────── */
    { name: "clean: node scripts/compile-less.mjs",
      text: "node scripts/compile-less.mjs input.less output.css\n",
      shouldMatch: false, note: "the canonical replacement command" },
    { name: "clean: --package-lock=false (lookbehind guard)",
      text: "pnpm install --package-lock=false\n",
      shouldMatch: false, note: "lookbehind must reject `--package-lock=false`" },
    { name: "clean: harmless / lossless prose",
      text: "echo 'this is a harmless and lossless test'\n",
      shouldMatch: false, note: "word boundary must reject 'harmless'/'lossless'" },
    { name: "clean: --package=lessc-plugin (different pkg)",
      text: "pnpm dlx --package=lessc-plugin foo bar\n",
      shouldMatch: false, note: "must not match other packages whose name starts with 'less'" },
    { name: "clean: pnpm dlx with totally unrelated package",
      text: "pnpm dlx --package=typescript tsc --noEmit\n",
      shouldMatch: false, note: "wrong package name → not our concern" },
    { name: "clean: bare 'less' as a word in prose",
      text: "Use less memory by streaming. We compile less files via Node.\n",
      shouldMatch: false, note: "prose mentions of the word 'less' must not trigger" },
    { name: "clean: allow-marker suppresses doc-string hit",
      text: "// example of forbidden form: pnpm dlx --package=less ... // preflight-allow-line\n",
      shouldMatch: false, note: "inline allow-marker honored on same physical line" },
    { name: "clean: separator with clean RHS",
      text: "pnpm install && pnpm dlx --package=typescript tsc --noEmit\n",
      shouldMatch: false, note: "RHS of && is a different package — no hit" },
    { name: "clean: bash -c with clean payload",
      text: `bash -c "echo hello && pnpm install"\n`,
      shouldMatch: false, note: "quoted -c payload that contains no forbidden form" },
    { name: "clean: tsc -c (unrelated -c flag)",
      text: `tsc -c tsconfig.json\n`,
      shouldMatch: false, note: "non-shell launcher with -c flag must not be unwrapped" },
    { name: "clean: prose mentioning bash -c with semicolon",
      text: `Run bash -c "ls; pwd" to list and print working dir.\n`,
      shouldMatch: false, note: "prose with quoted bash -c payload that contains no offender" },

    /* ── positive: tricky quoting / escaping — locateMatchInLogicalLine
     * mapping regression suite. Each fixture pins the EXACT
     * (offendingLine, offendingColumn) tuple the matcher must produce
     * so any drift in quote-stripping, escape-unwrapping, or
     * candidate→logical-line index mapping trips immediately.
     * Columns were measured against the current implementation; if
     * `locateMatchInLogicalLine` ever silently changes its anchoring
     * (e.g. starts pointing at the opening quote instead of the `p` of
     * `pnpm`), these fixtures will fail with a clear column-drift
     * message. ───────────────────────────────────────────────────── */
    { name: "quoting: nested bash -c inside bash -c (double→single)",
      text: `bash -c "bash -c 'pnpm dlx --package=less x'"\n`,
      shouldMatch: true,
      note: "outer double-quoted bash -c wraps an inner single-quoted bash -c whose payload is the offender; recursive expansion must still anchor the column on the `p` of `pnpm` in the ORIGINAL physical line",
      expectedHitCount: 1,
      expectedOffendingLines: [1],
      expectedOffendingColumns: [19] },
    { name: "quoting: bash -c payload with escaped \\\" inside",
      text: `bash -c "echo \\"hello world\\"; pnpm dlx --package=less x"\n`,
      shouldMatch: true,
      note: "escaped inner double-quotes (\\\") must not throw off the column mapping — the `p` of `pnpm` sits at col 32 in the raw physical line",
      expectedHitCount: 1,
      expectedOffendingLines: [1],
      expectedOffendingColumns: [32] },
    { name: "quoting: launcher token also appears in unrelated prose first",
      text: `echo "bash -c is a shell flag"; bash -c "pnpm dlx --package=less x"\n`,
      shouldMatch: true,
      note: "the substring `bash -c` appears inside an earlier echoed string; locateMatchInLogicalLine must skip the prose occurrence and anchor on the real launcher's payload (col 42)",
      expectedHitCount: 1,
      expectedOffendingLines: [1],
      expectedOffendingColumns: [42] },
    { name: "quoting: outer double-quoted bash -c, inner --package='less@x'",
      text: `bash -c "pnpm dlx --package='less@4.2.0' lessc a b"\n`,
      shouldMatch: true,
      note: "mixed quote styles (outer \" + inner ' around the version-pinned spec) must not disturb mapping — `pnpm` sits at col 10 right after the opening quote",
      expectedHitCount: 1,
      expectedOffendingLines: [1],
      expectedOffendingColumns: [10] },
    { name: "quoting: bash -c payload with leading whitespace + tabs",
      text: "bash -c \"   \t\tpnpm   dlx   --package=less   lessc a b\"\n",
      shouldMatch: true,
      note: "leading spaces + tabs inside the quoted payload — the column must point at the `p` of `pnpm` (col 15), not at the opening quote or the first whitespace char",
      expectedHitCount: 1,
      expectedOffendingLines: [1],
      expectedOffendingColumns: [15] },
    { name: "quoting: pwsh -Command with escaped \\\" around inner string",
      text: `pwsh -Command "Write-Host \\"hi\\"; pnpm dlx --package=less lessc a b"\n`,
      shouldMatch: true,
      note: "PowerShell -Command payload with escaped inner quotes around an unrelated Write-Host call — column must land on `pnpm` at col 35",
      expectedHitCount: 1,
      expectedOffendingLines: [1],
      expectedOffendingColumns: [35] },
    { name: "quoting: two bash -c invocations, only the second offends",
      text: `bash -c "echo first"; bash -c "pnpm dlx --package=less x"\n`,
      shouldMatch: true,
      note: "two sequential bash -c calls separated by `;` — the matcher must report the SECOND launcher's payload (col 32), not false-positive on the first clean one",
      expectedHitCount: 1,
      expectedOffendingLines: [1],
      expectedOffendingColumns: [32] },
    { name: "quoting: bash -c payload spanning POSIX backslash continuations",
      text: `bash -c "pnpm dlx \\\n  --package=less \\\n  lessc a b"\n`,
      shouldMatch: true,
      note: "quoted bash -c payload that itself uses `\\\\` line continuations — the offender must be reported on the FIRST physical line at col 10 (where `pnpm` actually appears), proving the physical-line mapping survives both quote-unwrapping AND continuation-joining",
      expectedHitCount: 1,
      expectedOffendingLines: [1],
      expectedOffendingColumns: [10] },
    { name: "quoting: prose mentioning `pnpm dlx` inside escaped quotes is clean",
      text: `echo "she said \\"pnpm dlx is broken\\" yesterday"\n`,
      shouldMatch: false,
      note: "the offending tokens appear ONLY inside an escaped-quoted string passed to `echo` (no launcher unwrapping, no --package, no bare `less` spec) — must stay clean to confirm the matcher doesn't over-trigger on prose with escaped quotes" },

    /* ── positive: multi-line quoted payloads & backticks — caret /
     * matchWindow regression suite. These fixtures exercise the cases
     * where the launcher and offender sit on DIFFERENT physical lines
     * (because the quoted payload itself spans newlines) AND/OR where
     * the payload contains backtick characters that could naively be
     * misread as PowerShell continuations. The universal caret-integrity
     * check (in runSelfTest) verifies caret.column and matchWindow.caret
     * on every hit; these fixtures additionally pin the exact (line,
     * col) tuples so a regression in the multi-line / backtick handling
     * surfaces as either a column drift or a caret-malformed failure. */
    { name: "multiline-quoted: bash -c \" \\n  pnpm dlx … \\n \"",
      text: `bash -c "\n  pnpm dlx --package=less lessc a.less a.css\n"\n`,
      shouldMatch: true,
      note: "double-quoted bash -c payload that opens on line 1 and contains the offender on line 2; offender must be reported at its TRUE physical location (line 2 col 3 — the `p` after the 2-space indent), not at the launcher line",
      expectedHitCount: 1,
      expectedOffendingLines: [2],
      expectedOffendingColumns: [3] },
    { name: "multiline-quoted: sh -c ' \\n  pnpm dlx … \\n '",
      text: `sh -c '\n  pnpm dlx --package=less lessc a.less a.css\n'\n`,
      shouldMatch: true,
      note: "single-quoted sh -c variant of the multi-line payload — same expected coordinates (line 2 col 3), proving the quote-style doesn't disturb physical-line mapping",
      expectedHitCount: 1,
      expectedOffendingLines: [2],
      expectedOffendingColumns: [3] },
    { name: "multiline-quoted: leading blank line inside payload",
      text: `bash -c "\n\n  pnpm dlx --package=less lessc a.less a.css\n"\n`,
      shouldMatch: true,
      note: "extra blank line between the opening quote and the offender — the offender shifts to line 3 and the matcher must follow it (col stays at 3)",
      expectedHitCount: 1,
      expectedOffendingLines: [3],
      expectedOffendingColumns: [3] },
    { name: "backtick: bash -c payload with `whoami` substitution before offender",
      text: "bash -c 'echo `whoami`; pnpm dlx --package=less x'\n",
      shouldMatch: true,
      note: "literal backticks inside a single-quoted bash -c payload (shell command substitution) must NOT be mistaken for PowerShell line continuations — the offender stays on line 1 at col 25",
      expectedHitCount: 1,
      expectedOffendingLines: [1],
      expectedOffendingColumns: [25] },
    { name: "backtick: pwsh -Command with backtick continuations inside quoted payload",
      text: "pwsh -Command \"pnpm dlx \\`\n  --package=less \\`\n  lessc a b\"\n",
      shouldMatch: true,
      note: "pwsh -Command quoted payload that itself uses PowerShell backtick (`) line continuations — the offender must be reported on the FIRST physical line at col 16 (right after the opening quote), proving multi-physical-line caret rendering survives backtick joining",
      expectedHitCount: 1,
      expectedOffendingLines: [1],
      expectedOffendingColumns: [16] },
    { name: "backtick: clean prose containing a literal backtick string",
      text: "echo 'See `pnpm dlx --package=foo` for example syntax in docs.'\n",
      shouldMatch: false,
      note: "a literal backtick-quoted string inside echoed prose mentioning pnpm dlx with an UNRELATED package — must stay clean (no `less` spec, no shell-launcher unwrapping triggered)" },
];

function runSelfTest() {
    if (!JSON_MODE) console.log(`[preflight:self-test] running ${SELF_TEST_FIXTURES.length} fixtures…`);
    let passed = 0;
    let failed = 0;
    const failures = [];
    /** @type {Array<{name:string, note:string, expected:"match"|"clean", actual:"match"|"clean", ok:boolean, hits:any[]}>} */
    const jsonResults = [];
    for (const fx of SELF_TEST_FIXTURES) {
        const found = matchTextForOffenders(fx.text, `<fixture:${fx.name}>`);
        const matched = found.length > 0;
        // Base check: did matching happen at all? (Backward-compatible with
        // the original `shouldMatch: boolean` contract.)
        const matchedOk = matched === fx.shouldMatch;
        // Optional check: exact hit count (locks in per-physical-line
        // reporting so a regression to "one hit per logical line" trips
        // immediately). Only enforced when the fixture declares it.
        const countOk = fx.expectedHitCount === undefined
            ? true
            : found.length === fx.expectedHitCount;
        // Optional check: exact set of offending physical line numbers.
        // Compared as sorted JSON arrays so order in the fixture is
        // forgiving but the actual output must match exactly.
        const expectedLines = fx.expectedOffendingLines;
        const actualLines = found.map((h) => h.offendingLine).sort((a, b) => a - b);
        const linesOk = expectedLines === undefined
            ? true
            : JSON.stringify(actualLines) === JSON.stringify([...expectedLines].sort((a, b) => a - b));
        // Optional check: exact (line, column) tuples — locks in the
        // `locateMatchInLogicalLine` mapping for tricky quoting/escaping
        // cases. Compared as sorted-by-line JSON arrays of [line, col]
        // pairs, so fixture authors can list pairs in any order but the
        // matcher's output must match exactly. A regression in the quote
        // unwrapping or escape handling will surface here as a column drift
        // even when the line count and rule firing are still correct.
        const expectedColumns = fx.expectedOffendingColumns;
        const actualPairs = found
            .map((h) => [h.offendingLine, h.offendingColumn])
            .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        const columnsOk = expectedColumns === undefined
            ? true
            : (() => {
                if (expectedLines === undefined) return false; // misuse: columns require lines
                if (expectedColumns.length !== expectedLines.length) return false;
                const expectedPairs = expectedLines
                    .map((ln, i) => [ln, expectedColumns[i]])
                    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
                return JSON.stringify(actualPairs) === JSON.stringify(expectedPairs);
            })();
        // Universal caret-integrity check — runs on EVERY fixture that
        // produces hits (no opt-in needed). Validates the SAME projected
        // shape that `--json` output and the JSON envelope spec describe
        // (i.e. `hit.caret.column`, `hit.matchWindow.text`,
        // `hit.matchWindow.caret`), which is produced by `toJsonHit`. We
        // project here rather than mutate the raw hit so the matcher's
        // internal hit shape stays unchanged. Per projected hit we check:
        //   1. `caret.column === offendingColumn` — the convenience
        //      caret object must mirror the canonical column.
        //   2. `matchWindow.caret` is leading whitespace + a non-empty
        //      run of `^` characters (no other characters allowed).
        //   3. The whitespace prefix length doesn't overflow the
        //      `matchWindow.text` length (i.e. the caret bar wouldn't
        //      visually float past the end of the rendered window).
        // A failure here means the rendered terminal/UI marker would
        // visually point at the wrong character — a regression that's
        // invisible in the line/column numbers but obvious to any human
        // reading the report.
        const caretIssues = [];
        const projectedHits = found.map((h) => toJsonHit(h));
        for (const h of projectedHits) {
            if (h.caret?.column !== h.offendingColumn) {
                caretIssues.push(`hit@${h.offendingLine}:${h.offendingColumn} caret.column=${h.caret?.column} ≠ offendingColumn=${h.offendingColumn}`);
            }
            const bar = h.matchWindow?.caret ?? "";
            const barMatch = bar.match(/^(\s*)(\^+)$/);
            if (!barMatch) {
                caretIssues.push(`hit@${h.offendingLine}:${h.offendingColumn} matchWindow.caret malformed (${JSON.stringify(bar)})`);
            } else {
                const prefixLen = barMatch[1].length;
                const windowText = h.matchWindow?.text ?? "";
                if (prefixLen >= windowText.length) {
                    caretIssues.push(`hit@${h.offendingLine}:${h.offendingColumn} matchWindow.caret prefix (${prefixLen}) overflows windowText length (${windowText.length})`);
                }
            }
        }
        const caretOk = caretIssues.length === 0;
        const ok = matchedOk && countOk && linesOk && columnsOk && caretOk;
        if (ok) {
            passed++;
            if (!JSON_MODE) console.log(`  ✓ ${fx.shouldMatch ? "MATCH " : "CLEAN "} ${fx.name}`);
        } else {
            failed++;
            // Build a short reason string so the failure log explains WHICH
            // sub-check failed (match vs count vs lines) — otherwise the
            // operator has to diff fixture vs actual to figure it out.
            const reasons = [];
            if (!matchedOk) reasons.push(`expected ${fx.shouldMatch ? "match" : "no match"}, got ${matched ? "match" : "no match"}`);
            if (!countOk) reasons.push(`expected ${fx.expectedHitCount} hit(s), got ${found.length}`);
            if (!linesOk) reasons.push(`expected offending lines ${JSON.stringify(expectedLines)}, got ${JSON.stringify(actualLines)}`);
            if (!columnsOk) reasons.push(`expected (line,col) pairs ${JSON.stringify(expectedLines?.map((ln, i) => [ln, expectedColumns[i]]))}, got ${JSON.stringify(actualPairs)}`);
            if (!caretOk) reasons.push(`caret/matchWindow integrity failed: ${caretIssues.join(" | ")}`);
            failures.push({ fixture: fx, found, reasons });
            if (!JSON_MODE) console.error(
                `  ✗ ${fx.shouldMatch ? "MATCH " : "CLEAN "} ${fx.name} — ${reasons.join("; ")}`,
            );
        }
        if (JSON_MODE) {
            jsonResults.push({
                name: fx.name,
                note: fx.note,
                expected: fx.shouldMatch ? "match" : "clean",
                actual: matched ? "match" : "clean",
                expectedHitCount: fx.expectedHitCount ?? null,
                actualHitCount: found.length,
                expectedOffendingLines: expectedLines ?? null,
                actualOffendingLines: actualLines,
                expectedOffendingColumns: expectedColumns ?? null,
                actualOffendingColumns: found
                    .slice()
                    .sort((a, b) => a.offendingLine - b.offendingLine || a.offendingColumn - b.offendingColumn)
                    .map((h) => h.offendingColumn),
                ok,
                hits: found.map(toJsonHit),
            });
        }
    }
    if (JSON_MODE) {
        const payload = {
            mode: "self-test",
            tool: "check-no-pnpm-dlx-less",
            version: 1,
            total: SELF_TEST_FIXTURES.length,
            passed,
            failed,
            ok: failed === 0,
            results: jsonResults,
        };
        process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
        process.exit(failed === 0 ? 0 : 1);
    }
    console.log("");
    console.log(`[preflight:self-test] ${passed}/${SELF_TEST_FIXTURES.length} passed, ${failed} failed`);
    if (failed > 0) {
        console.error("");
        console.error("[preflight:self-test] FAIL — fixture coverage regressed.");
        for (const { fixture, found } of failures) {
            console.error(`  - ${fixture.name}`);
            console.error(`      note     : ${fixture.note}`);
            console.error(`      input    : ${JSON.stringify(fixture.text).slice(0, 200)}`);
            console.error(`      expected : ${fixture.shouldMatch ? "MATCH" : "CLEAN"}`);
            console.error(`      actual   : ${found.length} hit(s)`);
            for (const hit of found) {
                console.error(`        · matched token : ${hit.matchedToken}`);
                console.error(`        · matched rule  : ${hit.ruleId} — ${hit.ruleLabel}`);
                console.error(`        · candidate kind: ${hit.candidateKind} (${hit.candidateOrigin})`);
            }
        }
        process.exit(1);
    }
    console.log("[preflight:self-test] OK");
    process.exit(0);
}

if (process.argv.includes("--self-test")) {
    runSelfTest();
}

const hits = [];
walk(SCAN_ROOT, hits);

if (hits.length === 0) {
    if (JSON_MODE) {
        // Emit a stable "clean run" JSON envelope so CI tooling can branch
        // on `.ok` instead of having to detect an empty-hits array AND a
        // separate textual log line. Same envelope shape as the FAIL case
        // (just with `hits: []` and `ok: true`).
        const payload = {
            mode: "scan",
            tool: "check-no-pnpm-dlx-less",
            version: 1,
            ok: true,
            totalHits: 0,
            hits: [],
        };
        process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
        process.exit(0);
    }
    console.log("[preflight] OK — no `pnpm dlx --package=less` or `npx --package less lessc` references found.");
    process.exit(0);
}

/**
 * Build a short unified-diff-style excerpt centered on the offending matched
 * span — `-` for the line as it appears in the source, `+` for the proposed
 * rewrite, and a `@@ … @@` header showing the offending file:line:col so the
 * developer can immediately see exactly which characters to delete and what
 * to type instead. Returns an array of lines suitable for line-by-line
 * `console.error` output.
 *
 * Notes:
 *  - The diff operates on the raw PHYSICAL line from disk (`offendingLineText`),
 *    not the joined logical buffer. That keeps the excerpt visually identical
 *    to what the user sees in their editor.
 *  - The `+` line is built by splicing `replacement` into the same physical
 *    line at the offending column. When the matched span extends past the
 *    physical line (multi-line shell continuation), we cap the deletion at
 *    end-of-line and add a trailing `… (matched span continues on next line)`
 *    note so the user knows the rewrite must also clean up the continuation.
 *  - We deliberately keep the excerpt SHORT (±20 chars of pre/post context)
 *    so it fits in a CI log without horizontal scroll on long commands.
 */
function buildUnifiedDiffExcerpt(hit, replacement) {
    const CONTEXT = 20;
    const physicalLine = hit.offendingLineText;
    // Re-locate the offending token inside the physical line. The hit gives
    // us a 1-indexed column; convert back to a 0-indexed slice position.
    const colZeroIdx = Math.max(0, Math.min(physicalLine.length, hit.offendingColumn - 1));
    // Determine the deletion span on the physical line. The matched token
    // may be longer than what fits on this physical line (multi-line case);
    // cap it at end-of-line and remember whether we truncated.
    const tokenLen = hit.matchedToken.length;
    const physicalDeleteEnd = Math.min(physicalLine.length, colZeroIdx + tokenLen);
    const truncated = colZeroIdx + tokenLen > physicalLine.length;

    const before = physicalLine.slice(0, colZeroIdx);
    const after = physicalLine.slice(physicalDeleteEnd);
    const rewritten = before + replacement + after;

    // Trim BOTH lines symmetrically around the change so they share the
    // same left-edge "anchor" — this makes column alignment of `-`/`+`
    // visually obvious in the terminal.
    const excerptStart = Math.max(0, colZeroIdx - CONTEXT);
    const minusExcerptEnd = Math.min(physicalLine.length, physicalDeleteEnd + CONTEXT);
    const plusExcerptEnd = Math.min(rewritten.length, colZeroIdx + replacement.length + CONTEXT);

    const minusExcerpt =
        (excerptStart > 0 ? "…" : "") +
        physicalLine.slice(excerptStart, minusExcerptEnd) +
        (minusExcerptEnd < physicalLine.length ? "…" : "");
    const plusExcerpt =
        (excerptStart > 0 ? "…" : "") +
        rewritten.slice(excerptStart, plusExcerptEnd) +
        (plusExcerptEnd < rewritten.length ? "…" : "");

    const lines = [];
    lines.push(`      ↳ unified diff          :`);
    lines.push(`        --- a/${hit.file}`);
    lines.push(`        +++ b/${hit.file}`);
    lines.push(`        @@ ${hit.file}:${hit.offendingLine}:${hit.offendingColumn} @@`);
    lines.push(`        - ${minusExcerpt}`);
    lines.push(`        + ${plusExcerpt}`);
    if (truncated) {
        lines.push(`        ! matched span continues onto line ${hit.lastLine} via shell continuation — also remove the trailing tokens there`);
    }
    return lines;
}

/**
 * Build a per-hit "Suggested fix" — a concrete before→after rewrite tailored
 * to the rule that fired and to whatever input/output `.less`/`.css` paths
 * we can recover from the matched span. Returns an array of lines (no
 * trailing newlines) suitable for `console.error` line-by-line printing.
 *
 * The suggestion is always conservative:
 *   - If we can extract <input.less> and <output.css> from the matched span,
 *     we propose the EXACT replacement command.
 *   - If we can only see one or zero, we propose the canonical template
 *     and tell the user which placeholders to substitute.
 *   - For bare-package variants (`pnpm dlx less`), we additionally explain
 *     that the package itself is the wrong invocation, not just the flag.
 */
function buildSuggestedFix(hit) {
    // Recover input/output file paths from the matched span. We look at the
    // logical (joined) command rather than the matched-token alone because
    // `lessc <input> <output>` typically follows the matched flag region.
    const haystack = hit.logicalText;
    // `*.less` input — first whitespace-bounded token ending in `.less`
    // (case-insensitive), excluding the launcher's own `--package=less` flag.
    const lessInputMatch = haystack
        .replace(/--package(?:\s*=\s*|\s+)["']?less(?:@[^\s"'`]+)?["']?/gi, "")
        .match(/(?:^|\s)([^\s"'`]+\.less)\b/i);
    const cssOutputMatch = haystack.match(/(?:^|\s)([^\s"'`]+\.css)\b/i);
    const inputPath = lessInputMatch?.[1] ?? "<input.less>";
    const outputPath = cssOutputMatch?.[1] ?? "<output.css>";
    const recoveredAll = lessInputMatch !== null && cssOutputMatch !== null;

    const replacement = `node scripts/compile-less.mjs ${inputPath} ${outputPath}`;
    const beforeLine = hit.matchedToken;

    const lines = [];
    lines.push(`      ↳ suggested fix         : replace the offending command with the local Node helper`);
    lines.push(`        before : ${beforeLine}${hit.candidateKind !== "original" ? "  (inside " + hit.candidateOrigin + ")" : ""}`);
    lines.push(`        after  : ${replacement}`);
    if (!recoveredAll) {
        lines.push(`        note   : substitute <input.less> / <output.css> with the real paths from the original command`);
    }

    // Rule-specific extra guidance — short, one line each.
    switch (hit.ruleId) {
        case "pnpm-dlx-bare-less":
        case "pnpx-bare-less":
            lines.push(`        why    : even the bare \`${hit.firstOffendingToken} … less[@…]\` form goes through the same broken pnpm resolver path`);
            break;
        case "pnpm-flag-before-subcommand":
            lines.push(`        why    : moving \`--package=less\` before the subcommand does NOT bypass the resolver crash`);
            break;
        case "npx--package-less":
            lines.push(`        why    : \`npx\` is shimmed by pnpm in CI, so \`npx --package=less\` fails the same way`);
            break;
        case "pnpx--package-less":
            lines.push(`        why    : the legacy \`pnpx\` alias delegates to the same resolver and fails identically`);
            break;
        default:
            // No extra line for the canonical pnpm-dlx / pnpm-exec cases —
            // the rule label + before/after already explain the failure.
            break;
    }

    if (hit.candidateKind === "quoted-payload") {
        lines.push(`        tip    : the offender lives inside a quoted \`-c\` / \`-Command\` payload — keep the wrapper, replace only the inner command`);
    } else if (hit.candidateKind === "statement-split") {
        lines.push(`        tip    : the offender is one of several \`;\`/\`&&\`/\`||\`/\`|\`-separated statements — leave the others untouched`);
    }

    return { lines, replacement };
}

if (JSON_MODE) {
    // Machine-readable failure envelope. Each entry in `hits` carries
    // everything CI tooling needs (offending token / line / column / caret /
    // matched span / rule metadata) — see `toJsonHit()` for the full schema.
    // We deliberately skip the human-readable suggested-fix and unified-diff
    // blocks: tooling that wants those can render them from the structured
    // fields itself, and they bloat the JSON for no machine benefit.
    const payload = {
        mode: "scan",
        tool: "check-no-pnpm-dlx-less",
        version: 1,
        ok: false,
        totalHits: hits.length,
        hits: hits.map(toJsonHit),
    };
    process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
    process.exit(1);
}

console.error("[preflight] FAIL — forbidden LESS-via-dlx invocation(s) detected.");
console.error("");
console.error("Both `pnpm dlx --package=less …` and `npx --package less lessc …` crash CI with:");
console.error("  ERR_PNPM_SPEC_NOT_SUPPORTED_BY_ANY_RESOLVER  --package=less isn't supported by any available resolver.");
console.error("");
console.error("Fix: compile LESS via the local helper (which imports `less` directly), e.g.:");
console.error("  node scripts/compile-less.mjs <input.less> <output.css>");
console.error("");
console.error("Offending location(s):");
for (const hit of hits) {
    // Always point at the physical line+column containing the first matched
    // token — that's the one a developer needs to edit. The column is
    // critical when the offender lives mid-line inside a multi-line
    // continuation (e.g. `bash -c "...; pnpm dlx --package=less ..."`).
    console.error(`  - ${hit.file}:${hit.offendingLine}:${hit.offendingColumn}   ${hit.offendingLineText}`);
    // Same-line caret pinned at the EXACT column inside the raw source.
    console.error(`    ${" ".repeat(hit.file.length + 1 + String(hit.offendingLine).length + 1 + String(hit.offendingColumn).length + 3)}${hit.physicalCaret}`);
    console.error(`      ↳ first offending token : ${hit.firstOffendingToken} (col ${hit.offendingColumn})`);
    // Full offending command snippet — printed BEFORE the legacy
    // `matched token` line so a developer scanning the report sees the
    // copy-paste-ready rewrite target first. The legacy line is kept for
    // back-compat with any downstream consumer that greps for it.
    console.error(`      ↳ offending command     : ${hit.offendingCommand}${hit.offendingCommandTruncated ? "  (truncated at 1000 chars)" : ""}`);
    console.error(`      ↳ matched token         : ${hit.matchedToken}`);

    // Detection rationale — exactly which forbidden pattern fired and why.
    console.error(`      ↳ matched rule          : ${hit.ruleId}`);
    console.error(`      ↳ rule label            : ${hit.ruleLabel}`);
    console.error(`      ↳ rule reason           : ${hit.ruleDescription}`);
    console.error(`      ↳ rule regex            : /${hit.rulePattern}/`);

    // Which slice of the candidate matched, with a caret underline.
    console.error(`      ↳ matched span          : ${hit.matchWindow}`);
    console.error(`                                ${hit.matchCaret}`);

    // Which transformation surfaced this candidate (so it's clear when the
    // hit only appears AFTER statement-splitting or quoted-payload unwrap).
    if (hit.candidateKind !== "original") {
        console.error(`      ↳ candidate kind        : ${hit.candidateKind} (${hit.candidateOrigin})`);
        console.error(`      ↳ candidate text        : ${hit.candidatePreview}`);
    }

    if (hit.isMultiPhysicalLine) {
        // Multi-line shell continuation: also surface the full physical span
        // and the joined reconstructed command for context.
        console.error(`      ↳ logical span          : lines ${hit.logicalLine}–${hit.lastLine} (offender pinned to line ${hit.offendingLine}, col ${hit.offendingColumn})`);
        console.error(`      ↳ joined cmd            : ${hit.logicalText}`);
    }

    // Per-hit suggested fix — concrete before→after rewrite, then a short
    // unified-diff-style excerpt centred on the offending span so the user
    // can see EXACTLY which characters to delete and what to type instead.
    const fix = buildSuggestedFix(hit);
    for (const line of fix.lines) console.error(line);
    for (const line of buildUnifiedDiffExcerpt(hit, fix.replacement)) console.error(line);
}
process.exit(1);
