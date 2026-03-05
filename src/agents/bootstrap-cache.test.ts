import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_BOOTSTRAP_CACHE_ENTRIES,
  clearAllBootstrapSnapshots,
  clearBootstrapSnapshot,
  getOrLoadBootstrapFiles,
} from "./bootstrap-cache.js";
import type { WorkspaceBootstrapFile } from "./workspace.js";

vi.mock("./workspace.js", () => ({
  loadWorkspaceBootstrapFiles: vi.fn(),
}));

import { loadWorkspaceBootstrapFiles } from "./workspace.js";

const mockLoad = vi.mocked(loadWorkspaceBootstrapFiles);

function makeFile(name: string, content: string): WorkspaceBootstrapFile {
  return {
    name: name as WorkspaceBootstrapFile["name"],
    path: `/ws/${name}`,
    content,
    missing: false,
  };
}

describe("getOrLoadBootstrapFiles", () => {
  const files = [makeFile("AGENTS.md", "# Agent"), makeFile("SOUL.md", "# Soul")];

  beforeEach(() => {
    clearAllBootstrapSnapshots();
    mockLoad.mockResolvedValue(files);
  });

  afterEach(() => {
    clearAllBootstrapSnapshots();
    vi.clearAllMocks();
  });

  it("loads from disk on first call and caches", async () => {
    const result = await getOrLoadBootstrapFiles({
      workspaceDir: "/ws",
      sessionKey: "session-1",
    });

    expect(result).toBe(files);
    expect(mockLoad).toHaveBeenCalledTimes(1);
  });

  it("returns cached result on second call", async () => {
    await getOrLoadBootstrapFiles({ workspaceDir: "/ws", sessionKey: "session-1" });
    const result = await getOrLoadBootstrapFiles({ workspaceDir: "/ws", sessionKey: "session-1" });

    expect(result).toBe(files);
    expect(mockLoad).toHaveBeenCalledTimes(1);
  });

  it("different session keys get independent caches", async () => {
    const files2 = [makeFile("AGENTS.md", "# Agent v2")];
    mockLoad.mockResolvedValueOnce(files).mockResolvedValueOnce(files2);

    const r1 = await getOrLoadBootstrapFiles({ workspaceDir: "/ws", sessionKey: "session-1" });
    const r2 = await getOrLoadBootstrapFiles({ workspaceDir: "/ws", sessionKey: "session-2" });

    expect(r1).toBe(files);
    expect(r2).toBe(files2);
    expect(mockLoad).toHaveBeenCalledTimes(2);
  });

  it("evicts the least recently used session when cache exceeds max entries", async () => {
    mockLoad.mockImplementation(async (workspaceDir) => [makeFile("AGENTS.md", workspaceDir)]);

    for (let i = 0; i < MAX_BOOTSTRAP_CACHE_ENTRIES; i += 1) {
      await getOrLoadBootstrapFiles({
        workspaceDir: `/ws/${i}`,
        sessionKey: `session-${i}`,
      });
    }
    expect(mockLoad).toHaveBeenCalledTimes(MAX_BOOTSTRAP_CACHE_ENTRIES);

    // Touch session-0 so session-1 becomes the oldest entry.
    await getOrLoadBootstrapFiles({
      workspaceDir: "/ws/0",
      sessionKey: "session-0",
    });
    expect(mockLoad).toHaveBeenCalledTimes(MAX_BOOTSTRAP_CACHE_ENTRIES);

    await getOrLoadBootstrapFiles({
      workspaceDir: "/ws/overflow",
      sessionKey: "session-overflow",
    });
    expect(mockLoad).toHaveBeenCalledTimes(MAX_BOOTSTRAP_CACHE_ENTRIES + 1);

    // session-0 should stay cached after its LRU bump.
    await getOrLoadBootstrapFiles({
      workspaceDir: "/ws/0",
      sessionKey: "session-0",
    });
    expect(mockLoad).toHaveBeenCalledTimes(MAX_BOOTSTRAP_CACHE_ENTRIES + 1);

    // session-1 should have been evicted as the oldest untouched entry.
    await getOrLoadBootstrapFiles({
      workspaceDir: "/ws/1",
      sessionKey: "session-1",
    });
    expect(mockLoad).toHaveBeenCalledTimes(MAX_BOOTSTRAP_CACHE_ENTRIES + 2);
  });
});

describe("clearBootstrapSnapshot", () => {
  beforeEach(() => {
    clearAllBootstrapSnapshots();
    mockLoad.mockResolvedValue([makeFile("AGENTS.md", "content")]);
  });

  afterEach(() => {
    clearAllBootstrapSnapshots();
    vi.clearAllMocks();
  });

  it("clears a single session entry", async () => {
    await getOrLoadBootstrapFiles({ workspaceDir: "/ws", sessionKey: "sk" });
    clearBootstrapSnapshot("sk");

    // Next call should hit disk again.
    await getOrLoadBootstrapFiles({ workspaceDir: "/ws", sessionKey: "sk" });
    expect(mockLoad).toHaveBeenCalledTimes(2);
  });

  it("does not affect other sessions", async () => {
    await getOrLoadBootstrapFiles({ workspaceDir: "/ws", sessionKey: "sk1" });
    await getOrLoadBootstrapFiles({ workspaceDir: "/ws", sessionKey: "sk2" });

    clearBootstrapSnapshot("sk1");

    // sk2 should still be cached.
    await getOrLoadBootstrapFiles({ workspaceDir: "/ws", sessionKey: "sk2" });
    expect(mockLoad).toHaveBeenCalledTimes(2); // sk1 x1, sk2 x1
  });
});
