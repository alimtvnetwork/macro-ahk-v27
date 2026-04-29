# 04 — Result Webhook Endpoint Shape

**Task**: "Add an option to send execution/recording results or generated data
to a configurable endpoint via HTTP during run."

## Ambiguity

The phrase "during run" leaves several axes undetermined:

1. **Granularity** — fire per-step, per-group, per-batch, or per-recording-session?
2. **Transport** — POST JSON only, or also support form-encoded / custom verb?
3. **Auth** — none, bearer token, custom header, basic auth?
4. **Reliability** — fire-and-forget, retry on failure, queue while offline?
5. **Recording vs Execution** — recorder events (StepCaptured, RecordingStopped)
   vs runner events (GroupSucceeded, GroupFailed, BatchComplete)?

## Inferred decisions (best-effort defaults)

| Axis | Decision | Reason |
|------|----------|--------|
| Granularity | All four event kinds, user-toggleable per kind | Caller picks granularity without code change |
| Transport | POST JSON, configurable headers map | Simplest universal contract; covers Slack/Zapier/n8n/custom |
| Auth | Free-form headers (incl. `Authorization: Bearer …`) + optional secret token mirrored to `X-Marco-Token` | No new UI surface beyond headers; matches typical webhook receivers |
| Reliability | Fire-and-forget with single attempt + 8s timeout; failures only logged to console + delivery log ring buffer (last 20) | Matches "during run" — not a queue/job system; user can see failures in dialog |
| Recording vs Execution | Cover **GroupRunSucceeded**, **GroupRunFailed**, **BatchComplete**, **RecordingStopped** events. StepCaptured deliberately excluded (would flood) | Avoids accidental DOS of webhook |
| Storage | `localStorage` key `marco.webhook.config.v1` mirroring the group-inputs convention | Consistent with surrounding modules |
| Variable substitution in URL/headers | `{{GroupId}}`, `{{GroupName}}`, `{{ProjectId}}`, `{{Outcome}}` resolved from event payload | Lightweight templating, no engine |

## Reversibility

A future task can:
- Promote storage to a sql.js table when other settings move there.
- Add per-group webhook overrides (current config is global per project).
- Add retry/queue if reliability becomes a requirement.
