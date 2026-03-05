import { describe, expect, it } from "vitest";
import { __test, clearMediaUnderstandingBinaryCacheForTests } from "./runner.js";

describe("media-understanding runner cache bounds", () => {
  it("evicts oldest entry when bounded cache exceeds max", () => {
    const cache = new Map<string, number>();
    __test.setBoundedCache(cache, "a", 1, 2);
    __test.setBoundedCache(cache, "b", 2, 2);
    __test.setBoundedCache(cache, "c", 3, 2);

    expect(cache.size).toBe(2);
    expect(cache.has("a")).toBe(false);
    expect(cache.has("b")).toBe(true);
    expect(cache.has("c")).toBe(true);
  });

  it("refreshes recency when existing key is reinserted", () => {
    const cache = new Map<string, number>();
    __test.setBoundedCache(cache, "a", 1, 2);
    __test.setBoundedCache(cache, "b", 2, 2);
    __test.setBoundedCache(cache, "a", 1, 2);
    __test.setBoundedCache(cache, "c", 3, 2);

    expect(cache.size).toBe(2);
    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
    expect(cache.has("c")).toBe(true);
  });

  it("keeps runtime caches clearable for test isolation", () => {
    __test.binaryCache.set("/tmp/tool-a", Promise.resolve("/tmp/tool-a"));
    __test.geminiProbeCache.set("gemini", Promise.resolve(true));

    clearMediaUnderstandingBinaryCacheForTests();

    expect(__test.binaryCache.size).toBe(0);
    expect(__test.geminiProbeCache.size).toBe(0);
  });
});
