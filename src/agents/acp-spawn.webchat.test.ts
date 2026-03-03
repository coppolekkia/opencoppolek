import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";

const hoisted = vi.hoisted(() => {
  const callGatewayMock = vi.fn();
  const closeSessionMock = vi.fn();
  const initializeSessionMock = vi.fn();
  const state = {
    cfg: {
      acp: {
        enabled: true,
        backend: "acpx",
        allowedAgents: ["codex"],
      },
      session: {
        mainKey: "main",
        scope: "per-sender",
      },
    } as OpenClawConfig,
  };
  return {
    callGatewayMock,
    closeSessionMock,
    initializeSessionMock,
    state,
  };
});

vi.mock("../config/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/config.js")>();
  return {
    ...actual,
    loadConfig: () => hoisted.state.cfg,
  };
});

vi.mock("../gateway/call.js", () => ({
  callGateway: (opts: unknown) => hoisted.callGatewayMock(opts),
}));

vi.mock("../acp/control-plane/manager.js", () => {
  return {
    getAcpSessionManager: () => ({
      initializeSession: (params: unknown) => hoisted.initializeSessionMock(params),
      closeSession: (params: unknown) => hoisted.closeSessionMock(params),
    }),
  };
});

const { spawnAcpDirect } = await import("./acp-spawn.js");
const { getSessionBindingService, __testing: bindingTesting } = await import(
  "../infra/outbound/session-binding-service.js"
);
const { __testing: webchatAdapterTesting } = await import(
  "../infra/outbound/webchat-session-binding-adapter.js"
);

describe("spawnAcpDirect (webchat thread mode)", () => {
  beforeEach(() => {
    bindingTesting.resetSessionBindingAdaptersForTests();
    webchatAdapterTesting.resetWebchatSessionBindingAdaptersForTests();
    hoisted.state.cfg = {
      acp: {
        enabled: true,
        backend: "acpx",
        allowedAgents: ["codex"],
      },
      session: {
        mainKey: "main",
        scope: "per-sender",
      },
    } satisfies OpenClawConfig;

    hoisted.callGatewayMock.mockReset().mockImplementation(async (argsUnknown: unknown) => {
      const args = argsUnknown as { method?: string };
      if (args.method === "sessions.patch") {
        return { ok: true };
      }
      if (args.method === "agent") {
        return { runId: "run-webchat-1" };
      }
      if (args.method === "sessions.delete") {
        return { ok: true };
      }
      return {};
    });

    hoisted.closeSessionMock.mockReset().mockResolvedValue({
      runtimeClosed: true,
      metaCleared: false,
    });
    hoisted.initializeSessionMock.mockReset().mockImplementation(async (argsUnknown: unknown) => {
      const args = argsUnknown as {
        sessionKey: string;
        agent: string;
        mode: "persistent" | "oneshot";
      };
      return {
        runtime: {
          close: vi.fn().mockResolvedValue(undefined),
        },
        handle: {
          sessionKey: args.sessionKey,
          backend: "acpx",
          runtimeSessionName: `${args.sessionKey}:runtime`,
          agentSessionId: "codex-inner-webchat",
          backendSessionId: "acpx-webchat",
        },
        meta: {
          backend: "acpx",
          agent: args.agent,
          runtimeSessionName: `${args.sessionKey}:runtime`,
          mode: args.mode,
          state: "idle",
          lastActivityAt: Date.now(),
        },
      };
    });
  });

  it("falls back to requester session key as webchat conversation id", async () => {
    const requesterSessionKey = "agent:main:main";
    const result = await spawnAcpDirect(
      {
        task: "check webchat adapter path",
        agentId: "codex",
        mode: "session",
        thread: true,
      },
      {
        agentSessionKey: requesterSessionKey,
        agentChannel: "webchat",
      },
    );

    expect(result.status).toBe("accepted");
    expect(result.mode).toBe("session");
    expect(result.childSessionKey).toMatch(/^agent:codex:acp:/);
    const childSessionKey = result.childSessionKey;
    expect(childSessionKey).toBeDefined();

    const agentCall = hoisted.callGatewayMock.mock.calls
      .map((entry: unknown[]) => entry[0] as { method?: string; params?: Record<string, unknown> })
      .find((entry) => entry.method === "agent");

    expect(agentCall?.params?.channel).toBe("webchat");
    expect(agentCall?.params?.to).toBe(`channel:${requesterSessionKey}`);
    expect(agentCall?.params?.threadId).toBe(requesterSessionKey);

    const binding = getSessionBindingService().resolveByConversation({
      channel: "webchat",
      accountId: "default",
      conversationId: requesterSessionKey,
    });
    expect(binding?.targetSessionKey).toBe(childSessionKey);
  });
});
