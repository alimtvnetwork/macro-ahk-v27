/**
 * TEMPLATE — spec/26-chrome-extension-generic/12-templates/message-client.template.ts
 *
 * Purpose: Three-tier message relay client. Provides:
 *
 *   • A typed `defineMessage<TReq, TRes>(type)` factory for the catalogue.
 *   • A `messageRegistry` for the background SW to register handlers.
 *   • A `messageClient` for any context (options/popup/content/SDK) to call
 *     a typed message and await a typed response.
 *   • A page MAIN-world bridge built on `window.postMessage` that the content
 *     script forwards to the background SW.
 *
 * Last reviewed: 2026-04-24
 *
 * Tokens to replace before use:
 *   <ROOT_NAMESPACE> — JS global the page bridge tags messages with.
 */

import { AppError, type AppErrorJSON } from "./error-model.template";
import { createLogger } from "./namespace-logger.template";

const logger = createLogger("messaging");

/* ───────────────────────── envelope shape ─────────────────────────────── */

const ENVELOPE_TAG = "<ROOT_NAMESPACE>:msg" as const;

interface MessageEnvelope<TPayload> {
    readonly tag: typeof ENVELOPE_TAG;
    readonly id: string;
    readonly type: string;
    readonly payload: TPayload;
}

interface MessageReply<TResult> {
    readonly tag: typeof ENVELOPE_TAG;
    readonly id: string;
    readonly ok: boolean;
    readonly result?: TResult;
    readonly error?: AppErrorJSON;
}

function isEnvelope(value: unknown): value is MessageEnvelope<unknown> {
    return typeof value === "object" && value !== null &&
        (value as { tag?: unknown }).tag === ENVELOPE_TAG &&
        typeof (value as { id?: unknown }).id === "string" &&
        typeof (value as { type?: unknown }).type === "string";
}

function isReply(value: unknown): value is MessageReply<unknown> {
    return typeof value === "object" && value !== null &&
        (value as { tag?: unknown }).tag === ENVELOPE_TAG &&
        typeof (value as { id?: unknown }).id === "string" &&
        typeof (value as { ok?: unknown }).ok === "boolean";
}

function nextId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/* ─────────────────── typed message catalogue ──────────────────────────── */

export interface MessageDef<TReq, TRes> {
    readonly type: string;
    readonly __req?: TReq; // phantom — never set
    readonly __res?: TRes; // phantom — never set
}

export function defineMessage<TReq, TRes>(type: string): MessageDef<TReq, TRes> {
    return { type };
}

/* ───────────────────────── background registry ─────────────────────────── */

type Handler<TReq, TRes> = (
    payload: TReq,
    sender: { tabId: number | null; frameId: number | null },
) => TRes | Promise<TRes>;

const handlers = new Map<string, Handler<unknown, unknown>>();

export const messageRegistry = {
    register<TReq, TRes>(def: MessageDef<TReq, TRes>, handler: Handler<TReq, TRes>): () => void {
        if (handlers.has(def.type)) {
            throw new AppError({
                code: "DUPLICATE_MESSAGE_HANDLER",
                reason: `Handler for ${def.type} already registered`,
            });
        }
        handlers.set(def.type, handler as Handler<unknown, unknown>);
        return () => handlers.delete(def.type);
    },

    /** Mount the chrome.runtime.onMessage listener. Call once in the SW. */
    mount(): void {
        chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
            if (!isEnvelope(raw)) return false;

            const handler = handlers.get(raw.type);
            if (!handler) {
                const err = new AppError({
                    code: "UNKNOWN_MESSAGE_TYPE",
                    reason: `No handler registered for ${raw.type}`,
                });
                logger.error("Unknown message type", err, { type: raw.type });
                sendResponse({ tag: ENVELOPE_TAG, id: raw.id, ok: false, error: err.toJSON() } satisfies MessageReply<never>);
                return false;
            }

            void Promise.resolve()
                .then(() => handler(raw.payload, {
                    tabId: sender.tab?.id ?? null,
                    frameId: sender.frameId ?? null,
                }))
                .then((result) => {
                    sendResponse({ tag: ENVELOPE_TAG, id: raw.id, ok: true, result } satisfies MessageReply<unknown>);
                })
                .catch((err: unknown) => {
                    const appErr = AppError.isAppError(err)
                        ? (err as AppError)
                        : new AppError({ code: "HANDLER_THREW", reason: String(err), cause: err });
                    logger.error(`Handler ${raw.type} failed`, appErr);
                    sendResponse({ tag: ENVELOPE_TAG, id: raw.id, ok: false, error: appErr.toJSON() } satisfies MessageReply<never>);
                });

            return true; // async response
        });
    },
};

/* ──────────────────── client (extension contexts) ──────────────────────── */

export const messageClient = {
    async send<TReq, TRes>(def: MessageDef<TReq, TRes>, payload: TReq): Promise<TRes> {
        const envelope: MessageEnvelope<TReq> = {
            tag: ENVELOPE_TAG,
            id: nextId(),
            type: def.type,
            payload,
        };
        const reply = (await chrome.runtime.sendMessage(envelope)) as MessageReply<TRes>;
        if (!isReply(reply)) {
            throw new AppError({
                code: "MALFORMED_REPLY",
                reason: `Reply for ${def.type} was not a valid envelope`,
                context: { type: def.type },
            });
        }
        if (!reply.ok) {
            throw reply.error ? AppError.fromJSON(reply.error) : new AppError({
                code: "UNKNOWN_REPLY_ERROR",
                reason: `Handler ${def.type} returned ok=false without an error body`,
            });
        }
        return reply.result as TRes;
    },
};

/* ──────────────────── page-bridge (MAIN world) ─────────────────────────── */

/**
 * In the MAIN world we cannot call `chrome.runtime.sendMessage`. We post to
 * `window` and the ISOLATED-world content script forwards to the background.
 * Use `pageBridge.send(...)` from inside the SDK.
 */
export const pageBridge = {
    async send<TReq, TRes>(def: MessageDef<TReq, TRes>, payload: TReq): Promise<TRes> {
        const envelope: MessageEnvelope<TReq> = {
            tag: ENVELOPE_TAG,
            id: nextId(),
            type: def.type,
            payload,
        };
        return await new Promise<TRes>((resolve, reject) => {
            const listener = (event: MessageEvent<unknown>) => {
                if (event.source !== window) return;
                const data = event.data;
                if (!isReply(data) || data.id !== envelope.id) return;
                window.removeEventListener("message", listener);
                if (data.ok) resolve(data.result as TRes);
                else reject(data.error ? AppError.fromJSON(data.error) : new AppError({
                    code: "PAGE_BRIDGE_NO_ERROR",
                    reason: `Reply ok=false without error body for ${def.type}`,
                }));
            };
            window.addEventListener("message", listener);
            window.postMessage(envelope, window.location.origin);
        });
    },
};

/**
 * Content-script side: forwards page→background and background→page.
 * Mount once at the top of `src/content/index.ts`.
 */
export function mountContentBridge(): void {
    // page → background
    window.addEventListener("message", (event) => {
        if (event.source !== window) return;
        const data = event.data;
        if (!isEnvelope(data)) return;
        chrome.runtime
            .sendMessage(data)
            .then((reply: unknown) => {
                if (isReply(reply)) window.postMessage(reply, window.location.origin);
            })
            .catch((err: unknown) => {
                const appErr = AppError.isAppError(err)
                    ? (err as AppError).toJSON()
                    : new AppError({ code: "CONTENT_FORWARD_FAILED", reason: String(err) }).toJSON();
                window.postMessage(
                    { tag: ENVELOPE_TAG, id: data.id, ok: false, error: appErr } satisfies MessageReply<never>,
                    window.location.origin,
                );
            });
    });
}
