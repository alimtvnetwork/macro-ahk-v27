# Changelog — Generic Chrome Extension Blueprint

**Version:** 1.4.0
**Updated:** 2026-04-24

> *Generic blueprint — no project-specific identifiers. If you find one, file an issue.*

---

## History

| Date | Version | Changes |
|------|---------|---------|
| 2026-04-24 | 1.4.0 | **`13-ai-onboarding-prompt.md` authored.** Single-prompt instruction (copy-verbatim block for fresh AI sessions) + 5 required input tokens table + 8 operating rules (sequential, templates-as-law, no invented conventions, zero warnings, CODE-RED, no-retry, dark-only, mandatory verification) + 10-step build checklist with per-step source-of-truth + verification command (scaffold → tokenise templates → install → lint/typecheck → AppError+logger → platform adapter → message relay → storage → UI shells → build/package/load-unpacked) + stop conditions + final structured report format + 19 cross-references. Generification grep clean. |
| 2026-04-24 | 1.3.0 | **`07-error-management/` core authored (files 01–03).** AppError model spec (canonical shape table, TS signatures, construction patterns, cross-world transport rules, pitfalls); Error code registry (format rules, 21 subsystem prefixes, allocation procedure, 40-row canonical registry seed, deprecation cycle); CODE-RED file/path rule (mandatory `path`+`missing`+`reason` for every FS/storage/DB/OPFS/IDB/LS error, scheme prefix vocabulary, `missing` token vocabulary, four-layer enforcement: TS signatures + `no-bare-fs-error` lint + `check-error-rule.mjs` + PR checklist, reference patterns). Generification grep clean. |
| 2026-04-24 | 1.2.0 | **`05-storage-layers/` authored.** All 6 body files complete: tier matrix decision tool with persistence reality table + cross-world cost table + anti-patterns; SQLite-in-background (sqlite-wasm + OPFS, lifecycle, WASM checksum, connection rules); SQLite schema conventions (PascalCase, JsonSchemaDef, additive-only migrations, validation rules, reserved tables); IndexedDB dual-cache pattern (envelope, transaction rules, version mismatch handling, quota); chrome.storage.local (key prefix system, typed adapter, unlimitedStorage policy, change events); localStorage TTL bridges (envelope shape, 10-min credential cap, host-permission failure recovery); self-healing & migrations (two-stage builtin-script-guard, hash-based config reseed, concurrent-activation lock, diagnostic surfacing). Generification grep clean. |
| 2026-04-24 | 1.1.0 | **Templates authored.** Replaced all 15 placeholder stubs in `12-templates/` with full copy-paste-ready artifacts: MV3 manifest, three tsconfig variants (app/sdk/node), two Vite configs (extension/SDK IIFE), flat ESLint config, Tailwind config, HSL design-tokens CSS, AppError model, platform-adapter interface, chrome-adapter implementation, NamespaceLogger, three-tier message-relay client, package.json baseline. All canonical tokens (`<PROJECT_NAME>`, `<ROOT_NAMESPACE>`, `<VERSION>`, `<HOST_MATCHES>`, `<EXTENSION_ID>`) marked with header banners. Generification grep clean. |
| 2026-04-24 | 1.0.0 | Initial folder skeleton scaffolded — `00-overview.md`, `01-fundamentals.md`, 11 sub-folders with `00-overview.md` placeholders, 12 sub-section placeholders per area, 15 template stubs, governance files. Body sections pending authoring per `.lovable/plan-26-chrome-extension-generic.md`. |
