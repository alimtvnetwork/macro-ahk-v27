/**
 * Unit tests for step-executors.ts — Spec 21
 *
 * Tests individual step executor functions with mocked DOM and window APIs.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  executeClickButton,
  executeWait,
  executeNotify,
  executeSetKv,
} from "../step-executors";

describe("executeClickButton", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("clicks an existing element", async () => {
    const btn = document.createElement("button");
    btn.id = "test-btn";
    const clickSpy = vi.fn();
    btn.addEventListener("click", clickSpy);
    document.body.appendChild(btn);

    await executeClickButton({ type: "click_button", selector: "#test-btn" });
    expect(clickSpy).toHaveBeenCalledOnce();
  });

  it("throws if element not found", async () => {
    await expect(
      executeClickButton({ type: "click_button", selector: "#nonexistent" })
    ).rejects.toThrow("Element not found");
  });

  it("throws if button is disabled", async () => {
    const btn = document.createElement("button");
    btn.id = "disabled-btn";
    btn.disabled = true;
    document.body.appendChild(btn);

    await expect(
      executeClickButton({ type: "click_button", selector: "#disabled-btn" })
    ).rejects.toThrow("Button is disabled");
  });
});

describe("executeWait", () => {
  it("resolves after the specified duration", async () => {
    vi.useFakeTimers();
    const promise = executeWait({ type: "wait", durationMs: 500 });
    vi.advanceTimersByTime(500);
    await expect(promise).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  it("rejects when aborted", async () => {
    const controller = new AbortController();
    const promise = executeWait({ type: "wait", durationMs: 10000 }, controller.signal);
    controller.abort();
    await expect(promise).rejects.toThrow("Wait cancelled");
  });
});

describe("executeNotify", () => {
  it("dispatches a custom event with message and level", async () => {
    const handler = vi.fn();
    window.addEventListener("automation-notify", handler);

    await executeNotify({ type: "notify", message: "Hello", level: "success" });

    expect(handler).toHaveBeenCalledOnce();
    const detail = (handler.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.message).toBe("Hello");
    expect(detail.level).toBe("success");

    window.removeEventListener("automation-notify", handler);
  });

  it("defaults level to info", async () => {
    const handler = vi.fn();
    window.addEventListener("automation-notify", handler);

    await executeNotify({ type: "notify", message: "Test" });

    const detail = (handler.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.level).toBe("info");

    window.removeEventListener("automation-notify", handler);
  });
});

describe("executeSetKv", () => {
  it("posts a KV_SET message to window", async () => {
    const spy = vi.spyOn(window, "postMessage");

    await executeSetKv({ type: "set_kv", key: "myKey", value: "myVal" });

    expect(spy).toHaveBeenCalledWith(
      { type: "KV_SET", key: "myKey", value: "myVal" },
      "*"
    );

    spy.mockRestore();
  });
});
