/**
 * TEMPLATE — spec/26-chrome-extension-generic/12-templates/chrome-adapter.template.ts
 *
 * Purpose: Concrete Chrome implementation of the PlatformAdapter interface.
 *          The ONLY file in the codebase that may reference `chrome.*` directly.
 *          Every other module talks to the adapter.
 *
 * Last reviewed: 2026-04-24
 *
 * Tokens to replace before use: none.
 */

import { AppError } from "./error-model.template";
import type {
    AlarmsApi,
    KeyValueStore,
    PlatformAdapter,
    RuntimeApi,
    ScriptingApi,
    ScriptingTarget,
    TabSummary,
    TabsApi,
} from "./platform-adapter.template";

/* ───────────────────────── chrome.storage wrapper ──────────────────────── */

function makeChromeStorage(area: chrome.storage.StorageArea): KeyValueStore {
    return {
        async get<T>(key: string): Promise<T | undefined> {
            const result = await area.get(key);
            return result[key] as T | undefined;
        },
        async getMany<T extends Record<string, unknown>>(keys: readonly string[]): Promise<Partial<T>> {
            const result = await area.get([...keys]);
            return result as Partial<T>;
        },
        async set(key: string, value: unknown): Promise<void> {
            await area.set({ [key]: value });
        },
        async setMany(entries: Readonly<Record<string, unknown>>): Promise<void> {
            await area.set({ ...entries });
        },
        async remove(key: string): Promise<void> {
            await area.remove(key);
        },
        async clear(): Promise<void> {
            await area.clear();
        },
    };
}

/* ───────────────────────────── scripting ──────────────────────────────── */

const scripting: ScriptingApi = {
    async executeFunction(target, func, args) {
        const results = await chrome.scripting.executeScript({
            target: { tabId: target.tabId, frameIds: target.frameIds ? [...target.frameIds] : undefined },
            world: target.world ?? "ISOLATED",
            func: func as (...a: unknown[]) => unknown,
            args: args as unknown[],
        });
        const first = results[0];
        if (!first) {
            throw new AppError({
                code: "SCRIPTING_NO_RESULT",
                reason: "chrome.scripting.executeScript returned no frame results",
                context: { tabId: target.tabId },
            });
        }
        return first.result as never;
    },
    async executeFile(target: ScriptingTarget, files: readonly string[]): Promise<void> {
        await chrome.scripting.executeScript({
            target: { tabId: target.tabId, frameIds: target.frameIds ? [...target.frameIds] : undefined },
            world: target.world ?? "ISOLATED",
            files: [...files],
        });
    },
};

/* ───────────────────────────── runtime ────────────────────────────────── */

const runtime: RuntimeApi = {
    extensionId: chrome.runtime.id,
    version: chrome.runtime.getManifest().version,
    async sendMessage<TPayload, TResponse>(payload: TPayload): Promise<TResponse> {
        return (await chrome.runtime.sendMessage(payload)) as TResponse;
    },
    onMessage<TPayload>(handler) {
        const listener = (
            payload: unknown,
            sender: chrome.runtime.MessageSender,
            sendResponse: (response: unknown) => void,
        ): boolean => {
            const result = handler(payload as TPayload, {
                tabId: sender.tab?.id ?? null,
                frameId: sender.frameId ?? null,
            });
            if (result instanceof Promise) {
                result.then(sendResponse).catch((err: unknown) => {
                    sendResponse({ error: AppError.isAppError(err) ? err.toJSON() : String(err) });
                });
                return true; // keep channel open for async response
            }
            sendResponse(result);
            return false;
        };
        chrome.runtime.onMessage.addListener(listener);
        return () => chrome.runtime.onMessage.removeListener(listener);
    },
    getURL(path: string): string {
        return chrome.runtime.getURL(path);
    },
};

/* ───────────────────────────── tabs ───────────────────────────────────── */

function toSummary(tab: chrome.tabs.Tab): TabSummary | null {
    if (tab.id === undefined || tab.windowId === undefined) return null;
    let origin: string | null = null;
    if (tab.url) {
        try { origin = new URL(tab.url).origin; } catch { origin = null; }
    }
    return {
        id: tab.id,
        url: tab.url ?? "",
        origin,
        active: tab.active,
        windowId: tab.windowId,
    };
}

const tabs: TabsApi = {
    async query(filter) {
        const result = await chrome.tabs.query({
            active: filter.active,
            currentWindow: filter.currentWindow,
            url: filter.url as string | string[] | undefined,
        });
        return result.map(toSummary).filter((t): t is TabSummary => t !== null);
    },
    async get(tabId) {
        try {
            return toSummary(await chrome.tabs.get(tabId));
        } catch {
            return null;
        }
    },
    onUpdated(handler) {
        const listener = (_id: number, _info: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
            const summary = toSummary(tab);
            if (summary) handler(summary);
        };
        chrome.tabs.onUpdated.addListener(listener);
        return () => chrome.tabs.onUpdated.removeListener(listener);
    },
    onRemoved(handler) {
        const listener = (id: number) => handler(id);
        chrome.tabs.onRemoved.addListener(listener);
        return () => chrome.tabs.onRemoved.removeListener(listener);
    },
};

/* ───────────────────────────── alarms ─────────────────────────────────── */

const alarms: AlarmsApi = {
    async create(name, when) {
        chrome.alarms.create(name, when);
    },
    async clear(name) {
        return await chrome.alarms.clear(name);
    },
    onAlarm(handler) {
        const listener = (alarm: chrome.alarms.Alarm) => handler(alarm.name);
        chrome.alarms.onAlarm.addListener(listener);
        return () => chrome.alarms.onAlarm.removeListener(listener);
    },
};

/* ────────────────────────── adapter export ────────────────────────────── */

export const chromeAdapter: PlatformAdapter = {
    storage: {
        local: makeChromeStorage(chrome.storage.local),
        session: makeChromeStorage(chrome.storage.session),
    },
    scripting,
    runtime,
    tabs,
    alarms,
    reportError(error) {
        // Bridges to NamespaceLogger + ERROR_COUNT_CHANGED broadcast.
        // See namespace-logger.template.ts for the consumer side.
        chrome.runtime
            .sendMessage({ type: "DIAGNOSTIC_ERROR", payload: error.toJSON() })
            .catch(() => {
                // Background may be inactive — fall back to console.
                console.debug("[platform] reportError fallback", error.toJSON());
            });
    },
};
