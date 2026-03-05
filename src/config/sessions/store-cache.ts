import type { SessionEntry } from "./types.js";

type SessionStoreCacheEntry = {
  store: Record<string, SessionEntry>;
  loadedAt: number;
  storePath: string;
  mtimeMs?: number;
  sizeBytes?: number;
  serialized?: string;
};

export const SESSION_STORE_CACHE_MAX_ENTRIES = 64;

const SESSION_STORE_CACHE = new Map<string, SessionStoreCacheEntry>();
const SESSION_STORE_SERIALIZED_CACHE = new Map<string, string>();

function setMostRecent<K, V>(map: Map<K, V>, key: K, value: V): void {
  map.delete(key);
  map.set(key, value);
}

function touchMostRecent<K, V>(map: Map<K, V>, key: K): V | undefined {
  const value = map.get(key);
  if (value === undefined) {
    return undefined;
  }
  map.delete(key);
  map.set(key, value);
  return value;
}

function trimSessionStoreCacheBounds(): void {
  while (SESSION_STORE_CACHE.size > SESSION_STORE_CACHE_MAX_ENTRIES) {
    const oldestKey = SESSION_STORE_CACHE.keys().next().value;
    if (oldestKey === undefined) {
      break;
    }
    SESSION_STORE_CACHE.delete(oldestKey);
    SESSION_STORE_SERIALIZED_CACHE.delete(oldestKey);
  }
}

function trimSessionStoreSerializedCacheBounds(): void {
  while (SESSION_STORE_SERIALIZED_CACHE.size > SESSION_STORE_CACHE_MAX_ENTRIES) {
    const oldestKey = SESSION_STORE_SERIALIZED_CACHE.keys().next().value;
    if (oldestKey === undefined) {
      break;
    }
    SESSION_STORE_SERIALIZED_CACHE.delete(oldestKey);
  }
}

export function clearSessionStoreCaches(): void {
  SESSION_STORE_CACHE.clear();
  SESSION_STORE_SERIALIZED_CACHE.clear();
}

export function invalidateSessionStoreCache(storePath: string): void {
  SESSION_STORE_CACHE.delete(storePath);
  SESSION_STORE_SERIALIZED_CACHE.delete(storePath);
}

export function getSerializedSessionStore(storePath: string): string | undefined {
  return touchMostRecent(SESSION_STORE_SERIALIZED_CACHE, storePath);
}

export function setSerializedSessionStore(storePath: string, serialized?: string): void {
  if (serialized === undefined) {
    SESSION_STORE_SERIALIZED_CACHE.delete(storePath);
    return;
  }
  setMostRecent(SESSION_STORE_SERIALIZED_CACHE, storePath, serialized);
  trimSessionStoreSerializedCacheBounds();
}

export function dropSessionStoreObjectCache(storePath: string): void {
  SESSION_STORE_CACHE.delete(storePath);
}

export function readSessionStoreCache(params: {
  storePath: string;
  ttlMs: number;
  mtimeMs?: number;
  sizeBytes?: number;
}): Record<string, SessionEntry> | null {
  const cached = SESSION_STORE_CACHE.get(params.storePath);
  if (!cached) {
    return null;
  }
  const now = Date.now();
  if (now - cached.loadedAt > params.ttlMs) {
    invalidateSessionStoreCache(params.storePath);
    return null;
  }
  if (params.mtimeMs !== cached.mtimeMs || params.sizeBytes !== cached.sizeBytes) {
    invalidateSessionStoreCache(params.storePath);
    return null;
  }
  touchMostRecent(SESSION_STORE_CACHE, params.storePath);
  return structuredClone(cached.store);
}

export function writeSessionStoreCache(params: {
  storePath: string;
  store: Record<string, SessionEntry>;
  mtimeMs?: number;
  sizeBytes?: number;
  serialized?: string;
}): void {
  setMostRecent(SESSION_STORE_CACHE, params.storePath, {
    store: structuredClone(params.store),
    loadedAt: Date.now(),
    storePath: params.storePath,
    mtimeMs: params.mtimeMs,
    sizeBytes: params.sizeBytes,
    serialized: params.serialized,
  });
  trimSessionStoreCacheBounds();
  if (params.serialized !== undefined) {
    setMostRecent(SESSION_STORE_SERIALIZED_CACHE, params.storePath, params.serialized);
    trimSessionStoreSerializedCacheBounds();
  }
}
