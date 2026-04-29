/**
 * Marco Extension — Seed Manifest Types
 *
 * Declarative schema for `seed-manifest.json`, generated at build time
 * from each project's `instruction.json`.
 *
 * The seeder reads this single file to know what scripts, configs,
 * and projects to seed — no hardcoded chunks needed.
 *
 * ── PascalCase policy (Phase 2a, mem://standards/pascalcase-json-keys) ──
 *
 * Every key in this manifest is PascalCase to match the canonical
 * `ProjectInstruction` shape (the manifest is just a flattened+resolved
 * projection of one or more instruction.json files). The only places
 * where camelCase survives are at third-party boundaries —
 * specifically the `chrome.scripting` `runAt` enum values
 * (`"document_start" | "document_end" | "document_idle"`), which
 * are *values* not *keys* and must stay verbatim because Chrome's API
 * compares them by string equality.
 */

/* ------------------------------------------------------------------ */
/*  Top-Level Manifest                                                 */
/* ------------------------------------------------------------------ */

export interface SeedManifest {
    /** ISO timestamp when the manifest was generated */
    GeneratedAt: string;
    /** Schema version for forward compatibility (bumped on key-rename) */
    SchemaVersion: number;
    /** All project entries to seed */
    Projects: SeedProjectEntry[];
}

/* ------------------------------------------------------------------ */
/*  Per-Project Entry                                                  */
/* ------------------------------------------------------------------ */

export interface SeedProjectEntry {
    /** Project folder name (e.g., "macro-controller") */
    Name: string;
    /** Human-readable name */
    DisplayName: string;
    /** Semantic version */
    Version: string;
    /** Description */
    Description: string;

    /** Deterministic seed ID for chrome.storage.local */
    SeedId: string;
    /** Whether this project seeds on first install */
    SeedOnInstall: boolean;
    /** Chrome execution world */
    World: "MAIN" | "ISOLATED";
    /** Global load order (lower = first) */
    LoadOrder: number;
    /** Whether this is a global utility */
    IsGlobal: boolean;
    /** Whether the user can remove this project */
    IsRemovable: boolean;
    /** Project dependencies (other project folder names) */
    Dependencies: string[];

    /** Script entries to seed into chrome.storage.local */
    Scripts: SeedScriptEntry[];
    /** Config entries to seed into chrome.storage.local */
    Configs: SeedConfigEntry[];
    /** CSS files to inject into <head> */
    Css: SeedCssEntry[];
    /** Template registries */
    Templates: SeedTemplateEntry[];
    /** Prompt files */
    Prompts: SeedPromptEntry[];

    /** Target URL patterns for injection */
    TargetUrls: SeedUrlPattern[];
    /** Cookie bindings for auth */
    Cookies: SeedCookieBinding[];

    /** Project-level settings overrides */
    Settings?: SeedProjectSettings;
}

/* ------------------------------------------------------------------ */
/*  Asset Entries                                                      */
/* ------------------------------------------------------------------ */

export interface SeedScriptEntry {
    /** Deterministic ID for this script in storage */
    SeedId: string;
    /** File name (e.g., "macro-looping.js") */
    File: string;
    /** Relative path in extension dist (e.g., "projects/scripts/macro-controller/macro-looping.js") */
    FilePath: string;
    /** Injection order within the project */
    Order: number;
    /** Whether this is an IIFE bundle */
    IsIife: boolean;
    /** Config key this script depends on (resolved to config seedId at seed time) */
    ConfigBinding?: string;
    /** Config key for theme data (resolved to config seedId at seed time) */
    ThemeBinding?: string;
    /** Cookie name binding */
    CookieBinding?: string;
    /**
     * When to run. Values are Chrome's `chrome.scripting` enum literals
     * (third-party value-set — kept verbatim).
     */
    RunAt?: "document_start" | "document_idle" | "document_end";
    /** Description */
    Description?: string;
    /** Whether to auto-inject on page load */
    AutoInject: boolean;
}

export interface SeedConfigEntry {
    /** Deterministic ID for this config in storage */
    SeedId: string;
    /** File name (e.g., "macro-looping-config.json") */
    File: string;
    /** Relative path in extension dist */
    FilePath: string;
    /** Key used for binding resolution */
    Key: string;
    /** Window global variable name */
    InjectAs?: string;
    /** Description */
    Description?: string;
}

export interface SeedCssEntry {
    /** File name */
    File: string;
    /** Relative path in extension dist */
    FilePath: string;
    /** Injection target */
    Inject: "head";
}

export interface SeedTemplateEntry {
    /** File name */
    File: string;
    /** Relative path in extension dist */
    FilePath: string;
    /** Window global variable name */
    InjectAs?: string;
}

export interface SeedPromptEntry {
    /** File name */
    File: string;
    /** Relative path in extension dist */
    FilePath: string;
}

/* ------------------------------------------------------------------ */
/*  URL & Cookie Patterns                                              */
/* ------------------------------------------------------------------ */

export interface SeedUrlPattern {
    Pattern: string;
    MatchType: "glob" | "regex" | "exact";
}

export interface SeedCookieBinding {
    CookieName: string;
    Url: string;
    Role: "session" | "refresh" | "other";
    Description: string;
}

/* ------------------------------------------------------------------ */
/*  Project Settings                                                   */
/* ------------------------------------------------------------------ */

/**
 * Per-project settings carried straight through from
 * `ProjectInstruction.Seed.Settings`. Each project pins its own
 * settings shape (e.g. `MacroControllerSettings`) — the union below is
 * the manifest-level lens covering every known consumer.
 */
export interface SeedProjectSettings {
    IsolateScripts?: boolean;
    LogLevel?: "debug" | "info" | "warn" | "error";
    RetryOnNavigate?: boolean;
    ChatBoxXPath?: string;
    OnlyRunAsDependency?: boolean;
    AllowDynamicRequests?: boolean;
}
