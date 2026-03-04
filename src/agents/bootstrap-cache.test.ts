import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
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

describe("TTL expiration", () => {
  beforeEach(() => {
    clearAllBootstrapSnapshots();
    vi.useFakeTimers();
  });

  afterEach(() => {
    clearAllBootstrapSnapshots();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("reloads from disk after TTL expires", async () => {
    const stale = [makeFile("HEARTBEAT.md", "old content")];
    const fresh = [makeFile("HEARTBEAT.md", "new content")];
    mockLoad.mockResolvedValueOnce(stale).mockResolvedValueOnce(fresh);

    const r1 = await getOrLoadBootstrapFiles({
      workspaceDir: "/ws",
      sessionKey: "agent:main:main",
    });
    expect(r1).toBe(stale);
    expect(mockLoad).toHaveBeenCalledTimes(1);

    // Advance past the 5-minute TTL
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);

    const r2 = await getOrLoadBootstrapFiles({
      workspaceDir: "/ws",
      sessionKey: "agent:main:main",
    });
    expect(r2).toBe(fresh);
    expect(mockLoad).toHaveBeenCalledTimes(2);
  });

  it("returns cached result before TTL expires", async () => {
    const files = [makeFile("HEARTBEAT.md", "content")];
    mockLoad.mockResolvedValue(files);

    await getOrLoadBootstrapFiles({ workspaceDir: "/ws", sessionKey: "agent:main:main" });

    // Advance to just under the TTL
    vi.advanceTimersByTime(5 * 60 * 1000 - 1);

    await getOrLoadBootstrapFiles({ workspaceDir: "/ws", sessionKey: "agent:main:main" });
    expect(mockLoad).toHaveBeenCalledTimes(1);
  });
});
