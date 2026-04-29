/**
 * Marco Extension — Message Router
 *
 * Dispatches incoming messages to the appropriate handler
 * based on the message type. Uses a handler registry to
 * keep complexity low per function.
 */

import { type MessageRequest } from "../shared/messages";
import { trackMessage } from "./message-tracker";
import { logBgError, logCaughtError, BgLogTag } from "./bg-logger";
import { BindError } from "./sqlite-bind-safety";

import {
    BROADCAST_TYPES,
    HANDLER_REGISTRY,
} from "./message-registry";

/* ------------------------------------------------------------------ */
/*  Re-export for backward compat                                      */
/* ------------------------------------------------------------------ */

export { getRecentTrackedMessages } from "./message-tracker";

/* ------------------------------------------------------------------ */
/*  Response Types                                                     */
/* ------------------------------------------------------------------ */

interface MessageResponse {
    isOk?: boolean;
    errorMessage?: string;
    [key: string]: string | number | boolean | null | undefined | object;
}

interface ErrorResponse {
    isOk: false;
    errorMessage: string;
}

/* ------------------------------------------------------------------ */
/*  Message Dispatch                                                   */
/* ------------------------------------------------------------------ */

/** Dispatches a message to its handler and sends the response. */
export async function handleMessage(
    rawMessage: MessageRequest | Record<string, string | number | boolean | null | undefined | object>,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse | ErrorResponse) => void,
): Promise<void> {
    const message = rawMessage as MessageRequest;
    const messageType = extractMessageType(message);

    try {
        const response = await routeMessage(message, sender);
        sendResponse(response);
    } catch (routingError) {
        sendResponse(buildErrorResponse(routingError, messageType));
    }
}

/** Best-effort extraction of the message type for diagnostic context. */
function extractMessageType(message: MessageRequest): string {
    const hasType = typeof message === "object"
        && message !== null
        && "type" in message;
    if (!hasType) {
        return "(unknown)";
    }
    const t = (message as { type?: string }).type;
    return typeof t === "string" ? t : "(unknown)";
}

/** Routes a message to the correct handler via registry lookup. */
// eslint-disable-next-line max-lines-per-function
async function routeMessage(
    message: MessageRequest,
    sender: chrome.runtime.MessageSender,
): Promise<MessageResponse> {
    const messageType = typeof message === "object"
        && message !== null
        && "type" in message
        ? (message as { type?: MessageRequest["type"] | "__PING__" }).type
        : undefined;

    if (messageType === "__PING__") {
        // Cold-start handshake reply. The shape `{ type: '__PONG__' }` is
        // contracted by tests/e2e/cold-start.spec.ts and any external probe
        // expecting a symmetric ping/pong. Do NOT change without updating
        // those callers.
        return { type: "__PONG__" } as unknown as MessageResponse;
    }

    if (messageType === undefined) {
        return {
            isOk: false,
            errorMessage: "Missing message type",
        };
    }

    const isBroadcast = BROADCAST_TYPES.has(messageType);

    if (isBroadcast) {
        trackMessage(String(messageType), 0, true);
        return { isOk: true };
    }

    const handler = HANDLER_REGISTRY.get(messageType);
    const hasHandler = handler !== undefined;

    if (hasHandler) {
        const start = performance.now();
        try {
            const result = await handler(message, sender);
            trackMessage(String(messageType), Math.round(performance.now() - start), true);
            return result as MessageResponse;
        } catch (err) {
            trackMessage(String(messageType), Math.round(performance.now() - start), false);
            throw err;
        }
    }

    return {
        isOk: false,
        errorMessage: `Unknown message type: ${String(messageType)}`,
    };
}

/**
 * Builds a standardized error response from a caught error.
 *
 * SQLite {@link BindError}s are special-cased: instead of just being logged
 * to the message-router console, they are routed through `logBgError` with
 * a dedicated `SQLITE_BIND_ERROR` code so they land in the Errors table
 * (and therefore the Errors panel) with the precise column name + SQL
 * preview attached as `context`. This guarantees that any future undefined
 * bind that escapes the entry-point guards is surfaced visually, not just
 * thrown into the void.
 */
function buildErrorResponse(
    error: Error | string | { message?: string },
    messageType: string,
): ErrorResponse {
    const errorMessage = error instanceof Error
        ? error.message
        : String(error);

    const isBindError = error instanceof BindError;
    if (isBindError) {
        const bindErr = error as BindError;
        const contextDetail =
            `messageType=${messageType} ` +
            `paramIndex=${bindErr.paramIndex} ` +
            `column="${bindErr.columnName}" ` +
            `sql="${bindErr.sqlPreview}"`;

        logBgError(
            BgLogTag.SQLITE_BIND,
            "SQLITE_BIND_ERROR",
            `Undefined bind for column "${bindErr.columnName}" (param #${bindErr.paramIndex}) ` +
            `in ${messageType} — SQL: ${bindErr.sqlPreview}`,
            error,
            { contextDetail },
        );

        return {
            isOk: false,
            errorMessage,
        };
    }

    logCaughtError(BgLogTag.MESSAGE_ROUTER, `Message handler failed: ${errorMessage}`, error);

    return {
        isOk: false,
        errorMessage,
    };
}
