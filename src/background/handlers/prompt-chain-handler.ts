/**
 * Prompt Chain Handler — Spec 15 T-12
 *
 * CRUD for prompt chains + chain step execution.
 * Chains persisted in chrome.storage.sync.
 *
 * @see spec/05-chrome-extension/45-prompt-manager-crud.md — Prompt manager CRUD
 */

import type { MessageRequest } from "../../shared/messages";
import { getChatBoxXPath, applyTemplateVariables } from "./settings-handler";
import { logBgWarnError, logCaughtError, BgLogTag} from "../bg-logger";

const STORAGE_KEY = "marco_prompt_chains";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PromptChainStep {
    promptId: string;
    promptName: string;
    delayMs?: number;
}

interface PromptChain {
    id: string;
    name: string;
    description?: string;
    steps: PromptChainStep[];
    createdAt: string;
    updatedAt: string;
}

interface SaveChainMessage extends MessageRequest {
    chain: PromptChain;
}

interface DeleteChainMessage extends MessageRequest {
    chainId: string;
}

interface ExecuteChainStepMessage extends MessageRequest {
    promptText: string;
    stepIndex: number;
    totalSteps: number;
    timeoutSec: number;
}

/* ------------------------------------------------------------------ */
/*  Storage helpers                                                    */
/* ------------------------------------------------------------------ */

async function loadChains(): Promise<PromptChain[]> {
    try {
        const result = await chrome.storage.sync.get(STORAGE_KEY);
        return (result[STORAGE_KEY] as PromptChain[] | undefined) ?? [];
    } catch {
        return [];
    }
}

async function saveChains(chains: PromptChain[]): Promise<void> {
    await chrome.storage.sync.set({ [STORAGE_KEY]: chains });
}

/* ------------------------------------------------------------------ */
/*  Handlers                                                           */
/* ------------------------------------------------------------------ */

export async function handleGetPromptChains(): Promise<{ chains: PromptChain[] }> {
    return { chains: await loadChains() };
}

export async function handleSavePromptChain(msg: MessageRequest): Promise<{ isOk: true; chain: PromptChain }> {
    const { chain } = msg as SaveChainMessage;
    const chains = await loadChains();
    const idx = chains.findIndex((c) => c.id === chain.id);
    if (idx >= 0) {
        chains[idx] = chain;
    } else {
        chains.push(chain);
    }
    await saveChains(chains);
    return { isOk: true, chain };
}

export async function handleDeletePromptChain(msg: MessageRequest): Promise<{ isOk: true }> {
    const { chainId } = msg as DeleteChainMessage;
    const chains = await loadChains();
    await saveChains(chains.filter((c) => c.id !== chainId));
    return { isOk: true };
}

/**
 * Execute a single chain step.
 * Injects the prompt text into the active tab's editor by:
 *   1. Writing args to chrome.storage.session keyed by a correlation ID.
 *   2. Injecting the standalone prompt-injector bundle via
 *      chrome.scripting.executeScript({ files: [...] }).
 *   3. Awaiting a one-shot PROMPT_INJECT_RESULT message back from the bundle.
 *
 * The standalone bundle (src/content-scripts/prompt-injector.ts) drains the
 * session-storage queue, runs the injection, and posts back the result.
 *
 * @see spec/21-app/02-features/chrome-extension/91-content-script-injection-strategy-audit.md
 */
const PROMPT_ARGS_KEY = "marco_prompt_args";
const PROMPT_INJECT_RESULT = "PROMPT_INJECT_RESULT";
const PROMPT_INJECT_TIMEOUT_MS = 10_000;
const PROMPT_INJECTOR_FILE = "content-scripts/prompt-injector.js";

interface PromptInjectResultMessage {
    type: typeof PROMPT_INJECT_RESULT;
    correlationId: string;
    success: boolean;
    verified: boolean;
    submitted: boolean;
    method: string;
}

interface PendingPromptArgs {
    text: string;
    chatBoxXPath?: string;
    autoSubmit?: boolean;
    submitDelayMs?: number;
}

function generateCorrelationId(): string {
    // crypto.randomUUID is available in MV3 service workers.
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `marco-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function writePendingArgs(correlationId: string, args: PendingPromptArgs): Promise<void> {
    const stored = await chrome.storage.session.get(PROMPT_ARGS_KEY);
    const map = (stored[PROMPT_ARGS_KEY] as Record<string, PendingPromptArgs> | undefined) ?? {};
    map[correlationId] = args;
    await chrome.storage.session.set({ [PROMPT_ARGS_KEY]: map });
}

async function clearPendingArg(correlationId: string): Promise<void> {
    try {
        const stored = await chrome.storage.session.get(PROMPT_ARGS_KEY);
        const map = (stored[PROMPT_ARGS_KEY] as Record<string, PendingPromptArgs> | undefined) ?? {};
        if (!(correlationId in map)) return;
        delete map[correlationId];
        if (Object.keys(map).length === 0) {
            await chrome.storage.session.remove(PROMPT_ARGS_KEY);
        } else {
            await chrome.storage.session.set({ [PROMPT_ARGS_KEY]: map });
        }
    } catch {
        // Best-effort cleanup; ignore failures.
    }
}

function isPromptResultMessage(value: unknown, correlationId: string): value is PromptInjectResultMessage {
    if (!value || typeof value !== "object") return false;
    const msg = value as Record<string, unknown>;
    return msg.type === PROMPT_INJECT_RESULT && msg.correlationId === correlationId;
}

/**
 * Awaits a one-shot result message matching the given correlation ID.
 * Resolves with the message or rejects on timeout.
 */
function awaitInjectResult(correlationId: string): Promise<PromptInjectResultMessage> {
    return new Promise<PromptInjectResultMessage>((resolve, reject) => {
        const timeoutHandle = setTimeout(() => {
            chrome.runtime.onMessage.removeListener(listener);
            reject(new Error(`Timed out after ${PROMPT_INJECT_TIMEOUT_MS}ms waiting for prompt-injector result`));
        }, PROMPT_INJECT_TIMEOUT_MS);

        const listener = (message: unknown): void => {
            if (!isPromptResultMessage(message, correlationId)) return;
            clearTimeout(timeoutHandle);
            chrome.runtime.onMessage.removeListener(listener);
            resolve(message);
        };

        chrome.runtime.onMessage.addListener(listener);
    });
}

export async function handleExecuteChainStep(msg: MessageRequest): Promise<{ isOk: true }> {
    const step = msg as ExecuteChainStepMessage;

    // Apply template variable substitution (e.g. {{date}}, {{workspace}})
    const resolvedText = await applyTemplateVariables(step.promptText);

    console.log(`[Marco] Executing chain step ${step.stepIndex + 1}/${step.totalSteps}: ${resolvedText.length} chars`);

    // Find the active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.id) {
        throw new Error("No active tab found — open a target page first");
    }

    // Fetch the configured chatbox XPath
    const chatBoxXPath = await getChatBoxXPath();

    const correlationId = generateCorrelationId();
    const resultPromise = awaitInjectResult(correlationId);

    try {
        await writePendingArgs(correlationId, {
            text: resolvedText,
            chatBoxXPath,
        });

        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: [PROMPT_INJECTOR_FILE],
        });

        const result = await resultPromise;

        if (!result.success) {
            throw new Error("Could not find or inject into the editor — is the chat input visible?");
        }

        if (!result.verified) {
            logBgWarnError(BgLogTag.MARCO, `Step ${step.stepIndex + 1}: prompt may be truncated`);
        }

        console.log(`[Marco] Step ${step.stepIndex + 1}/${step.totalSteps} complete (method=${result.method})`);
    } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        logCaughtError(BgLogTag.MARCO, `Chain step ${step.stepIndex + 1} failed`, err);
        throw new Error(`Step ${step.stepIndex + 1} failed: ${reason}`);
    } finally {
        await clearPendingArg(correlationId);
    }

    return { isOk: true };
}
