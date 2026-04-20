import { describe, expect, test } from "vitest";
import {
  shouldFallbackFromRemoteChromeForTest,
  shouldPreserveBrowserOnErrorForTest,
} from "../../src/browser/index.js";
import { BrowserAutomationError } from "../../src/oracle/errors.js";

describe("shouldPreserveBrowserOnErrorForTest", () => {
  test("preserves the browser for headful cloudflare challenge errors", () => {
    const error = new BrowserAutomationError("Cloudflare challenge detected.", {
      stage: "cloudflare-challenge",
    });
    expect(shouldPreserveBrowserOnErrorForTest(error, false)).toBe(true);
  });

  test("does not preserve the browser for headless cloudflare challenge errors", () => {
    const error = new BrowserAutomationError("Cloudflare challenge detected.", {
      stage: "cloudflare-challenge",
    });
    expect(shouldPreserveBrowserOnErrorForTest(error, true)).toBe(false);
  });

  test("does not preserve the browser for unrelated browser errors", () => {
    const error = new BrowserAutomationError("other browser error", {
      stage: "execute-browser",
    });
    expect(shouldPreserveBrowserOnErrorForTest(error, false)).toBe(false);
  });
});

describe("shouldFallbackFromRemoteChromeForTest", () => {
  test("falls back for refused remote Chrome connections", () => {
    expect(shouldFallbackFromRemoteChromeForTest(new Error("connect ECONNREFUSED 127.0.0.1:9334"))).toBe(
      true,
    );
  });

  test("does not fall back for unrelated browser errors", () => {
    expect(shouldFallbackFromRemoteChromeForTest(new Error("model selection failed"))).toBe(false);
  });
});
