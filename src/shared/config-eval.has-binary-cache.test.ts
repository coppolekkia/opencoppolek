import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasBinary, resetHasBinaryCacheForTest } from "./config-eval.js";

describe("hasBinary cache bounds", () => {
  const originalPath = process.env.PATH;

  beforeEach(() => {
    process.env.PATH = "/definitely-missing-path";
    resetHasBinaryCacheForTest();
  });

  afterEach(() => {
    process.env.PATH = originalPath;
    vi.restoreAllMocks();
    resetHasBinaryCacheForTest();
  });

  it("evicts oldest entries when the cache grows beyond the cap", () => {
    const accessSpy = vi.spyOn(fs, "accessSync").mockImplementation(() => {
      throw new Error("missing");
    });

    expect(hasBinary("bin-0")).toBe(false);
    expect(hasBinary("bin-0")).toBe(false);
    expect(accessSpy).toHaveBeenCalledTimes(1);

    for (let i = 1; i <= 300; i += 1) {
      expect(hasBinary(`bin-${i}`)).toBe(false);
    }

    const callsBeforeRecheck = accessSpy.mock.calls.length;
    expect(hasBinary("bin-0")).toBe(false);
    expect(accessSpy.mock.calls.length).toBeGreaterThan(callsBeforeRecheck);
  });

  it("refreshes recently used entries so hot binaries stay cached", () => {
    const accessSpy = vi.spyOn(fs, "accessSync").mockImplementation(() => {
      throw new Error("missing");
    });

    expect(hasBinary("hot")).toBe(false);
    for (let i = 0; i < 255; i += 1) {
      expect(hasBinary(`cold-${i}`)).toBe(false);
    }

    // Cache hit should mark this key as recent.
    expect(hasBinary("hot")).toBe(false);

    for (let i = 255; i <= 509; i += 1) {
      expect(hasBinary(`cold-${i}`)).toBe(false);
    }

    const callsBeforeHotRecheck = accessSpy.mock.calls.length;
    expect(hasBinary("hot")).toBe(false);
    expect(accessSpy).toHaveBeenCalledTimes(callsBeforeHotRecheck);
  });
});
