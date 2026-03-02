import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let lifecycleHandler:
  | ((evt: {
      stream?: string;
      runId: string;
      data?: {
        phase?: string;
        startedAt?: number;
        endedAt?: number;
        aborted?: boolean;
        error?: string;
      };
    }) => void)
  | undefined;

vi.mock("../gateway/call.js", () => ({
  callGateway: vi.fn(async (request: unknown) => {
    const typed = request as { method?: string };
    if (typed.method === "agent.wait") {
      return { status: "pending" };
    }
    return {};
  }),
}));

vi.mock("../infra/agent-events.js", () => ({
  onAgentEvent: vi.fn((handler: typeof lifecycleHandler) => {
    lifecycleHandler = handler;
    return () => {
      lifecycleHandler = undefined;
    };
  }),
}));

vi.mock("../config/config.js", () => ({
  loadConfig: vi.fn(() => ({
    agents: { defaults: { subagents: { archiveAfterMinutes: 0 } } },
  })),
}));

vi.mock("../config/sessions.js", () => ({
  loadSessionStore: vi.fn(() => ({})),
  resolveAgentIdFromSessionKey: () => "main",
  resolveMainSessionKey: () => "agent:main:main",
  resolveStorePath: () => "/tmp/test-store",
  updateSessionStore: vi.fn(),
}));

const announceSpy = vi.fn(async (_params: unknown) => true);
vi.mock("./subagent-announce.js", () => ({
  runSubagentAnnounceFlow: announceSpy,
}));

vi.mock("./subagent-registry.store.js", () => ({
  loadSubagentRegistryFromDisk: vi.fn(() => new Map()),
  saveSubagentRegistryToDisk: vi.fn(() => {}),
}));

describe("subagent registry lifecycle error grace", () => {
  let mod: typeof import("./subagent-registry.js");

  async function flushUntil(
    predicate: () => boolean,
    attempts = 20,
    errorMessage = "condition not met within flush attempts",
  ) {
    for (let i = 0; i < attempts; i += 1) {
      if (predicate()) {
        return;
      }
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    }
    throw new Error(errorMessage);
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    lifecycleHandler = undefined;
    mod = await import("./subagent-registry.js");
  });

  afterEach(() => {
    mod.resetSubagentRegistryForTests({ persist: false });
    vi.useRealTimers();
  });

  function registerRun(runId: string) {
    mod.registerSubagentRun({
      runId,
      childSessionKey: `agent:main:subagent:${runId}`,
      requesterSessionKey: "agent:main:main",
      requesterDisplayKey: "main",
      task: "test task",
      cleanup: "keep",
    });
  }

  it("does not announce error immediately when retry begins", async () => {
    registerRun("run-retry");

    lifecycleHandler?.({
      stream: "lifecycle",
      runId: "run-retry",
      data: { phase: "error", error: "temporary", endedAt: 100 },
    });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(announceSpy).not.toHaveBeenCalled();

    lifecycleHandler?.({
      stream: "lifecycle",
      runId: "run-retry",
      data: { phase: "start", startedAt: 200 },
    });
    lifecycleHandler?.({
      stream: "lifecycle",
      runId: "run-retry",
      data: { phase: "end", endedAt: 30_000 },
    });

    await vi.advanceTimersByTimeAsync(0);
    await flushUntil(
      () => announceSpy.mock.calls.length === 1,
      30,
      "expected successful completion announce after retry end",
    );
    expect(announceSpy).toHaveBeenCalledTimes(1);
    expect(announceSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        childRunId: "run-retry",
        outcome: { status: "ok" },
        endedAt: 30_000,
      }),
    );
  });

  it("announces error when retry does not start before grace window", async () => {
    registerRun("run-error-final");

    lifecycleHandler?.({
      stream: "lifecycle",
      runId: "run-error-final",
      data: { phase: "error", error: "provider failed", endedAt: 500 },
    });

    await vi.advanceTimersByTimeAsync(14_000);
    expect(announceSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2_000);
    await flushUntil(
      () => announceSpy.mock.calls.length === 1,
      30,
      "expected lifecycle error announce after grace window",
    );
    expect(announceSpy).toHaveBeenCalledTimes(1);
    expect(announceSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        childRunId: "run-error-final",
        outcome: { status: "error", error: "provider failed" },
        endedAt: 500,
      }),
    );
  });
});
