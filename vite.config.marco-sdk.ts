/**
 * Registry alias for vite.config.sdk.ts.
 *
 * The marco-sdk bundle is built via vite.config.sdk.ts (legacy filename
 * retained for shell-script backward compatibility). The standalone registry
 * checker (`scripts/report-standalone-registry.mjs`) expects a
 * `vite.config.<scriptName>.ts` file, so this thin alias re-exports the
 * canonical config under the registry-required name.
 */
export { default } from "./vite.config.sdk";