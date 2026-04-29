/**
 * Marco — Chrome Extension Platform Adapter
 *
 * Real implementation backed by chrome.runtime, chrome.storage,
 * and chrome.tabs APIs. Used when running inside the extension.
 */

import "./chrome-api-types";

import type {
    PlatformAdapter,
    PlatformStorage,
    PlatformTabs,
    MessagePayload,
} from "./platform-adapter";

/* ------------------------------------------------------------------ */
/*  Retry Constants                                                    */
/* ------------------------------------------------------------------ */

const RETRY_DELAY_MS = 180;
const MAX_PING_ATTEMPTS = 12;

const RETRYABLE_ERROR_PATTERN =
    /(Could not establish connection|Receiving end does not exist|message port closed)/i;

/* ------------------------------------------------------------------ */
/*  Error Response Shape                                               */
/* ------------------------------------------------------------------ */

interface BackgroundErrorEnvelope {
    isOk?: boolean;
    errorMessage?: string;
}

interface BackgroundPingResponse {
    isOk?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Storage                                                            */
/* ------------------------------------------------------------------ */

const chromeStorage: PlatformStorage = {
    async get<T = string | number | boolean | null | object>(key: string): Promise<T> {
        const result = await chrome.storage.local.get(key);
        return (result[key] ?? null) as T;
    },

    async set(key: string, value: string | number | boolean | null | object): Promise<void> {
        await chrome.storage.local.set({ [key]: value });
    },

    async remove(key: string): Promise<void> {
        await chrome.storage.local.remove(key);
    },
};

/* ------------------------------------------------------------------ */
/*  Tabs                                                               */
/* ------------------------------------------------------------------ */

const chromeTabs: PlatformTabs = {
    openUrl(url: string): void {
        chrome.tabs.create({ url });
    },

    async getActiveTabId(): Promise<number | null> {
        const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true,
        });

        const hasValidId = tab !== undefined && tab.id !== undefined;
        return hasValidId ? tab.id ?? null : null;
    },
};

/* ------------------------------------------------------------------ */
/*  Messaging with Retry                                               */
/* ------------------------------------------------------------------ */

/** Checks whether the runtime error is a transient connection issue. */
function isRetryableError(error: Error | string): boolean {
    const message = error instanceof Error
        ? error.message
        : String(error);

    return RETRYABLE_ERROR_PATTERN.test(message);
}

/** Throws if the response is a standardized background error envelope. */
function throwIfErrorResponse(response: string | number | boolean | null | object): void {
    const isObjectResponse =
        typeof response === "object" && response !== null;

    if (!isObjectResponse) {
        return;
    }

    const envelope = response as BackgroundErrorEnvelope;

    const hasErrorFlag = envelope.isOk === false;
    const hasErrorMessage = typeof envelope.errorMessage === "string";

    if (hasErrorFlag && hasErrorMessage) {
        const fallback = "Background message failed";
        throw new Error(envelope.errorMessage ?? fallback);
    }
}

/** Waits for the background service worker to become responsive. */
async function waitForReceiver(): Promise<void> {
    for (let i = 0; i < MAX_PING_ATTEMPTS; i++) {
        try {
            const response = await chrome.runtime.sendMessage({
                type: "__PING__",
            });

            const isObjectResponse =
                typeof response === "object"
                && response !== null;

            const ping = isObjectResponse
                ? response as BackgroundPingResponse & { type?: string }
                : null;

            // Accept both legacy `{ isOk: true }` and current `{ type: '__PONG__' }`
            // reply shapes so the readiness probe survives router contract changes.
            const isReady = ping !== null
                && (ping.isOk === true || ping.type === "__PONG__");

            if (isReady) {
                return;
            }
        } catch {
            // keep retrying
        }

        const hasAttemptsRemaining = i < MAX_PING_ATTEMPTS - 1;

        if (hasAttemptsRemaining) {
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (i + 1)));
        }
    }

    throw new Error(
        "Background service worker is still starting. Please retry in a moment.",
    );
}

/** Sends a message with one automatic retry on transient errors. */
async function sendChromeMessage<T>(message: MessagePayload): Promise<T> {
    try {
        const response = await chrome.runtime.sendMessage(message);
        throwIfErrorResponse(response);
        return response as T;
    } catch (firstError) {
        const errorValue = firstError instanceof Error
            ? firstError
            : String(firstError);

        const shouldRetry = isRetryableError(errorValue);

        if (!shouldRetry) {
            throw firstError;
        }

        await waitForReceiver();
        const response = await chrome.runtime.sendMessage(message);
        throwIfErrorResponse(response);
        return response as T;
    }
}

/* ------------------------------------------------------------------ */
/*  Adapter                                                            */
/* ------------------------------------------------------------------ */

export const chromeAdapter: PlatformAdapter = {
    target: "extension",
    sendMessage: sendChromeMessage,
    storage: chromeStorage,
    tabs: chromeTabs,

    getExtensionUrl(path: string): string {
        return chrome.runtime.getURL(path);
    },
};
