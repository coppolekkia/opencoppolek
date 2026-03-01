import { beforeEach, describe, expect, it } from "vitest";
import "./test-helpers/fast-core-tools.js";
import {
  getCallGatewayMock,
  getSessionsSpawnTool,
  resetSessionsSpawnConfigOverride,
  setSessionsSpawnConfigOverride,
} from "./openclaw-tools.subagents.sessions-spawn.test-harness.js";
import { resetSubagentRegistryForTests } from "./subagent-registry.js";

const callGatewayMock = getCallGatewayMock();

describe("openclaw-tools: subagents (sessions_spawn allowlist)", () => {
  function setAllowAgents(allowAgents: string[]) {
    setSessionsSpawnConfigOverride({
      session: {
        mainKey: "main",
        scope: "per-sender",
      },
      agents: {
        list: [
          {
            id: "main",
            subagents: {
              allowAgents,
            },
          },
        ],
      },
    });
  }

  function mockAcceptedSpawn(acceptedAt: number) {
    let childSessionKey: string | undefined;
    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string; params?: unknown };
      if (request.method === "agent") {
        const params = request.params as { sessionKey?: string } | undefined;
        childSessionKey = params?.sessionKey;
        return { runId: "run-1", status: "accepted", acceptedAt };
      }
      if (request.method === "agent.wait") {
        return { status: "timeout" };
      }
      return {};
    });
    return () => childSessionKey;
  }

  async function executeSpawn(callId: string, agentId: string) {
    const tool = await getSessionsSpawnTool({
      agentSessionKey: "main",
      agentChannel: "whatsapp",
    });
    return tool.execute(callId, { task: "do thing", agentId });
  }

  async function expectAllowedSpawn(params: {
    allowAgents: string[];
    agentId: string;
    callId: string;
    acceptedAt: number;
  }) {
    setAllowAgents(params.allowAgents);
    const getChildSessionKey = mockAcceptedSpawn(params.acceptedAt);

    const result = await executeSpawn(params.callId, params.agentId);

    expect(result.details).toMatchObject({
      status: "accepted",
      runId: "run-1",
    });
    expect(getChildSessionKey()?.startsWith(`agent:${params.agentId}:subagent:`)).toBe(true);
  }

  beforeEach(() => {
    resetSessionsSpawnConfigOverride();
    resetSubagentRegistryForTests();
    callGatewayMock.mockClear();
  });

  it("sessions_spawn only allows same-agent by default", async () => {
    const tool = await getSessionsSpawnTool({
      agentSessionKey: "main",
      agentChannel: "whatsapp",
    });

    const result = await tool.execute("call6", {
      task: "do thing",
      agentId: "beta",
    });
    expect(result.details).toMatchObject({
      status: "forbidden",
    });
    expect(callGatewayMock).not.toHaveBeenCalled();
  });

  it("sessions_spawn forbids cross-agent spawning when not allowed", async () => {
    setSessionsSpawnConfigOverride({
      session: {
        mainKey: "main",
        scope: "per-sender",
      },
      agents: {
        list: [
          {
            id: "main",
            subagents: {
              allowAgents: ["alpha"],
            },
          },
        ],
      },
    });

    const tool = await getSessionsSpawnTool({
      agentSessionKey: "main",
      agentChannel: "whatsapp",
    });

    const result = await tool.execute("call9", {
      task: "do thing",
      agentId: "beta",
    });
    expect(result.details).toMatchObject({
      status: "forbidden",
    });
    expect(callGatewayMock).not.toHaveBeenCalled();
  });

  it("sessions_spawn allows cross-agent spawning when configured", async () => {
    await expectAllowedSpawn({
      allowAgents: ["beta"],
      agentId: "beta",
      callId: "call7",
      acceptedAt: 5000,
    });
  });

  it("sessions_spawn allows any agent when allowlist is *", async () => {
    await expectAllowedSpawn({
      allowAgents: ["*"],
      agentId: "beta",
      callId: "call8",
      acceptedAt: 5100,
    });
  });

  it("sessions_spawn normalizes allowlisted agent ids", async () => {
    await expectAllowedSpawn({
      allowAgents: ["Research"],
      agentId: "research",
      callId: "call10",
      acceptedAt: 5200,
    });
  });

  describe("allowGeneric", () => {
    function setAllowGeneric(allowGeneric: boolean, allowAgents: string[] = ["lead"]) {
      setSessionsSpawnConfigOverride({
        session: {
          mainKey: "main",
          scope: "per-sender",
        },
        agents: {
          list: [
            {
              id: "main",
              subagents: {
                allowAgents,
                allowGeneric,
              },
            },
          ],
        },
      });
    }

    async function executeGenericSpawn(callId: string) {
      const tool = await getSessionsSpawnTool({
        agentSessionKey: "main",
        agentChannel: "whatsapp",
      });
      return tool.execute(callId, { task: "do thing" });
    }

    it("blocks generic spawn when allowGeneric is false", async () => {
      setAllowGeneric(false);

      const result = await executeGenericSpawn("call-generic-blocked");

      expect(result.details).toMatchObject({
        status: "forbidden",
      });
      expect(callGatewayMock).not.toHaveBeenCalled();
    });

    it("allows generic spawn when allowGeneric is true", async () => {
      setAllowGeneric(true);
      callGatewayMock.mockImplementation(async (opts: unknown) => {
        const request = opts as { method?: string; params?: unknown };
        if (request.method === "agent") {
          return { runId: "run-1", status: "accepted", acceptedAt: 6000 };
        }
        return {};
      });

      const result = await executeGenericSpawn("call-generic-allowed");

      expect(result.details).toMatchObject({
        status: "accepted",
      });
    });

    it("allows generic spawn by default (allowGeneric not set)", async () => {
      setAllowAgents(["lead"]);
      callGatewayMock.mockImplementation(async (opts: unknown) => {
        const request = opts as { method?: string; params?: unknown };
        if (request.method === "agent") {
          return { runId: "run-1", status: "accepted", acceptedAt: 6100 };
        }
        return {};
      });

      const result = await executeGenericSpawn("call-generic-default");

      expect(result.details).toMatchObject({
        status: "accepted",
      });
    });

    it("blocks generic spawn but still allows named agents from allowAgents", async () => {
      setAllowGeneric(false, ["lead"]);
      callGatewayMock.mockImplementation(async (opts: unknown) => {
        const request = opts as { method?: string; params?: unknown };
        if (request.method === "agent") {
          return { runId: "run-1", status: "accepted", acceptedAt: 6200 };
        }
        return {};
      });

      // Generic spawn → blocked
      const genericResult = await executeGenericSpawn("call-generic-blocked2");
      expect(genericResult.details).toMatchObject({ status: "forbidden" });

      callGatewayMock.mockClear();

      // Named spawn with allowed agentId → accepted
      const namedResult = await executeSpawn("call-named-allowed", "lead");
      expect(namedResult.details).toMatchObject({ status: "accepted" });
    });
  });
});
