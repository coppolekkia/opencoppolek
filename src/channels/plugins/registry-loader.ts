import type { PluginChannelRegistration, PluginRegistry } from "../../plugins/registry.js";
import { getActivePluginRegistry } from "../../plugins/runtime.js";
import type { ChannelId } from "./types.js";

type ChannelRegistryValueResolver<TValue> = (
  entry: PluginChannelRegistration,
) => TValue | undefined;

const CHANNEL_REGISTRY_CACHE_MAX = 128;
const CHANNEL_REGISTRY_MISS = Symbol("channel-registry-miss");

function setCacheValue<TValue>(
  cache: Map<ChannelId, TValue | typeof CHANNEL_REGISTRY_MISS>,
  id: ChannelId,
  value: TValue | typeof CHANNEL_REGISTRY_MISS,
): void {
  if (cache.has(id)) {
    cache.set(id, value);
    return;
  }
  if (cache.size >= CHANNEL_REGISTRY_CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      cache.delete(oldest);
    }
  }
  cache.set(id, value);
}

export function createChannelRegistryLoader<TValue>(
  resolveValue: ChannelRegistryValueResolver<TValue>,
): (id: ChannelId) => Promise<TValue | undefined> {
  const cache = new Map<ChannelId, TValue | typeof CHANNEL_REGISTRY_MISS>();
  let lastRegistry: PluginRegistry | null = null;

  return async (id: ChannelId): Promise<TValue | undefined> => {
    const registry = getActivePluginRegistry();
    if (registry !== lastRegistry) {
      cache.clear();
      lastRegistry = registry;
    }
    if (cache.has(id)) {
      const cached = cache.get(id);
      return cached === CHANNEL_REGISTRY_MISS ? undefined : cached;
    }

    const pluginEntry = registry?.channels.find((entry) => entry.plugin.id === id);
    const resolved = pluginEntry ? resolveValue(pluginEntry) : undefined;
    setCacheValue(cache, id, resolved === undefined ? CHANNEL_REGISTRY_MISS : resolved);
    return resolved;
  };
}

export function __getChannelRegistryCacheMaxForTest(): number {
  return CHANNEL_REGISTRY_CACHE_MAX;
}
