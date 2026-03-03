import { beforeEach, describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import { __testing as sessionBindingTesting, getSessionBindingService } from "../../infra/outbound/session-binding-service.js";
import {
  __testing as webchatBindingTesting,
  ensureWebchatSessionBindingAdapterRegistered,
} from "../../infra/outbound/webchat-session-binding-adapter.js";
import {
  createAgentToAgentPolicy,
  createSessionVisibilityGuard,
  resolveEffectiveSessionToolsVisibility,
  resolveSandboxSessionToolsVisibility,
  resolveSandboxedSessionToolContext,
  resolveSessionToolsVisibility,
} from "./sessions-access.js";

beforeEach(() => {
  sessionBindingTesting.resetSessionBindingAdaptersForTests();
  webchatBindingTesting.resetWebchatSessionBindingAdaptersForTests();
});

describe("resolveSessionToolsVisibility", () => {
  it("defaults to tree when unset or invalid", () => {
    expect(resolveSessionToolsVisibility({} as unknown as OpenClawConfig)).toBe("tree");
    expect(
      resolveSessionToolsVisibility({
        tools: { sessions: { visibility: "invalid" } },
      } as unknown as OpenClawConfig),
    ).toBe("tree");
  });

  it("accepts known visibility values case-insensitively", () => {
    expect(
      resolveSessionToolsVisibility({
        tools: { sessions: { visibility: "ALL" } },
      } as unknown as OpenClawConfig),
    ).toBe("all");
  });
});

describe("resolveEffectiveSessionToolsVisibility", () => {
  it("clamps to tree in sandbox when sandbox visibility is spawned", () => {
    const cfg = {
      tools: { sessions: { visibility: "all" } },
      agents: { defaults: { sandbox: { sessionToolsVisibility: "spawned" } } },
    } as unknown as OpenClawConfig;
    expect(resolveEffectiveSessionToolsVisibility({ cfg, sandboxed: true })).toBe("tree");
  });

  it("preserves visibility when sandbox clamp is all", () => {
    const cfg = {
      tools: { sessions: { visibility: "all" } },
      agents: { defaults: { sandbox: { sessionToolsVisibility: "all" } } },
    } as unknown as OpenClawConfig;
    expect(resolveEffectiveSessionToolsVisibility({ cfg, sandboxed: true })).toBe("all");
  });
});

describe("sandbox session-tools context", () => {
  it("defaults sandbox visibility clamp to spawned", () => {
    expect(resolveSandboxSessionToolsVisibility({} as unknown as OpenClawConfig)).toBe("spawned");
  });

  it("restricts non-subagent sandboxed sessions to spawned visibility", () => {
    const cfg = {
      tools: { sessions: { visibility: "all" } },
      agents: { defaults: { sandbox: { sessionToolsVisibility: "spawned" } } },
    } as unknown as OpenClawConfig;
    const context = resolveSandboxedSessionToolContext({
      cfg,
      agentSessionKey: "agent:main:main",
      sandboxed: true,
    });

    expect(context.restrictToSpawned).toBe(true);
    expect(context.requesterInternalKey).toBe("agent:main:main");
    expect(context.effectiveRequesterKey).toBe("agent:main:main");
  });

  it("does not restrict subagent sessions in sandboxed mode", () => {
    const cfg = {
      tools: { sessions: { visibility: "all" } },
      agents: { defaults: { sandbox: { sessionToolsVisibility: "spawned" } } },
    } as unknown as OpenClawConfig;
    const context = resolveSandboxedSessionToolContext({
      cfg,
      agentSessionKey: "agent:main:subagent:abc",
      sandboxed: true,
    });

    expect(context.restrictToSpawned).toBe(false);
    expect(context.requesterInternalKey).toBe("agent:main:subagent:abc");
  });
});

describe("createAgentToAgentPolicy", () => {
  it("denies cross-agent access when disabled", () => {
    const policy = createAgentToAgentPolicy({} as unknown as OpenClawConfig);
    expect(policy.enabled).toBe(false);
    expect(policy.isAllowed("main", "main")).toBe(true);
    expect(policy.isAllowed("main", "ops")).toBe(false);
  });

  it("honors allow patterns when enabled", () => {
    const policy = createAgentToAgentPolicy({
      tools: {
        agentToAgent: {
          enabled: true,
          allow: ["ops-*", "main"],
        },
      },
    } as unknown as OpenClawConfig);

    expect(policy.isAllowed("ops-a", "ops-b")).toBe(true);
    expect(policy.isAllowed("main", "ops-a")).toBe(true);
    expect(policy.isAllowed("guest", "ops-a")).toBe(false);
  });
});

describe("createSessionVisibilityGuard", () => {
  it("allows cross-agent sends to ACP sessions bound to the current webchat conversation", async () => {
    ensureWebchatSessionBindingAdapterRegistered("default");
    await getSessionBindingService().bind({
      targetSessionKey: "agent:codex:acp:test-1",
      targetKind: "session",
      conversation: {
        channel: "webchat",
        accountId: "default",
        conversationId: "agent:main:main",
      },
      placement: "child",
    });

    const guard = await createSessionVisibilityGuard({
      action: "send",
      requesterSessionKey: "agent:main:main",
      visibility: "self",
      a2aPolicy: createAgentToAgentPolicy({} as unknown as OpenClawConfig),
    });

    expect(guard.check("agent:codex:acp:test-1")).toEqual({ allowed: true });
  });

  it("treats main alias and canonical session key as equivalent for webchat ACP bindings", async () => {
    ensureWebchatSessionBindingAdapterRegistered("default");
    await getSessionBindingService().bind({
      targetSessionKey: "agent:codex:acp:test-1",
      targetKind: "session",
      conversation: {
        channel: "webchat",
        accountId: "default",
        conversationId: "agent:main:main",
      },
      placement: "child",
    });

    const guard = await createSessionVisibilityGuard({
      action: "send",
      requesterSessionKey: "main",
      visibility: "self",
      a2aPolicy: createAgentToAgentPolicy({} as unknown as OpenClawConfig),
    });

    expect(guard.check("agent:codex:acp:test-1")).toEqual({ allowed: true });
  });

  it("treats canonical requester key as equivalent when webchat binding stores main alias", async () => {
    ensureWebchatSessionBindingAdapterRegistered("default");
    await getSessionBindingService().bind({
      targetSessionKey: "agent:codex:acp:test-2",
      targetKind: "session",
      conversation: {
        channel: "webchat",
        accountId: "default",
        conversationId: "main",
      },
      placement: "child",
    });

    const guard = await createSessionVisibilityGuard({
      action: "send",
      requesterSessionKey: "agent:main:main",
      visibility: "self",
      a2aPolicy: createAgentToAgentPolicy({} as unknown as OpenClawConfig),
    });

    expect(guard.check("agent:codex:acp:test-2")).toEqual({ allowed: true });
  });

  it("treats custom main-key aliases as equivalent for webchat ACP bindings", async () => {
    ensureWebchatSessionBindingAdapterRegistered("default");
    await getSessionBindingService().bind({
      targetSessionKey: "agent:codex:acp:test-3",
      targetKind: "session",
      conversation: {
        channel: "webchat",
        accountId: "default",
        conversationId: "agent:main:inbox",
      },
      placement: "child",
    });

    const guard = await createSessionVisibilityGuard({
      action: "send",
      requesterSessionKey: "inbox",
      visibility: "self",
      a2aPolicy: createAgentToAgentPolicy({} as unknown as OpenClawConfig),
    });

    expect(guard.check("agent:codex:acp:test-3")).toEqual({ allowed: true });
  });

  it("allows ACP sends when binding metadata stores requester session identity", async () => {
    ensureWebchatSessionBindingAdapterRegistered("default");
    await getSessionBindingService().bind({
      targetSessionKey: "agent:codex:acp:test-4",
      targetKind: "session",
      conversation: {
        channel: "webchat",
        accountId: "default",
        conversationId: "channel:legacy-route",
      },
      placement: "child",
      metadata: {
        requesterSessionKey: "agent:main:main",
      },
    });

    const guard = await createSessionVisibilityGuard({
      action: "send",
      requesterSessionKey: "main",
      visibility: "self",
      a2aPolicy: createAgentToAgentPolicy({} as unknown as OpenClawConfig),
    });

    expect(guard.check("agent:codex:acp:test-4")).toEqual({ allowed: true });
  });

  it("blocks cross-agent send when agent-to-agent is disabled", async () => {
    const guard = await createSessionVisibilityGuard({
      action: "send",
      requesterSessionKey: "agent:main:main",
      visibility: "all",
      a2aPolicy: createAgentToAgentPolicy({} as unknown as OpenClawConfig),
    });

    expect(guard.check("agent:ops:main")).toEqual({
      allowed: false,
      status: "forbidden",
      error:
        "Agent-to-agent messaging is disabled. Set tools.agentToAgent.enabled=true to allow cross-agent sends.",
    });
  });

  it("enforces self visibility for same-agent sessions", async () => {
    const guard = await createSessionVisibilityGuard({
      action: "history",
      requesterSessionKey: "agent:main:main",
      visibility: "self",
      a2aPolicy: createAgentToAgentPolicy({} as unknown as OpenClawConfig),
    });

    expect(guard.check("agent:main:main")).toEqual({ allowed: true });
    expect(guard.check("agent:main:telegram:group:1")).toEqual({
      allowed: false,
      status: "forbidden",
      error:
        "Session history visibility is restricted to the current session (tools.sessions.visibility=self).",
    });
  });
});
