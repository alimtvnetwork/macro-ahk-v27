---
name: Instruction dual-emit (Phase 2b → Phase 2c)
description: compile-instruction.mjs emits canonical PascalCase instruction.json + transitional camelCase instruction.compat.json; CI enforces PascalCase contract; Phase 2c removes the compat emit
type: feature
---

# Instruction dual-emit (Phase 2b → Phase 2c)

`scripts/compile-instruction.mjs` emits **two physical files** per project on every compile:

- `dist/instruction.json`        — pure PascalCase (canonical, what every Phase 2a-migrated reader consumes).
- `dist/instruction.compat.json` — pure camelCase (transitional snapshot, recursively converted from the canonical tree).

Both files are required by `scripts/check-standalone-dist.mjs` for all four shipping projects (`marco-sdk`, `macro-controller`, `xpath`, `payment-banner-hider`).

## Canonical key set

The PascalCase key set is defined in `standalone-scripts/types/instruction/**/*.ts` and the full mapping table is documented in `mem://standards/pascalcase-json-keys`. Do not duplicate it here — that file is the authoritative source.

## Last camelCase reader (the only thing keeping `compat.json` alive)

The vite `copyProjectScripts` plugin in `vite.config.extension.ts` reads `instruction.compat.json` for `assets.{configs,templates,prompts,css,scripts}`, `displayName`, and `version`. **Phase 2c** migrates this plugin to PascalCase (read `Assets.{Configs,…}`, `DisplayName`, `Version` from the canonical file), then:

1. Remove `vite.config.extension.ts` from `COMPAT_READER_ALLOWLIST` in `scripts/check-pascalcase-instruction-migration.mjs`.
2. Delete the `instruction.compat.json` emit from `scripts/compile-instruction.mjs`.
3. Remove `instruction.compat.json` from the required-files lists in `scripts/check-standalone-dist.mjs`.

After Phase 2c the allowlist contains only build-tooling self-references (compile-instruction, check-standalone-dist, generate-seed-manifest, the migration checker) — none of which actually consume camelCase keys.

## Collision guard

If two source keys map to the same camelCase name (e.g. `Foo` + `foo` on the same object), the compiler throws with the JSON path, both keys, and a rename hint. Do not silently dedupe — fix the source `instruction.ts`.

## CI enforcement

`scripts/check-pascalcase-instruction-migration.mjs` runs as the `pascalcase-instruction-migration` preflight job in `.github/workflows/ci.yml` (also listed in `build-extension`'s `needs:`). Three checks, one pass, no deps:

- **CHECK A** — every `standalone-scripts/<name>/src/instruction.ts` contains only PascalCase object-literal keys. Allowlist: `config`, `theme` for free-form `ConfigSeedIds` binding names.
- **CHECK B** — `instruction.compat.json` is read only from the documented allowlist (`vite.config.extension.ts` + the dual-emit pipeline scripts).
- **CHECK C** — every file that reads canonical `instruction.json` uses PascalCase property access on instruction-tree receivers (`instruction`, `instructionManifest`, `instructionJson`, `projectInstruction`, …). Bare `manifest` is intentionally **excluded** — it collides with the user-facing `ProjectManifest` export schema (deliberately camelCase per the third-party-boundary exemption).

All violations emit `::error file=…,line=…::` annotations so they show up inline on PR diffs.

## SeedManifest version pin

`scripts/generate-seed-manifest.mjs` pins `SchemaVersion: 2`. The runtime seeder (`src/background/manifest-seeder.ts`) accepts only v2; v1 (camelCase) was removed alongside the runtime's compat read in Phase 2a.
