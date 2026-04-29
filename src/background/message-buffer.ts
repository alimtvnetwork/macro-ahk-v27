/**
 * Marco Extension — Pre-Init Message Buffer
 *
 * Queues incoming messages before the service worker is fully initialized,
 * then drains them in order once boot completes.
 */

import { type MessageRequest } from "../shared/messages";
import { handleMessage } from "./message-router";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface MessageResponse {
    isOk?: boolean;
    errorMessage?: string;
    [key: string]: string | number | boolean | null | undefined | object;
}

interface BufferedMessage {
    message: MessageRequest | Record<string, string | number | boolean | null | undefined | object>;
    sender: chrome.runtime.MessageSender;
    sendResponse: (response: MessageResponse) => void;
}

/* ------------------------------------------------------------------ */
/*  State                                                              */
/* ------------------------------------------------------------------ */

let initialized = false;
const messageBuffer: BufferedMessage[] = [];

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/** Returns whether the service worker has finished booting. */
export function isInitialized(): boolean {
    return initialized;
}

/** Marks the service worker as initialized. */
export function markInitialized(): void {
    initialized = true;
}

/** Enqueues a message for later processing. */
export function bufferMessage(
    message: MessageRequest | Record<string, string | number | boolean | null | undefined | object>,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void,
): void {
    messageBuffer.push({ message, sender, sendResponse });
}

/** Drains all buffered messages in order. */
export async function drainBuffer(): Promise<void> {
    for (const entry of messageBuffer) {
        await handleMessage(entry.message, entry.sender, entry.sendResponse);
    }
    messageBuffer.length = 0;
}
