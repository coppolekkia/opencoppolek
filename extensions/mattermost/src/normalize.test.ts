import { describe, expect, it } from "vitest";
import { normalizeMattermostMessagingTarget } from "./normalize.js";

describe("normalizeMattermostMessagingTarget", () => {
  it("keeps unprefixed opaque ids raw (ambiguous userId vs channelId)", () => {
    expect(normalizeMattermostMessagingTarget("64ifufpqojdh8ekpzh8ce6k97y")).toBe(
      "64ifufpqojdh8ekpzh8ce6k97y",
    );
  });

  it("preserves explicit prefixes", () => {
    expect(normalizeMattermostMessagingTarget("user:abc")).toBe("user:abc");
    expect(normalizeMattermostMessagingTarget("channel:abc")).toBe("channel:abc");
    expect(normalizeMattermostMessagingTarget("@alice")).toBe("@alice");
  });
});
