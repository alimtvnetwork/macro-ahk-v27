/**
 * Marco Extension — sql.js Loader (Service Worker Safe)
 *
 * Uses the dist/sql-wasm.js entry directly to avoid service-worker
 * runtime issues from the package-level entrypoint.
 */

import type { SqlJsStatic } from "sql.js";

// dist build path does not ship a dedicated TypeScript declaration; the
// runtime export is the initSqlJs factory function.
import initSqlJsFactory from "sql.js/dist/sql-wasm.js";

interface InitSqlJsConfig {
    wasmBinary: ArrayBuffer;
}

const initSqlJs = initSqlJsFactory as unknown as (config: InitSqlJsConfig) => Promise<SqlJsStatic>;

export default initSqlJs;
