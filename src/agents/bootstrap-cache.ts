import { loadWorkspaceBootstrapFiles, type WorkspaceBootstrapFile } from "./workspace.js";

const cache = new Map<string, WorkspaceBootstrapFile[]>();
export const MAX_BOOTSTRAP_CACHE_ENTRIES = 256;

function trimBootstrapCache(): void {
  while (cache.size > MAX_BOOTSTRAP_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (typeof oldestKey !== "string" || oldestKey.length === 0) {
      break;
    }
    cache.delete(oldestKey);
  }
}

export async function getOrLoadBootstrapFiles(params: {
  workspaceDir: string;
  sessionKey: string;
}): Promise<WorkspaceBootstrapFile[]> {
  const existing = cache.get(params.sessionKey);
  if (existing) {
    // Bump recency so frequently-used sessions are least likely to be evicted.
    cache.delete(params.sessionKey);
    cache.set(params.sessionKey, existing);
    return existing;
  }

  const files = await loadWorkspaceBootstrapFiles(params.workspaceDir);
  cache.set(params.sessionKey, files);
  trimBootstrapCache();
  return files;
}

export function clearBootstrapSnapshot(sessionKey: string): void {
  cache.delete(sessionKey);
}

export function clearAllBootstrapSnapshots(): void {
  cache.clear();
}
