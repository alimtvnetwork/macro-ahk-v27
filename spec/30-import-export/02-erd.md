# 30-02 — Import/Export ERD & Flow

**Status**: Spec — pending review.
**Last updated**: 2026-04-24.
**Diagrams**: rendered Mermaid sources in `/mnt/documents/`:
- `import-export-erd.mmd` — real SQLite schema in the export bundle.
- `import-export-flow.mmd` — full pipeline (authoring → SQLite → zip → import → resolver).

---

## 1. ERD — what's actually inside `marco-backup.db`

```mermaid
erDiagram
    Projects {
        INTEGER  Id            PK "AUTOINCREMENT"
        TEXT     Uid              "runtime UUID for diff/merge"
        INTEGER  SchemaVersion    "default 1"
        TEXT     Name             "required"
        TEXT     Version          "required"
        TEXT     Description
        TEXT     TargetUrls       "JSON array of UrlRule"
        TEXT     Scripts          "JSON array of ScriptEntry (path bindings)"
        TEXT     Configs          "JSON array of ConfigEntry"
        TEXT     CookieRules      "JSON array"
        TEXT     Settings         "JSON object (ProjectSettings)"
        TEXT     CreatedAt        "ISO8601"
        TEXT     UpdatedAt        "ISO8601"
    }

    Scripts {
        INTEGER  Id            PK "AUTOINCREMENT"
        TEXT     Uid              "runtime UUID"
        TEXT     Name             "required"
        TEXT     Description
        TEXT     Code             "raw script body"
        INTEGER  RunOrder         "default 0"
        TEXT     RunAt            "document_idle | document_start | document_end"
        TEXT     ConfigBinding
        INTEGER  IsIife           "0/1"
        INTEGER  HasDomUsage      "0/1"
        TEXT     CreatedAt
        TEXT     UpdatedAt
    }

    Configs {
        INTEGER  Id            PK "AUTOINCREMENT"
        TEXT     Uid
        TEXT     Name             "required"
        TEXT     Description
        TEXT     Json             "raw config payload"
        TEXT     CreatedAt
        TEXT     UpdatedAt
    }

    Prompts {
        INTEGER  Id            PK "AUTOINCREMENT"
        TEXT     Uid
        TEXT     Name             "required"
        TEXT     Text             "byte-equal to prompt.md after trimEnd()"
        INTEGER  RunOrder
        INTEGER  IsDefault        "0/1"
        INTEGER  IsFavorite       "0/1"
        TEXT     Category         "denormalised single category"
        TEXT     CreatedAt
        TEXT     UpdatedAt
    }

    Meta {
        INTEGER  Id            PK "AUTOINCREMENT"
        TEXT     Key              "UNIQUE"
        TEXT     Value
    }

    Projects ||..o{ Scripts : "Projects.Scripts JSON \\nbinds by Uid/Name"
    Projects ||..o{ Configs : "Projects.Configs JSON \\nbinds by Uid/Name"
```

> **Implicit relationships**: `Projects.Scripts` (JSON array) holds path/UID strings that resolve against the `Scripts` library table at runtime. There is no FK enforced by SQLite. The export preserves both halves; the import re-binds them by `Uid` or `Name`.

> **Out of scope for v1 export**: `PromptsCategory`, `PromptsToCategory` (runtime-only; multi-category links are flattened into `Prompts.Category` on export — flagged in `01-rca.md` §5.3).

## 2. Flow — full pipeline

```mermaid
flowchart TD
    subgraph Authoring["1. Authoring (repo)"]
        A1["standalone-scripts/prompts/&lt;NN-slug&gt;/info.json<br/>(PascalCase after migration)"]
        A2["standalone-scripts/prompts/&lt;NN-slug&gt;/prompt.md<br/>(raw text)"]
    end

    subgraph Build["2. Build pipeline"]
        B1["scripts/aggregate-prompts.mjs<br/>read + trim()"]
        B2["chrome-extension/prompts/macro-prompts.json<br/>(camelCase array)"]
    end

    subgraph Runtime["3. Extension runtime"]
        R1["prompt-handler.ts<br/>seeds SQLite on first launch"]
        R2[("SQLite Prompts table<br/>PascalCase cols")]
        R3[("SQLite Projects + Scripts +<br/>Configs tables")]
    end

    subgraph Export["4. Export"]
        E1["sqlite-bundle.ts<br/>exportProjectAsSqliteZip()<br/>or exportAllAsSqliteZip()"]
        E2["marco-backup.db (in-memory)"]
        E3["JSZip → marco-backup.zip<br/>or &lt;slug&gt;-backup.zip"]
    end

    subgraph Import["5. Import"]
        I1["importFromSqliteZip(file)"]
        I2["unzip → marco-backup.db"]
        I3["validate PascalCase schema"]
        I4["readProjects/Scripts/Configs/Prompts"]
        I5["replaceAll() or mergeAll()<br/>via SAVE_* messages"]
    end

    subgraph Resolver["6. Prompt resolver (test-only contract)"]
        P1["resolvePromptBySlug(slug)"]
        P2["SELECT Text FROM Prompts WHERE Slug=?"]
        P3{{"assert: Text === trimEnd(readFile(prompt.md))"}}
    end

    A1 --> B1
    A2 --> B1
    B1 --> B2
    B2 --> R1
    R1 --> R2
    R3 --> E1
    R2 --> E1
    E1 --> E2 --> E3
    E3 -. user shares .-> I1
    I1 --> I2 --> I3 --> I4 --> I5 --> R3
    I5 --> R2
    R2 --> P2
    P1 --> P2 --> P3
    A2 -. byte-equal after trimEnd .-> P3
```

## 3. Reading the diagrams

- **ERD** — every box is a real PascalCase table that ships in `marco-backup.db`. Dotted `||..o{` relationships are JSON-blob bindings (not enforced FKs).
- **Flow** — six numbered subgraphs map to the six stages. Stage 6 is the **prompt-resolver round-trip**: the test asserts the path from `prompt.md` (stage 1) all the way through stages 2-5 lands back as the same bytes.

## 4. Where the diagrams live

The two `.mmd` files are emitted to `/mnt/documents/` so you can preview them inline:

- `<presentation-artifact path="import-export-erd.mmd" mime_type="text/vnd.mermaid"></presentation-artifact>`
- `<presentation-artifact path="import-export-flow.mmd" mime_type="text/vnd.mermaid"></presentation-artifact>`

(The artifact tags are emitted at the end of the chat reply, not inside this spec doc.)
