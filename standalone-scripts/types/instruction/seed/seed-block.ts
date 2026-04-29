import type { Identifier } from "../primitives/identifier";
import type { CookieBinding } from "./cookie-binding";
import type { CookieSpec } from "./cookie-spec";
import type { TargetUrl } from "./target-url";

/**
 * Declarative seed metadata that controls how the runtime registers,
 * persists, and re-injects a standalone script.
 *
 * `TSettings` carries the project-specific settings shape; default to
 * `EmptySettings` when there are none. Settings live in their own
 * project type file — never inlined here.
 *
 * All keys are PascalCase per `mem://standards/pascalcase-json-keys`.
 * `RunAt` is the literal string union (matches Chrome's `chrome.scripting`
 * vocabulary) so the JSON stays stable; consumers may map it to an enum
 * at the boundary if exhaustive switches are needed.
 */
export type SeedBlock<TSettings extends object> = {
    readonly Id: Identifier;
    readonly SeedOnInstall: boolean;
    readonly IsRemovable: boolean;
    readonly AutoInject: boolean;
    readonly RunAt?: "document_start" | "document_end" | "document_idle";
    readonly CookieBinding?: CookieBinding;
    readonly TargetUrls: ReadonlyArray<TargetUrl>;
    readonly Cookies: ReadonlyArray<CookieSpec>;
    readonly Settings: TSettings;
    readonly ConfigSeedIds?: Readonly<Record<string, string>>;
};
