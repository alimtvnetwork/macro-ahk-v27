# 08 — Webhook Retry Queue (DECLINED)

**Task**: "Implement an optional retry queue for failed webhooks with exponential backoff and a max attempts limit."

## Ambiguity

The request conflicts with two existing decisions:

1. **`mem://constraints/no-retry-policy`** bans recursive retry and exponential backoff in the injection/auth pipelines (Issue #88).
2. **`.lovable/question-and-ambiguity/05-result-webhook-shape.md`** explicitly chose "fire-and-forget with single attempt + 8s timeout; failures only logged to delivery log ring buffer (last 20)" for reliability.

The webhook subsystem is technically outside the original no-retry scope (which was injection/auth), so a retry queue is *not* strictly forbidden by the existing constraint — but it *would* contradict the documented webhook shape decision.

## Options

| Option | Pros | Cons |
|--------|------|------|
| **A. Decline — keep fail-fast** | Honors spec #05; predictable delivery semantics; user sees final outcome in delivery log; receivers stay responsible for idempotency | No automatic recovery from transient network blips |
| **B. Add opt-in queue (default off)** | Backward-compatible; users opt in per-config | More state to persist (queue in localStorage); UI surface grows; complicates "what does the delivery log mean?" |
| **C. Always-on queue with sane defaults** | Best UX for unreliable networks | Violates spec #05; behaviour change for existing users |

**Recommendation**: A.

## Decision

**A — Declined**. User confirmed 2026-04-27 to keep webhooks fail-fast. Pinned to memory at `mem://constraints/webhook-fail-fast.md`. Future requests for retries should be redirected to consumer-side idempotency or manual re-send.

## Note on No-Questions Mode

This task triggered an `ask_questions` call before the No-Questions Mode constraint was re-checked. Going forward: log to this folder first, do not ask.
