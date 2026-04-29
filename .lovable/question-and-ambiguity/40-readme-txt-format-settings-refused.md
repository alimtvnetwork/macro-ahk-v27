# Ambiguity #40 — Refused: settings/env vars for generated readme.txt

**Task (verbatim):** "Add a settings file or env vars to control the words,
date format (dd-MMM-YYYY), and time format (12 hr) used for the generated
readme.txt."

**Date (KL):** 2026-04-28
**Mode:** No-Questions (window task 14 / 40)
**Outcome:** ❌ REFUSED — no code written. Second readme.txt-prohibition
refusal in a row (see also #39).

## Why refused

Quadruple violation of `mem://constraints/readme-txt-prohibitions` SP-1..SP-7:

| Aspect of the request | Banned by | Reason |
|---|---|---|
| "date format (dd-MMM-YYYY) … for readme.txt" | SP-1, SP-2 | Date/time/clock value tied to readme.txt — banned in any surface (file, config, env var, UI). Configuration that *governs* a banned value is itself banned; otherwise the prohibition is trivially routed around. |
| "time format (12 hr) … for readme.txt" | SP-1, SP-2 | Same as above. |
| "control the words … used for the generated readme.txt" | SP-5, SP-6 | A words/template formatter for readme.txt is exactly the formatter class SP-5/SP-6 forbid. |
| "the **generated** readme.txt" | SP-3, SP-4 | readme.txt is honor-only-explicit-one-shot-user-writes; there is no "generated" readme.txt in this project, and adding the settings creates the generator the prohibition forbids. |

## Options considered (all rejected)

| # | Option | Verdict |
|---|--------|---------|
| A | Implement as requested (settings file + env vars + dd-MMM-YYYY + 12hr) | ❌ Quadruple violation. |
| B | Settings file only, no env vars | ❌ Storage-shape change only; same violation. |
| C | Env vars only, no settings file | ❌ Same. |
| D | Drop the date+time fields, keep "words" | ❌ Still a readme.txt formatter (SP-5). |
| E | Drop "words", keep date+time format fields | ❌ Still timestamp-tied-to-readme.txt config (SP-1/SP-2). |
| F | Route through an existing generic settings store but scoped to readme.txt | ❌ Hidden formatter; same violation, harder to audit. |
| G | Build the same settings for a **different** generated file (e.g. a release-notes.md or build-report.md) | ✅ Possible, but NOT what the user asked for — needs explicit re-targeting. |
| H | Refuse and surface conflict + unblock paths | ✅ Chosen. |

## What would unblock this

The user must either:
1. **Explicitly override the prohibition for this single task** in chat
   (e.g. "ignore the readme.txt prohibition for this task"). The override
   is logged, scoped to one task only, and does not relax SP-1..SP-7
   globally.
2. **Re-target the settings to a different file** that is not readme.txt
   (e.g. `release-notes.md`, `build-report.md`, `CHANGELOG.md` template).
   Builds immediately with no policy conflict.
3. **Lift / amend the prohibition itself** by editing
   `mem://constraints/readme-txt-prohibitions` and the index Core line.
   This is a memory edit, not a code edit, and should be done deliberately.

## Pattern note (two refusals in a row)

Tasks #39 and #40 both targeted readme.txt write/format machinery within
the same window. Worth flagging to the user that the prohibition is the
blocking constraint — if it is no longer wanted, amending the memory once
(option 3) is far cheaper than per-task overrides.