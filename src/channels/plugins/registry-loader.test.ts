import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setActivePluginRegistry } from "../../plugins/runtime.js";
import { createMSTeamsTestPlugin, createTestRegistry } from "../../test-utils/channel-plugins.js";
import {
  __getChannelRegistryCacheMaxForTest,
  createChannelRegistryLoader,
} from "./registry-loader.js";
import type { ChannelId } from "./types.js";

describe("createChannelRegistryLoader", () => {
  const emptyRegistry = createTestRegistry([]);

  beforeEach(() => {
    setActivePluginRegistry(emptyRegistry);
  });

  afterEach(() => {
    setActivePluginRegistry(emptyRegistry);
  });

  it("caches missing and undefined-resolved entries", async () => {
    const registry = createTestRegistry([
      {
        pluginId: "msteams",
        plugin: createMSTeamsTestPlugin(),
        source: "test",
      },
    ]);
    setActivePluginRegistry(registry);

    const findSpy = vi.spyOn(registry.channels, "find");
    const loadOutbound = createChannelRegistryLoader((entry) => entry.plugin.outbound);

    await loadOutbound("unknown" as ChannelId);
    await loadOutbound("unknown" as ChannelId);
    await loadOutbound("msteams");
    await loadOutbound("msteams");

    expect(findSpy).toHaveBeenCalledTimes(2);
  });

  it("bounds miss-cache growth and evicts oldest ids", async () => {
    const registry = createTestRegistry([]);
    setActivePluginRegistry(registry);

    const findSpy = vi.spyOn(registry.channels, "find");
    const loadPlugin = createChannelRegistryLoader((entry) => entry.plugin);
    const max = __getChannelRegistryCacheMaxForTest();

    await loadPlugin("missing-0" as ChannelId);
    await loadPlugin("missing-0" as ChannelId);
    for (let i = 1; i <= max; i += 1) {
      await loadPlugin(`missing-${i}` as ChannelId);
    }
    await loadPlugin("missing-0" as ChannelId);

    expect(findSpy).toHaveBeenCalledTimes(max + 2);
  });
});
