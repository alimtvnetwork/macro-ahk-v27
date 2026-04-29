/**
 * Registry alias for vite.config.macro.ts.
 *
 * The macro-controller bundle is built via vite.config.macro.ts (legacy
 * filename retained for shell-script backward compatibility). The standalone
 * registry checker (`scripts/report-standalone-registry.mjs`) expects a
 * `vite.config.<scriptName>.ts` file, so this thin alias re-exports the
 * canonical config under the registry-required name.
 *
 * Both filenames are valid entry points for `vite build --config …`.
 */
export { default } from "./vite.config.macro";