# 06 — Run-Time Input Source (HTTP fetch at run start)

**Task**: "Add an option for my project to request input data from an
endpoint at the start of recording/execution and feed it into the group run."

## Ambiguity

1. **Scope of config** — per project, per group, or global? Project is
   the most natural unit ("my project"), but per-group overrides could
   be useful.
2. **Auth** — bearer token, custom headers, none?
3. **Method/body** — GET only, or also POST with a request body?
4. **Merge semantics** — does the fetched bag REPLACE the persisted
   group inputs, or MERGE on top? Which side wins on key collision?
5. **Failure policy** — abort the run, or continue with whatever local
   inputs exist?
6. **Recording vs Execution** — fetch only on execution, only on
   recording, or both?

## Inferred decisions

| Axis | Decision | Reason |
|------|----------|--------|
| Scope | Project-wide single source, applied at run start to every group in the run | Matches "for my project"; keeps storage tiny |
| Auth | Free-form headers (incl. `Authorization: …`) — same model as the result-webhook | Consistency, no new UI patterns |
| Method | GET (default) or POST. POST sends optional JSON body | GET covers most cases; POST handles authenticated lookups that need parameters |
| Merge | Endpoint bag MERGES with persisted local bag. Endpoint wins on collision (it's the "live" data) | Local persisted bag becomes the fallback; the endpoint is authoritative when reachable |
| Failure | Configurable: `Abort` (default) or `Continue with local inputs` | "Abort" matches user expectation that the data is required; "Continue" lets recordings run offline |
| Lifecycle | Fetch fires once at the start of `runBatch` (covers both Run-selected and Run-from-row paths). The recorder's start-recording hook is out of scope here — it lives in a separate module not yet wired through this panel | Keeps this task focused on the runner integration the panel actually exposes |
| Storage | `localStorage` key `marco.input-source.config.v1` | Mirrors webhook + group-inputs convention |
| Response shape | Top-level value MUST be a JSON object. Same validation as `parseGroupInputJson` | Reuses existing semantics |

## Reversibility

A future task can:
- Promote storage to a sql.js table once the surrounding settings move there.
- Add per-group endpoint overrides (current is project-wide).
- Hook the recorder's start-recording event when that module surfaces here.
