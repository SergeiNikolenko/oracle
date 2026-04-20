import { beforeEach, describe, expect, test, vi } from "vitest";

const cdpNewMock = vi.fn();
const cdpCloseMock = vi.fn();
const cdpListMock = vi.fn();
const cdpMock = Object.assign(vi.fn(), {
  // biome-ignore lint/style/useNamingConvention: CDP API uses capitalized members.
  New: cdpNewMock,
  // biome-ignore lint/style/useNamingConvention: CDP API uses capitalized members.
  Close: cdpCloseMock,
  // biome-ignore lint/style/useNamingConvention: CDP API uses capitalized members.
  List: cdpListMock,
});

vi.mock("chrome-remote-interface", () => ({ default: cdpMock }));

vi.doMock("../../src/browser/profileState.js", async () => {
  const original = await vi.importActual<typeof import("../../src/browser/profileState.js")>(
    "../../src/browser/profileState.js",
  );
  return {
    ...original,
    cleanupStaleProfileState: vi.fn(async () => undefined),
  };
});

describe("registerTerminationHooks", () => {
  test("clears stale DevToolsActivePort hints when preserving userDataDir", async () => {
    const { registerTerminationHooks } = await import("../../src/browser/chromeLifecycle.js");
    const profileState = await import("../../src/browser/profileState.js");
    const cleanupMock = vi.mocked(profileState.cleanupStaleProfileState);

    const chrome = {
      kill: vi.fn().mockResolvedValue(undefined),
      pid: 1234,
      port: 9222,
    };
    const logger = vi.fn();
    const userDataDir = "/tmp/oracle-manual-login-profile";

    const removeHooks = registerTerminationHooks(
      chrome as unknown as import("chrome-launcher").LaunchedChrome,
      userDataDir,
      false,
      logger,
      {
        isInFlight: () => false,
        preserveUserDataDir: true,
      },
    );

    process.emit("SIGINT");
    await new Promise((resolve) => setTimeout(resolve, 10));

    removeHooks();

    expect(chrome.kill).toHaveBeenCalledTimes(1);
    expect(cleanupMock).toHaveBeenCalledWith(userDataDir, logger, { lockRemovalMode: "never" });
  });
});

describe("connectWithNewTab", () => {
  beforeEach(() => {
    cdpMock.mockReset();
    cdpNewMock.mockReset();
    cdpCloseMock.mockReset();
    cdpListMock.mockReset();
  });

  test("falls back to default target when new tab cannot be opened", async () => {
    cdpNewMock.mockRejectedValue(new Error("boom"));
    cdpMock.mockResolvedValue({});

    const { connectWithNewTab } = await import("../../src/browser/chromeLifecycle.js");
    const logger = vi.fn();

    const result = await connectWithNewTab(9222, logger);

    expect(result.targetId).toBeUndefined();
    expect(cdpNewMock).toHaveBeenCalledTimes(1);
    expect(cdpMock).toHaveBeenCalledWith({ port: 9222, host: "127.0.0.1" });
    expect(logger).toHaveBeenCalledWith(
      expect.stringContaining("Failed to open isolated browser tab"),
    );
  });

  test("closes unused tab when attach fails", async () => {
    cdpNewMock.mockResolvedValue({ id: "target-1" });
    cdpMock.mockRejectedValueOnce(new Error("attach fail")).mockResolvedValueOnce({});
    cdpCloseMock.mockResolvedValue(undefined);

    const { connectWithNewTab } = await import("../../src/browser/chromeLifecycle.js");
    const logger = vi.fn();

    const result = await connectWithNewTab(9222, logger);

    expect(result.targetId).toBeUndefined();
    expect(cdpNewMock).toHaveBeenCalledTimes(1);
    expect(cdpCloseMock).toHaveBeenCalledWith({ host: "127.0.0.1", port: 9222, id: "target-1" });
    expect(cdpMock).toHaveBeenCalledWith({ port: 9222, host: "127.0.0.1" });
    expect(logger).toHaveBeenCalledWith(
      expect.stringContaining("Failed to attach to isolated browser tab"),
    );
  });

  test("throws when strict mode disallows fallback", async () => {
    cdpNewMock.mockRejectedValue(new Error("boom"));

    const { connectWithNewTab } = await import("../../src/browser/chromeLifecycle.js");
    const logger = vi.fn();

    await expect(
      connectWithNewTab(9222, logger, undefined, undefined, { fallbackToDefault: false }),
    ).rejects.toThrow(/isolated browser tab/i);
    expect(cdpMock).not.toHaveBeenCalled();
  });

  test("returns isolated target when attach succeeds", async () => {
    cdpNewMock.mockResolvedValue({ id: "target-2" });
    cdpMock.mockResolvedValue({});

    const { connectWithNewTab } = await import("../../src/browser/chromeLifecycle.js");
    const logger = vi.fn();

    const result = await connectWithNewTab(9222, logger);

    expect(result.targetId).toBe("target-2");
    expect(cdpNewMock).toHaveBeenCalledTimes(1);
    expect(cdpMock).toHaveBeenCalledWith({ host: "127.0.0.1", port: 9222, target: "target-2" });
  });
});

describe("connectToExistingChatGPTTarget", () => {
  beforeEach(() => {
    cdpMock.mockReset();
    cdpNewMock.mockReset();
    cdpCloseMock.mockReset();
    cdpListMock.mockReset();
  });

  test("reuses the highest-priority logged-in ChatGPT tab", async () => {
    cdpListMock.mockResolvedValue([
      { id: "root-tab", type: "page", url: "https://chatgpt.com/" },
      { id: "chat-tab", type: "page", url: "https://chatgpt.com/c/abc" },
    ]);
    cdpMock
      .mockResolvedValueOnce({ close: vi.fn() })
      .mockResolvedValueOnce({ close: vi.fn() });

    const { connectToExistingChatGPTTarget } = await import(
      "../../src/browser/chromeLifecycle.js"
    );
    const logger = vi.fn();
    const validateClient = vi
      .fn()
      .mockResolvedValueOnce(true);

    const result = await connectToExistingChatGPTTarget(9222, logger, undefined, {
      validateClient,
    });

    expect(result?.targetId).toBe("chat-tab");
    expect(result?.targetUrl).toBe("https://chatgpt.com/c/abc");
    expect(cdpListMock).toHaveBeenCalledWith({ host: "127.0.0.1", port: 9222 });
    expect(cdpMock).toHaveBeenCalledWith({ host: "127.0.0.1", port: 9222, target: "chat-tab" });
    expect(validateClient).toHaveBeenCalledTimes(1);
  });

  test("skips rejected tabs and closes their clients", async () => {
    const rejectedClient = { close: vi.fn().mockResolvedValue(undefined) };
    const acceptedClient = { close: vi.fn().mockResolvedValue(undefined) };
    cdpListMock.mockResolvedValue([
      { id: "bad-tab", type: "page", url: "https://chatgpt.com/c/bad" },
      { id: "good-tab", type: "page", url: "https://chatgpt.com/c/good" },
    ]);
    cdpMock.mockResolvedValueOnce(rejectedClient).mockResolvedValueOnce(acceptedClient);

    const { connectToExistingChatGPTTarget } = await import(
      "../../src/browser/chromeLifecycle.js"
    );
    const logger = vi.fn();
    const validateClient = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    const result = await connectToExistingChatGPTTarget(9222, logger, undefined, {
      validateClient,
    });

    expect(result?.targetId).toBe("good-tab");
    expect(rejectedClient.close).toHaveBeenCalledTimes(1);
    expect(acceptedClient.close).not.toHaveBeenCalled();
    expect(validateClient).toHaveBeenCalledTimes(2);
  });
});
