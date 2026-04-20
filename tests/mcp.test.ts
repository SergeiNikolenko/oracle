import { describe, it, expect } from "vitest";
import { ensureBrowserAvailable, mapConsultToRunOptions } from "../src/mcp/utils.js";

describe("mcp utils", () => {
  it("maps api defaults", () => {
    const { runOptions, resolvedEngine } = mapConsultToRunOptions({
      prompt: "hi",
      files: [],
      model: "gpt-5.2-pro",
      engine: "api",
    });
    expect(resolvedEngine).toBe("api");
    expect(runOptions.model).toBe("gpt-5.2-pro");
  });

  it("infers browser labels", () => {
    const { runOptions, resolvedEngine } = mapConsultToRunOptions({
      prompt: "hi",
      files: [],
      model: "5.1 instant",
      engine: "browser",
    });
    expect(resolvedEngine).toBe("browser");
    expect(runOptions.model).toBe("gpt-5.2");
  });

  it("treats configured chromePath as browser-available", () => {
    expect(
      ensureBrowserAvailable("browser", {
        browserConfig: { chromePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" },
      }),
    ).toBeNull();
  });

  it("treats configured remoteChrome as browser-available", () => {
    expect(
      ensureBrowserAvailable("browser", {
        browserConfig: { remoteChrome: { host: "127.0.0.1", port: 9334 } },
      }),
    ).toBeNull();
  });
});
