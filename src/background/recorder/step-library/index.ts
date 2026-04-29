/**
 * Step-library barrel.
 *
 * Re-exports every submodule under a namespace alias so consumers can write:
 *
 *     import { resultWebhook, schema } from "@/background/recorder/step-library";
 *     resultWebhook.dispatchWebhook(...);
 *     const kind = schema.StepKindId.Click;
 *
 * Direct submodule imports (e.g. `@/background/recorder/step-library/result-webhook`)
 * continue to work — this barrel is **additive**, not a replacement. We use
 * `export * as <ns>` namespace re-exports rather than a flat `export *` to
 * avoid symbol collisions between modules (e.g. several modules independently
 * export `JsonValue`, `*ErrorSeverity`, etc.).
 *
 * NOTE: do not add side-effectful imports here. The barrel must remain a
 * pure re-export shell so tree-shaking can drop unused namespaces.
 */

export * as csvMapping           from "./csv-mapping";
export * as csvParse             from "./csv-parse";
export * as db                   from "./db";
export * as exportBundle         from "./export-bundle";
export * as exportErrorExplainer from "./export-error-explainer";
export * as groupInputs          from "./group-inputs";
export * as hotkeyExecutor       from "./hotkey-executor";
export * as importBundle         from "./import-bundle";
export * as importErrorExplainer from "./import-error-explainer";
export * as inputSource          from "./input-source";
export * as replayBridge         from "./replay-bridge";
export * as resultWebhook        from "./result-webhook";
export * as runBatch             from "./run-batch";
export * as runGroupRunner       from "./run-group-runner";
export * as schema               from "./schema";
export * as stepWait             from "./step-wait";
