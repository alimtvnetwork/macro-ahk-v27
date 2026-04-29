# Ambiguity #38 — SchemaVersion contract location & shape

**Task:** Add a check that `SchemaVersion` matches the expected pattern/range
defined by the instruction compiler so incompatible versions fail early.

**Date (KL):** 2026-04-28
**Mode:** No-Questions (window task 12 / 40)

## Ambiguities & resolutions

### A. Where does the "expected pattern/range" live?
The instruction compiler (`scripts/compile-instruction.mjs`) is intentionally
dep-free and does NOT define a SchemaVersion constant — every project's
`src/instruction.ts` hard-codes its own `SchemaVersion: "1.0"` literal.
Three options:

1. Hard-code `["1.0"]` inside `validate-instruction-schema.mjs`.
   - Pros: zero new files, minimal change.
   - Cons: contract drift waiting to happen — the runtime
     (`manifest-seeder.ts SUPPORTED_SCHEMA_VERSIONS`, per `mem://`) and the
     validator would diverge on every bump.
2. Add a constant inside `compile-instruction.mjs` and have the validator
   import it.
   - Pros: lives next to the compiler.
   - Cons: the compiler doesn't actually emit/own the version (the source
     `instruction.ts` does), so the compiler is the wrong owner. Also
     forces the validator to import a script with side effects.
3. **Chosen:** Add a dedicated primitive at
   `standalone-scripts/types/instruction/primitives/schema-version.ts`
   plus a JSON mirror `schema-version.json`.
   - Pros: single source of truth, sits next to `version-string.ts` /
     `identifier.ts` / `url-pattern.ts`, the runtime can import the TS
     module while the dep-free validator reads the JSON mirror.
   - Cons: two files to keep in lock-step (mitigated by an in-file
     bump checklist).

### B. What pattern should be enforced?
Existing literals are all `"1.0"` (verified: 7/7 instruction.ts files).
Picked `/^\d+\.\d+$/` (dotted MAJOR.MINOR). Rejects `"1"`, `"1.0.0"`,
`"1.0-beta"` so the field stays trivially comparable. Pre-release suffixes
can be added later by widening the pattern + bumping the contract.

### C. What does "range" mean?
Treated as an **allow-list** (`SUPPORTED_SCHEMA_VERSIONS = ["1.0"]`) rather
than a numeric `≤ current` check. Allow-list semantics match the existing
webhook-result schema-version policy (`scripts/audit-webhook-results.mjs`)
and let us drop deprecated versions cleanly.

### D. Should the compiler also enforce this?
No — the validator is the gate. The compiler is dep-free and doesn't
currently parse/validate the source literal beyond JSON serialisation.
If a source file declares `SchemaVersion: "2.0"` before the contract is
bumped, validation fails CI (verified by mutation scenario 3).

## Validator output (mutation matrix verified)
- numeric `1.0` literal → "expected SchemaVersion string (one of [1.0]), got number"
- string `"1"` (no dot) → "does not match required pattern /^\\d+\\.\\d+$/"
- string `"2.0"` → "is not supported by this build … did you mean \"1.0\"? — bump …/schema-version.{ts,json}"
- string `"1.1"` → same, with did-you-mean → "1.0"
- happy path (`"1.0"` × 7 projects × 2 artifacts) → ✅ exit 0