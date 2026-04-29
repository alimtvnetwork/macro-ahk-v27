import type { CssAsset } from "./css-asset";
import type { ConfigAsset } from "./config-asset";
import type { ScriptAsset } from "./script-asset";
import type { TemplateAsset } from "./template-asset";
import type { PromptAsset } from "./prompt-asset";

/**
 * Aggregate of every shipped asset type. Replaces the legacy in-place
 * `assets: { css: Array<{...}>; configs: Array<{...}>; ... }` shape
 * defined inside each project's `instruction.ts`.
 *
 * All keys PascalCase per `mem://standards/pascalcase-json-keys`.
 */
export type AssetBundle = {
    readonly Css: ReadonlyArray<CssAsset>;
    readonly Configs: ReadonlyArray<ConfigAsset>;
    readonly Scripts: ReadonlyArray<ScriptAsset>;
    readonly Templates: ReadonlyArray<TemplateAsset>;
    readonly Prompts: ReadonlyArray<PromptAsset>;
};
