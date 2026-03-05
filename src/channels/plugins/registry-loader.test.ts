import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setActivePluginRegistry } from "../../plugins/runtime.js";
import {
  createChannelTestPluginBase,
  createTestRegistry,
} from "../../test-utils/channel-plugins.js";
import { createChannelRegistryLoader } from "./registry-loader.js";
import type { ChannelPlugin } from "./types.js";

const emptyRegistry = createTestRegistry([]);

const createPlugin = (id: ChannelPlugin["id"]): ChannelPlugin => ({
  ...createChannelTestPluginBase({ id, label: String(id) }),
});

describe("createChannelRegistryLoader", () => {
  beforeEach(() => {
    setActivePluginRegistry(emptyRegistry);
  });

  afterEach(() => {
    setActivePluginRegistry(emptyRegistry);
  });

  it("caches undefined resolved values to avoid repeated resolver work", async () => {
    const registry = createTestRegistry([
      {
        pluginId: "msteams",
        plugin: createPlugin("msteams"),
        source: "test",
      },
    ]);
    setActivePluginRegistry(registry);

    const resolveValue = vi.fn(() => undefined as string | undefined);
    const load = createChannelRegistryLoader(resolveValue);

    await expect(load("msteams")).resolves.toBeUndefined();
    await expect(load("msteams")).resolves.toBeUndefined();

    expect(resolveValue).toHaveBeenCalledTimes(1);
  });

  it("caches falsey resolved values", async () => {
    const registry = createTestRegistry([
      {
        pluginId: "msteams",
        plugin: createPlugin("msteams"),
        source: "test",
      },
    ]);
    setActivePluginRegistry(registry);

    const resolveValue = vi.fn(() => "");
    const load = createChannelRegistryLoader(resolveValue);

    await expect(load("msteams")).resolves.toBe("");
    await expect(load("msteams")).resolves.toBe("");

    expect(resolveValue).toHaveBeenCalledTimes(1);
  });

  it("caches missing channel ids to avoid repeated registry scans", async () => {
    const registry = createTestRegistry([
      {
        pluginId: "msteams",
        plugin: createPlugin("msteams"),
        source: "test",
      },
    ]);
    setActivePluginRegistry(registry);

    const findSpy = vi.spyOn(registry.channels, "find");
    const resolveValue = vi.fn(() => "ok");
    const load = createChannelRegistryLoader(resolveValue);

    await expect(load("slack")).resolves.toBeUndefined();
    await expect(load("slack")).resolves.toBeUndefined();

    expect(findSpy).toHaveBeenCalledTimes(1);
    expect(resolveValue).not.toHaveBeenCalled();
  });
});
