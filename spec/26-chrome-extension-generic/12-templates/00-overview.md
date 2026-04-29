# Templates

**Version:** 1.0.0
**Updated:** 2026-04-24
**Status:** Placeholder — to be authored
**AI Confidence:** Low (placeholder)
**Ambiguity:** None

> *Generic blueprint — no project-specific identifiers. If you find one, file an issue.*

---

## Overview

Copy-paste-ready artefacts for bootstrapping a new Chrome MV3 extension built from this blueprint. Each template begins with a header banner identifying its source, last review date, and required token substitutions.

---

## Canonical tokens

Every template uses the following placeholders. Replace them in this order:

| Token | Example value |
|-------|---------------|
| `<PROJECT_NAME>` | `MyExt` |
| `<ROOT_NAMESPACE>` | `MyExtNamespace` |
| `<VERSION>` | `1.0.0` |
| `<HOST_MATCHES>` | `https://example.com/*` |
| `<EXTENSION_ID>` | `abcdefghijklmnopabcdefghijklmnop` |

---

## File Inventory

| # | File | Description |
|---|------|-------------|
| 01 | [manifest.template.json](./manifest.template.json) | MV3 manifest with permission decision tree comments |
| 02 | [tsconfig.app.template.json](./tsconfig.app.template.json) | TypeScript config for extension UI bundle |
| 03 | [tsconfig.sdk.template.json](./tsconfig.sdk.template.json) | TypeScript config for page-injected SDK bundle |
| 04 | [tsconfig.node.template.json](./tsconfig.node.template.json) | TypeScript config for build/CI scripts |
| 05 | [vite.config.template.ts](./vite.config.template.ts) | Vite config for the main extension bundle |
| 06 | [vite.config.sdk.template.ts](./vite.config.sdk.template.ts) | Vite config for the SDK IIFE bundle |
| 07 | [eslint.config.template.js](./eslint.config.template.js) | Flat ESLint config with sonarjs + react-hooks + custom guards |
| 08 | [tailwind.config.template.ts](./tailwind.config.template.ts) | Tailwind config wired to HSL semantic tokens |
| 09 | [index.css.template](./index.css.template) | HSL semantic token definitions |
| 10 | [error-model.template.ts](./error-model.template.ts) | AppError class + serialisation helpers |
| 11 | [platform-adapter.template.ts](./platform-adapter.template.ts) | Platform adapter interface |
| 12 | [chrome-adapter.template.ts](./chrome-adapter.template.ts) | Chrome platform adapter implementation |
| 13 | [namespace-logger.template.ts](./namespace-logger.template.ts) | Per-namespace logger contract |
| 14 | [message-client.template.ts](./message-client.template.ts) | Message relay client |
| 15 | [package.json.template](./package.json.template) | npm scripts + dependency baseline |
