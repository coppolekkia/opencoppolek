import { describe, expect, it } from "vitest";
import { resolveAuthProfileOrder } from "./order.js";
import type { AuthProfileStore } from "./types.js";

describe("resolveAuthProfileOrder", () => {
  it("includes api_key profiles with legacy apiKey field in auth order", () => {
    const store: AuthProfileStore = {
      version: 1,
      profiles: {
        "google:default": {
          type: "api_key",
          provider: "google",
          apiKey: "AIzaSy-test",
        },
      },
    };

    const order = resolveAuthProfileOrder({
      store,
      provider: "google",
    });

    expect(order).toEqual(["google:default"]);
  });

  it("accepts base-provider credentials for volcengine-plan auth lookup", () => {
    const store: AuthProfileStore = {
      version: 1,
      profiles: {
        "volcengine:default": {
          type: "api_key",
          provider: "volcengine",
          key: "sk-test",
        },
      },
    };

    const order = resolveAuthProfileOrder({
      store,
      provider: "volcengine-plan",
    });

    expect(order).toEqual(["volcengine:default"]);
  });
});
