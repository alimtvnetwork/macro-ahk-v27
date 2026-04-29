/**
 * Payment Banner Hider — In-page smoke test.
 *
 * Runs entirely in the page (no test runner). Injects a fake banner
 * element, swaps in a stub locator, drives PaymentBannerHider, and
 * asserts the state attribute transitions:
 *
 *   (none) → Fading → Hiding → Done
 *
 * Usage (DevTools console on any page):
 *   import("./smoke-test").then(m => m.runPaymentBannerHiderSmokeTest());
 *
 * Or paste the compiled bundle into the console and call
 *   window.runPaymentBannerHiderSmokeTest()
 *
 * Exits with a clear PASS / FAIL log line — no silent swallowing.
 */

import { BannerLocator } from "./banner-locator";
import { PaymentBannerHider } from "./index";
import {
    BannerState,
    REMOVE_DELAY_MS,
    STATE_ATTR,
} from "./types";

const TAG = "[PaymentBannerHider.smokeTest]";
const FADING_WAIT_MS = 50;
const DONE_WAIT_MS = REMOVE_DELAY_MS + 100;

class StubBannerLocator extends BannerLocator {
    public constructor(private readonly target: HTMLElement) {
        super();
    }

    public override locate(): HTMLElement | null {
        return this.target;
    }
}

interface AssertionFailure {
    readonly step: string;
    readonly expected: string;
    readonly actual: string | null;
}

function assertState(
    el: HTMLElement,
    step: string,
    expected: BannerState | null,
): AssertionFailure | null {
    const actual = el.getAttribute(STATE_ATTR);
    const expectedStr = expected === null ? "(none)" : expected;

    if (expected === null && actual === null) {
        return null;
    }

    if (actual === expected) {
        return null;
    }

    return { step, expected: expectedStr, actual };
}

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function buildFakeBanner(): HTMLElement {
    const el = document.createElement("div");
    el.id = "pbh-smoke-test-banner";
    el.textContent = "Payment issue detected.";
    document.body.appendChild(el);

    return el;
}

export async function runPaymentBannerHiderSmokeTest(): Promise<boolean> {
    const banner = buildFakeBanner();
    const failures: AssertionFailure[] = [];

    try {
        const before = assertState(banner, "before-check", null);
        if (before !== null) failures.push(before);

        const hider = new PaymentBannerHider(new StubBannerLocator(banner));
        hider.check();

        const fading = assertState(banner, "after-check", BannerState.Fading);
        if (fading !== null) failures.push(fading);

        await wait(FADING_WAIT_MS);
        const hiding = assertState(banner, "post-microtask", BannerState.Hiding);
        if (hiding !== null) failures.push(hiding);

        await wait(DONE_WAIT_MS);
        const done = assertState(banner, "post-delay", BannerState.Done);
        if (done !== null) failures.push(done);

        if (failures.length === 0) {
            console.log(`${TAG} PASS — fading → hiding → done verified`);

            return true;
        }

        console.error(`${TAG} FAIL`, failures);

        return false;
    } finally {
        banner.remove();
    }
}

declare global {
    interface Window {
        runPaymentBannerHiderSmokeTest?: typeof runPaymentBannerHiderSmokeTest;
    }
}

window.runPaymentBannerHiderSmokeTest = runPaymentBannerHiderSmokeTest;
