import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as ssrf from "../../infra/net/ssrf.js";

const lookupMock = vi.fn();
const resolvePinnedHostname = ssrf.resolvePinnedHostname;

async function createWebFetchToolNoFirecrawl() {
  const { createWebFetchTool } = await import("./web-tools.js");
  return createWebFetchTool({
    config: {
      tools: { web: { fetch: { cacheTtlMinutes: 0, firecrawl: { enabled: false } } } },
    },
  });
}

describe("web_fetch network-level error enrichment", () => {
  const priorFetch = global.fetch;

  beforeEach(() => {
    vi.spyOn(ssrf, "resolvePinnedHostname").mockImplementation((hostname) =>
      resolvePinnedHostname(hostname, lookupMock),
    );
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  });

  afterEach(() => {
    global.fetch = priorFetch;
    lookupMock.mockClear();
    vi.restoreAllMocks();
  });

  it("includes the URL and cause in the error when fetch throws a network error", async () => {
    const cause = new Error("getaddrinfo ENOTFOUND wttr.in");
    const networkError = new TypeError("fetch failed");
    (networkError as unknown as { cause: Error }).cause = cause;

    global.fetch = vi.fn().mockRejectedValue(networkError);

    const tool = await createWebFetchToolNoFirecrawl();
    const url = "https://wttr.in/Kalispell,MT?format=3";

    await expect(tool?.execute?.("call", { url })).rejects.toThrow(
      /Web fetch failed for .+wttr\.in.+getaddrinfo ENOTFOUND/,
    );
  });

  it("falls back to the top-level error message when cause has no message", async () => {
    const networkError = new TypeError("fetch failed");
    global.fetch = vi.fn().mockRejectedValue(networkError);

    const tool = await createWebFetchToolNoFirecrawl();
    const url = "https://example.com/path";

    await expect(tool?.execute?.("call", { url })).rejects.toThrow(
      /Web fetch failed for .+example\.com/,
    );
  });
});
