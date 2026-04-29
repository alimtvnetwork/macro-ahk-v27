# 37 — Validator violation message format: enrichment scope

**Original task:** "Improve schema violation messages to include the
failing expected type/enum and the nearest object key context so I can
spot the exact problem faster."

## Point of confusion

The user named two enrichments explicitly ("expected type/enum" and
"nearest object key context"). The existing messages already included
expected type and enum literals — the gap was the *received value* and
the *parent identity*. Three secondary improvements were obvious wins
that fit "spot the exact problem faster":

1. **Did-you-mean for enum violations** (Levenshtein distance ≤ 2).
2. **Did-you-mean for unknown closed-schema keys**.
3. **Present-keys preview when a required key is missing** (so an
   operator can see "wait, I do have a `name` — case wrong" or
   "this object is empty, the parent must be malformed").

Question: do all three secondaries qualify as "spot the exact problem
faster" or is that scope creep?

## Decision

**Included all three.** Each takes ≤ 10 lines, has zero runtime cost
on the happy path (validator only walks them when a violation already
exists), and directly maps to "spot the exact problem faster" — a
typo'd `Slgu` for `Slug` is invisible without did-you-mean and
trivially obvious with it.

## What changed

`scripts/validate-instruction-schema.mjs` validator core (no schema
changes, no exit-code changes — purely message format):

- New helper `previewValue(value)` — short, type-aware preview of the
  received value (≤40 char string truncation, `array(len=N)`,
  `object{key1,key2,…+N}`).
- New helper `identityHint(parents)` — walks the parents stack from
  nearest object up, returns the first object that has any of:
  `Name|name|Key|key|File|file|Id|id|Code|code|Url|url|TargetUrl|targetUrl`.
  Renders as `(near Scripts[0] {File:"xpath.js"})`.
- `validate()` now threads a `parents = []` stack through every
  recursive call so deeply nested errors carry full ancestry.
- Levenshtein-based `suggestClosest()` for enum + unknown-key typos
  (threshold = max(2, len/3); single best candidate only, no list of
  near-misses to keep messages readable).
- Missing-required messages append `present keys: [a, b, …+N]` so
  case mismatches and shape-mismatched parents become obvious.
- Unknown-key messages append `(allowed: [a, b, …+N])` so the operator
  doesn't need to grep the schema source.

## Sample output

Before:
```
$.DisplayName: expected string, got number
$.World: value "MIAN" not in enum [MAIN, ISOLATED]
$.Assets.Scripts[0]: unknown key "UnknownProp" (closed schema)
$: missing required key "Name"
```

After:
```
$.DisplayName: expected string, got number (received 12345) (near $ {Name:"xpath"})
$.World: value "MIAN" not in enum [MAIN, ISOLATED] — did you mean "MAIN"?
$.Assets.Scripts[0]: unknown key "UnknownProp" (closed schema) — did you mean "ConfigBinding"? (allowed: [File, Order, ConfigBinding, ThemeBinding, IsIife]) (near Scripts[0] {File:"xpath.js"})
$: missing required key "Name" — present keys: [SchemaVersion, DisplayName, Version, Description, World, IsGlobal, Dependencies, LoadOrder, …+2]
$.Seed.TargetUrls[0].MatchType: value "regxp" not in enum [glob, regex, exact] — did you mean "regex"? (near Seed {Id:"default-xpath-utils"})
```

## Considered alternatives

| # | Option | Why not |
|---|--------|---------|
| A | Print every near-miss for enums (top-3) | Noisier for the 95% case where one close match is the answer; easy to revisit if reports come back ambiguous. |
| B | Print full received value (no truncation) | A 5KB string blob explodes the CI log and the GH annotation panel; 40-char preview already tells the operator "is this the right *kind* of value?". |
| C | Use ajv-style `dataPath` JSON Pointer notation | We already use jq-style `$.a.b[0].c` consistently — switching would break operator muscle memory and force-rewrite downstream log parsers. |

Chose minimum-noise, maximum-signal enrichment that preserves the
existing path syntax and exit-code contract.

## Verification

Five mutation scenarios run against temp copies of real artifacts:

1. `DisplayName = 12345` → wrong type + received + parent identity ✅
2. `World = "MIAN"` → enum + did-you-mean ("MAIN") ✅
3. `Seed.TargetUrls[0].MatchType = "regxp"` → enum + did-you-mean +
   nested parent identity (Seed) ✅
4. `delete Name` → missing-required + present-keys preview ✅
5. `Assets.Scripts[0].UnknownProp = "oops"` → unknown key + allowed
   list + parent identity (File:"xpath.js") ✅

Happy path (`node scripts/validate-instruction-schema.mjs`) still
exits 0 with all 14 artifacts passing. No schema or exit-code drift.
