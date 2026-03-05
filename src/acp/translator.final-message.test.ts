import type { PromptRequest } from "@agentclientprotocol/sdk";
import { describe, expect, it, vi } from "vitest";
import type { EventFrame } from "../gateway/protocol/index.js";
import { createInMemorySessionStore } from "./session.js";
import { createAcpConnection, createAcpGateway } from "./translator.test-helpers.js";
import { AcpGatewayAgent } from "./translator.js";

function createChatEvent(payload: Record<string, unknown>): EventFrame {
  return {
    event: "chat",
    payload,
  } as unknown as EventFrame;
}

describe("acp translator final-message handling", () => {
  it("emits assistant text from final event when no delta arrived", async () => {
    const connection = createAcpConnection();
    const sessionUpdate = vi.mocked(connection.sessionUpdate);
    const sessionStore = createInMemorySessionStore();
    const gatewayRequest = vi.fn(async () => ({}));
    const agent = new AcpGatewayAgent(
      connection,
      createAcpGateway(gatewayRequest),
      {
        sessionStore,
      },
    );

    await agent.loadSession({
      sessionId: "session-1",
      cwd: "/tmp",
      mcpServers: [],
      _meta: {},
    });
    sessionUpdate.mockClear();

    const promptPromise = agent.prompt({
      sessionId: "session-1",
      prompt: [{ type: "text", text: "hello" }],
      _meta: {},
    } as unknown as PromptRequest);

    await agent.handleGatewayEvent(
      createChatEvent({
        sessionKey: "session-1",
        state: "final",
        message: {
          content: [{ type: "text", text: "Hello from final-only payload." }],
        },
        stopReason: "end_turn",
      }),
    );

    await expect(promptPromise).resolves.toEqual({ stopReason: "end_turn" });
    expect(sessionUpdate).toHaveBeenCalledWith({
      sessionId: "session-1",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Hello from final-only payload." },
      },
    });
  });

  it("does not duplicate text when delta already emitted full content", async () => {
    const connection = createAcpConnection();
    const sessionUpdate = vi.mocked(connection.sessionUpdate);
    const sessionStore = createInMemorySessionStore();
    const gatewayRequest = vi.fn(async () => ({}));
    const agent = new AcpGatewayAgent(
      connection,
      createAcpGateway(gatewayRequest),
      {
        sessionStore,
      },
    );

    await agent.loadSession({
      sessionId: "session-1",
      cwd: "/tmp",
      mcpServers: [],
      _meta: {},
    });
    sessionUpdate.mockClear();

    const promptPromise = agent.prompt({
      sessionId: "session-1",
      prompt: [{ type: "text", text: "hello" }],
      _meta: {},
    } as unknown as PromptRequest);

    await agent.handleGatewayEvent(
      createChatEvent({
        sessionKey: "session-1",
        state: "delta",
        message: {
          content: [{ type: "text", text: "Hello once." }],
        },
      }),
    );
    await agent.handleGatewayEvent(
      createChatEvent({
        sessionKey: "session-1",
        state: "final",
        message: {
          content: [{ type: "text", text: "Hello once." }],
        },
        stopReason: "end_turn",
      }),
    );

    await expect(promptPromise).resolves.toEqual({ stopReason: "end_turn" });
    const textChunkCalls = sessionUpdate.mock.calls.filter((call) => {
      const maybeUpdate = call[0];
      return (
        typeof maybeUpdate === "object" &&
        maybeUpdate !== null &&
        "update" in maybeUpdate &&
        (maybeUpdate as { update?: { sessionUpdate?: string } }).update?.sessionUpdate ===
          "agent_message_chunk"
      );
    });
    expect(textChunkCalls).toHaveLength(1);
  });
});
