# Glossary — Macro Recorder

**Version:** 1.0.0
**Updated:** 2026-04-26

---

| Term | Definition |
|------|------------|
| `Project` | Top-level container owning a set of `Step` rows and `DataSource` files. One Project = one recorded macro. |
| `Step` | A single recorded interaction. Has a `StepKind`, a `Selector`, an optional `FieldBinding`, and a unique PascalCase `VariableName`. |
| `StepKind` | Enum: `Click`, `Type`, `Select`, `Wait`, `JsInline`. Stored as a normalised lookup table. |
| `StepStatus` | Enum: `Draft`, `Active`, `Disabled`. Stored as a normalised lookup table. |
| `Selector` | The XPath (full or relative) plus the `SelectorKind` and optional `AnchorSelectorId` used to locate the target at replay. |
| `SelectorKind` | Enum: `XPathFull`, `XPathRelative`, `Css`, `Aria`. Stored as a normalised lookup table. |
| `Anchor` | A previously captured `Step` whose selector serves as the base for a relative XPath. Stored as `Selector.AnchorSelectorId` (self-FK). |
| `DataSource` | A CSV or JSON file dropped into the recorder during capture. Persisted with parsed column metadata. |
| `DataSourceKind` | Enum: `Csv`, `Json`. Stored as a normalised lookup table. |
| `FieldBinding` | A link between one `Step` and one `DataSource` column. At replay, the column value is substituted into the step input. |
| `VariableName` | PascalCase identifier suggested at capture from the closest `<label>`/`aria-label`/`placeholder`. Editable, unique per Project. |
| `RecordingPhase` | UI state machine: `Idle`, `Recording`, `Paused`. Defined in `26-chrome-extension-generic/06-ui-and-design-system/10-toolbar-recording-ux.md`. |
| `Replay Contract` | The deterministic protocol the runtime uses to re-execute a Project: resolve `Selector`, resolve `FieldBinding`, dispatch by `StepKind`. |
| `JsInline` | A `Step` whose body is a sandboxed JavaScript snippet; supports reusable snippets scoped to the Project. |
| `LlmGuide` | The authoring guide produced in Phase 12. Documents schema, extension points, and the binding/replay contracts so an LLM can extend the recorder safely. |
