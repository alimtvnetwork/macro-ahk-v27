/**
 * TEMPLATE — spec/26-chrome-extension-generic/12-templates/platform-adapter.template.ts
 *
 * Purpose: Platform adapter interface — abstracts every chrome.* API used by
 *          the extension behind a typed surface so tests can mock cleanly and
 *          future ports (Firefox/Safari) require only a new adapter.
 *
 * Last reviewed: 2026-04-24
 *
 * Tokens to replace before use: none.
 */

import type { AppError } from "./error-model.template";

export interface KeyValueStore {
    get<T = unknown>(key: string): Promise<T | undefined>;
    getMany<T extends Record<string, unknown>>(keys: readonly string[]): Promise<Partial<T>>;
    set(key: string, value: unknown): Promise<void>;
    setMany(entries: Readonly<Record<string, unknown>>): Promise<void>;
    remove(key: string): Promise<void>;
    clear(): Promise<void>;
}

export interface TabSummary {
    readonly id: number;
    readonly url: string;
    readonly origin: string | null;
    readonly active: boolean;
    readonly windowId: number;
}

export interface ScriptingTarget {
    readonly tabId: number;
    readonly frameIds?: readonly number[];
    readonly world?: "ISOLATED" | "MAIN";
}

export interface ScriptingApi {
    executeFunction<TArgs extends readonly unknown[], TResult>(
        target: ScriptingTarget,
        func: (...args: TArgs) => TResult,
        args: TArgs,
    ): Promise<TResult>;

    executeFile(target: ScriptingTarget, files: readonly string[]): Promise<void>;
}

export interface RuntimeApi {
    readonly extensionId: string;
    readonly version: string;
    sendMessage<TPayload, TResponse>(payload: TPayload): Promise<TResponse>;
    onMessage<TPayload>(
        handler: (payload: TPayload, sender: { tabId: number | null; frameId: number | null }) => Promise<unknown> | unknown,
    ): () => void;
    getURL(path: string): string;
}

export interface AlarmsApi {
    create(name: string, when: { delayInMinutes?: number; periodInMinutes?: number }): Promise<void>;
    clear(name: string): Promise<boolean>;
    onAlarm(handler: (name: string) => void): () => void;
}

export interface TabsApi {
    query(filter: { active?: boolean; currentWindow?: boolean; url?: string | readonly string[] }): Promise<readonly TabSummary[]>;
    get(tabId: number): Promise<TabSummary | null>;
    onUpdated(handler: (tab: TabSummary) => void): () => void;
    onRemoved(handler: (tabId: number) => void): () => void;
}

export interface PlatformAdapter {
    readonly storage: { local: KeyValueStore; session: KeyValueStore };
    readonly scripting: ScriptingApi;
    readonly runtime: RuntimeApi;
    readonly tabs: TabsApi;
    readonly alarms: AlarmsApi;

    /** Surface a non-fatal error to the unified diagnostics channel. */
    reportError(error: AppError): void;
}
