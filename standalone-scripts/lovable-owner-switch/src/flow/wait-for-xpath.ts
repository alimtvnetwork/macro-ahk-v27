/**
 * Lovable login flow — wait-for-element helper.
 *
 * Polls `queryByXPath` every `PollIntervalMs` until the element is
 * present or `TimeoutMs` elapses. No `setTimeout` recursion; uses
 * `Promise<void>` + monotonic deadline (mem://constraints/no-retry-policy
 * is satisfied — this is bounded polling, not retry-on-failure).
 */

import { queryByXPath } from "./dom-xpath";

const DEFAULT_POLL_INTERVAL_MS = 200;
const DEFAULT_TIMEOUT_MS = 15000;

export interface WaitOptions {
    PollIntervalMs?: number;
    TimeoutMs?: number;
}

const sleepMs = (ms: number): Promise<void> => {
    return new Promise<void>((resolve) => globalThis.setTimeout(resolve, ms));
};

const resolveWaitConfig = (options: WaitOptions): { interval: number; timeout: number } => ({
    interval: options.PollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
    timeout: options.TimeoutMs ?? DEFAULT_TIMEOUT_MS,
});

export const waitForXPath = async (xpath: string, options: WaitOptions = {}): Promise<Element> => {
    const { interval, timeout } = resolveWaitConfig(options);
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
        const found = queryByXPath(xpath);

        if (found !== null) {
            return found;
        }

        await sleepMs(interval);
    }

    throw new Error(`Timeout waiting for XPath after ${timeout}ms: ${xpath}`);
};
