# Memory: architecture/marco-sdk-convention
Updated: 2026-03-23

The 'Rise Up Macro SDK' is a global, unremovable shared project at `standalone-scripts/marco-sdk/`. It provides a frozen `window.marco` namespace with modules: auth, cookies, config (with onChange reactivity), xpath (sync resolve + warm cache), kv, and files. All communication uses a postMessage bridge (MAIN → content script relay → background). The content script relay (`src/content-scripts/message-relay.ts`) accepts both `source: "marco-controller"` and `source: "marco-sdk"`, routing SDK responses via `source: "marco-sdk-response"`. Dependency injection order is resolved via topological sort in `src/background/dependency-resolver.ts` with semver range matching (^, ~, exact).
