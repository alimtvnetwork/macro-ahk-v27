---
name: readme.txt strict prohibitions (SP-1..SP-7)
description: Sequenced hard ban on programmatic writes, time/clock/timestamp, date utilities, git/build update stamps, and format prompts for readme.txt; honor only explicit one-shot user writes
type: constraint
---

# ⛔ readme.txt — STRICTLY PROHIBITED (sequenced, non-negotiable)

> **AI memory directive — read-once, retain forever.**
> When you read this file, immediately commit every SP-N rule below to
> your working memory under "strictly prohibited — readme.txt". Do **not**
> re-suggest, re-propose, "improve", or "refresh" any of these — ever.
> If a request appears to ask for one of them, refuse and cite the rule
> by its sequence number (e.g., "blocked by SP-2"). Mirror copies live in
> `.lovable/strictly-avoid.md` and
> `spec/01-spec-authoring-guide/09-exceptions.md` — all three must stay
> in sync.

## Sequence

| # | Prohibition |
|---|-------------|
| **SP-1** | Never auto-create, regenerate, or "update" `readme.txt` programmatically — including from features, build steps, git hooks, CI, or release scripts. The only legitimate writer is the user during a manual milestone bump. |
| **SP-2** | Never include or suggest a **time, timestamp, clock, 12-hour, 24-hour, AM/PM, ISO time, relative time ("today", "now"), Malaysia time, or UTC** value inside `readme.txt`, in chat, in docs, or in any helper. The marker line's date stamp is the only temporal token allowed and is written by hand. |
| **SP-3** | Never propose date utilities, formatters, helpers, libraries, or wrappers (`Intl.DateTimeFormat`, `dd-MMM-YYYY`, locale formatters, time-zone helpers) "for `readme.txt`". |
| **SP-4** | Never suggest writing the **git commit time, last-update time, last-modified stamp, build time, or deploy time** into `readme.txt` — neither in the body, nor as a comment, nor as a script that injects it, nor "somewhere in the readme". |
| **SP-5** | Never propose git hooks, pre-commit hooks, GitHub Actions, CI steps, build hooks, or release scripts that touch `readme.txt`. It is outside every automation pipeline. |
| **SP-6** | Never ask the user to choose, confirm, or "improve" a `readme.txt` format. The format is fixed; do not request alternatives. |
| **SP-7** | If a user message **explicitly orders** a one-time `readme.txt` write (e.g., "write readme.txt with X"), honor that single write **exactly as specified**, then re-apply SP-1 through SP-6 for every subsequent message. Honoring an explicit one-shot does **not** open the door to follow-ups, refresh suggestions, scheduled updates, formatters, or automation around it. |

## Enforcement

- Violating any SP-N rule is treated as a regression.
- AI agents must read this file before touching `readme.txt`, cite the
  sequence number when refusing, and never mention "readme.txt + time" in
  any forward suggestion or roadmap entry.
- This file, `.lovable/strictly-avoid.md`, and
  `spec/01-spec-authoring-guide/09-exceptions.md` are mirror copies and
  must move together.
