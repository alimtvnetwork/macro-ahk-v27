import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TAB_ID = 321;
const TAB_URL = "https://id-preview--584600b3-0bba-43a0-a09d-ab632bf4b5ac.lovable.app/";

type ChromeMock = {
  runtime: {
    id: string;
    sendMessage: ReturnType<typeof vi.fn>;
    getURL: ReturnType<typeof vi.fn>;
  };
  storage: {
    local: {
      get: ReturnType<typeof vi.fn>;
      set: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
    };
  };
  cookies: {
    get: ReturnType<typeof vi.fn>;
    getAll: ReturnType<typeof vi.fn>;
  };
  tabs: {
    get: ReturnType<typeof vi.fn>;
  };
  permissions: {
    contains: ReturnType<typeof vi.fn>;
  };
  scripting: {
    executeScript: ReturnType<typeof vi.fn>;
  };
};

let originalChrome: unknown;
let warnSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;

function buildChromeMock(executeScriptImpl?: ChromeMock["scripting"]["executeScript"]): ChromeMock {
  return {
    runtime: {
      id: "test-extension-id",
      sendMessage: vi.fn(async () => undefined),
      getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
    },
    storage: {
      local: {
        get: vi.fn(async () => ({})),
        set: vi.fn(async () => {}),
        remove: vi.fn(async () => {}),
      },
    },
    cookies: {
      get: vi.fn(async () => null),
      getAll: vi.fn(async () => []),
    },
    tabs: {
      get: vi.fn(async (tabId: number) => ({ id: tabId, url: TAB_URL })),
    },
    permissions: {
      contains: vi.fn(async () => true),
    },
    scripting: {
      executeScript:
        executeScriptImpl ??
        vi.fn(async () => [{ result: null }]),
    },
  };
}

async function loadSeederWithChrome(chromeMock: ChromeMock) {
  (globalThis as Record<string, unknown>).chrome = chromeMock;
  return import("../token-seeder");
}

beforeEach(() => {
  originalChrome = (globalThis as Record<string, unknown>).chrome;
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  (globalThis as Record<string, unknown>).chrome = originalChrome;
  warnSpy.mockRestore();
  logSpy.mockRestore();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("seedTokensIntoTab", () => {
  it("treats Chrome's respective-host permission error as inaccessible and stops retrying the same tab", async () => {
    const executeScript = vi.fn(async () => {
      throw new Error("Cannot access contents of the page. Extension manifest must request permission to access the respective host.");
    });
    const chromeMock = buildChromeMock(executeScript);
    const mod = await loadSeederWithChrome(chromeMock);

    await mod.seedTokensIntoTab(TAB_ID);
    await mod.seedTokensIntoTab(TAB_ID);

    expect(executeScript).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain("Skipping JWT seed for inaccessible tab");
  });

  it("retries again after the inaccessible cooldown expires", async () => {
    const accessDenied = new Error("Cannot access contents of the page. Extension manifest must request permission to access the respective host.");
    const executeScript = vi
      .fn()
      .mockRejectedValueOnce(accessDenied)
      .mockResolvedValueOnce([{ result: true }])
      .mockResolvedValueOnce([{ result: null }]);
    const chromeMock = buildChromeMock(executeScript);
    const mod = await loadSeederWithChrome(chromeMock);
    const nowSpy = vi.spyOn(Date, "now");

    nowSpy.mockReturnValue(1_000);
    await mod.seedTokensIntoTab(TAB_ID);
    expect(executeScript).toHaveBeenCalledTimes(1);

    nowSpy.mockReturnValue(5_000);
    await mod.seedTokensIntoTab(TAB_ID);
    expect(executeScript).toHaveBeenCalledTimes(1);

    nowSpy.mockReturnValue(20_001);
    await mod.seedTokensIntoTab(TAB_ID);

    expect(executeScript).toHaveBeenCalledTimes(3);
    nowSpy.mockRestore();
  });
});