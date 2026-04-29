# JSON Schemas

Authoritative schemas for machine-readable payloads emitted by repo scripts. CI tools (annotators, dashboards, status pages) MUST validate against the schema here before consuming a payload.

## Files

| Schema | Emitted by | Validated by |
|---|---|---|
| [`standalone-registry-report.schema.json`](./standalone-registry-report.schema.json) | `node scripts/report-standalone-registry.mjs --json` | `node scripts/validate-registry-report-schema.mjs` |

## Versioning rules

- `schemaVersion` is a string (`"1.0"`, `"1.1"`, `"2.0"`) embedded inside every payload.
- **Minor bump** (e.g. `1.0` → `1.1`): adding a new optional field, adding a new value to a closed enum, adding a new entry to `locations[]`. Existing consumers continue to validate.
- **Major bump** (e.g. `1.0` → `2.0`): renaming or removing a field, tightening a type, changing an enum's meaning, removing a `locations[]` key. Consumers must update.
- The schema's `$id` URL changes alongside any major bump so cached copies do not silently match the new shape.

## Local validation

```bash
node scripts/validate-registry-report-schema.mjs
```

Round-trips a real `--json` payload against the committed schema using `ajv` (draft 2020-12). Exits 0 on conformance, 1 with a `::error file=…::` annotation on any mismatch. Cheap (<1 s) — safe to wire as a PR-blocking check.

## Adding a new schema

1. Drop the schema next to this readme, named `<contract-name>.schema.json`.
2. Set `$schema` to `https://json-schema.org/draft/2020-12/schema`.
3. Add a row to the table above.
4. Add a sibling `validate-<contract-name>-schema.mjs` in `scripts/` that mirrors the registry pattern.
5. Wire the validator into CI alongside the generator.
