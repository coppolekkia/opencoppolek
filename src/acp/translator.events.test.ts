import type { AgentSideConnection, PromptRequest } from "@agentclientprotocol/sdk";
import { describe, expect, it, vi } from "vitest";
import type { GatewayClient } from "../gateway/client.js";
import type { EventFrame } from "../gateway/protocol/index.js";
import { createInMemorySessionStore } from "./session.js";
import { AcpGatewayAgent } from "./translator.js";

function chatEvent(payload: Record<string, unknown>): EventFrame {
  return {
    event: "chat",
    payload,
  } as unknown as EventFrame;
}

function createPromptRequest(sessionId: string, text: string): PromptRequest {
  return {
    sessionId,
    prompt: [{ type: "text", text }],
    _meta: {},
  } as unknown as PromptRequest;
}

function getAgentMessageChunks(sessionUpdate: ReturnType<typeof vi.fn>): string[] {
  const chunks: string[] = [];
  for (const [call] of sessionUpdate.mock.calls) {
    const params = call as { update?: { sessionUpdate?: string; content?: { text?: string } } };
    if (params.update?.sessionUpdate !== "agent_message_chunk") {
      continue;
    }
    const text = params.update.content?.text;
    if (typeof text === "string" && text.length > 0) {
      chunks.push(text);
    }
  }
  return chunks;
}

describe("acp translator chat event mapping", () => {
  it("emits assistant text from final-only chat payloads", async () => {
    const sessionUpdate = vi.fn(async () => {});
    const connection = { sessionUpdate } as unknown as AgentSideConnection;
    const request = vi.fn(async () => ({ ok: true })) as unknown as GatewayClient["request"];
    const gateway = { request } as GatewayClient;
    const sessionStore = createInMemorySessionStore();
    sessionStore.createSession({
      sessionId: "session-final-only",
      sessionKey: "agent:main:main",
      cwd: "/tmp",
    });
    const agent = new AcpGatewayAgent(connection, gateway, { sessionStore });

    const promptPromise = agent.prompt(createPromptRequest("session-final-only", "hello"));

    await agent.handleGatewayEvent(
      chatEvent({
        state: "final",
        sessionKey: "agent:main:main",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "hello from final" }],
        },
      }),
    );

    await expect(promptPromise).resolves.toEqual({ stopReason: "end_turn" });
    expect(getAgentMessageChunks(sessionUpdate)).toEqual(["hello from final"]);
  });

  it("emits only the missing tail when final payload extends prior delta text", async () => {
    const sessionUpdate = vi.fn(async () => {});
    const connection = { sessionUpdate } as unknown as AgentSideConnection;
    const request = vi.fn(async () => ({ ok: true })) as unknown as GatewayClient["request"];
    const gateway = { request } as GatewayClient;
    const sessionStore = createInMemorySessionStore();
    sessionStore.createSession({
      sessionId: "session-delta-final",
      sessionKey: "agent:main:main",
      cwd: "/tmp",
    });
    const agent = new AcpGatewayAgent(connection, gateway, { sessionStore });

    const promptPromise = agent.prompt(createPromptRequest("session-delta-final", "hello"));

    await agent.handleGatewayEvent(
      chatEvent({
        state: "delta",
        sessionKey: "agent:main:main",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "hel" }],
        },
      }),
    );
    await agent.handleGatewayEvent(
      chatEvent({
        state: "final",
        sessionKey: "agent:main:main",
        stopReason: "max_tokens",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "hello" }],
        },
      }),
    );

    await expect(promptPromise).resolves.toEqual({ stopReason: "max_tokens" });
    expect(getAgentMessageChunks(sessionUpdate)).toEqual(["hel", "lo"]);
  });
});
