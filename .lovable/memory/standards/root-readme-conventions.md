---
name: Root README Conventions
description: Root readme.md must be centered, icon-led, with five badge groups, and a structured Author + Company section
type: standard
---

The repository-root `readme.md` follows the mandatory structure defined in `spec/01-spec-authoring-guide/11-root-readme-conventions.md`:

- **Centered hero block:** entire top section wrapped in `<div align="center">` containing the 128×128 logo (`docs/assets/<project>-logo.png`), the H1 project title, the tagline blockquote, all badge groups, and the hero screenshot (width=820).
- **Five badge groups required**, each prefixed with an HTML comment label (Build & Release, Repo activity, Community, Code-quality, Stack & standards). Per-group floors: ≥1 / ≥1 / ≥0 / ≥1 / ≥1, total ≥5. **Live-data badges only** — no `img.shields.io/badge/<text>-<text>-<color>` static mockups, no `activate` / `no status` / `not found` placeholders (see `mem://constraints/no-static-mockup-badges`). Always `style=flat-square`.
- **Badge layout: 1–2 visual lines max.** All five HTML group markers and their badges live on the same paragraph (no blank lines between rows), collapsing to one wrapping row on desktop. Stacked five-row layouts are forbidden — they push the hero screenshot below the fold. Grammar in `spec/01-spec-authoring-guide/11-root-readme-conventions.md` §"Badge Layout Rules".
- **Author section** (`## Author`): centered name (H3 linked to authoritative search URL) + role line `**[Primary Role](site)** | [Secondary Role](search), [Company](site)`, then a left-aligned biography paragraph (years of experience, stack with year counts, accolades, ≥2 reputation links), then a 2-column metadata table.
- **Company subsection** (`### <Company>`): tagline line first (verbatim from `mem://branding/author-identity`), then 2-column metadata table with Website + ≥2 social channels.
- **License section** (`## License`) closes the file, naming the owning legal entity.

Single H1 only. Logo + hero images live in `docs/assets/`. Company name spelling/casing must match `mem://branding/author-identity` exactly across README, About page, package.json, and license header.
