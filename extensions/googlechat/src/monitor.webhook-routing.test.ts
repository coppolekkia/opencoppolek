import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";
import type { OpenClawConfig, PluginRuntime } from "openclaw/plugin-sdk";
import { describe, expect, it, vi } from "vitest";
import { createMockServerResponse } from "../../../src/test-utils/mock-http-response.js";
import type { ResolvedGoogleChatAccount } from "./accounts.js";
import { verifyGoogleChatRequest } from "./auth.js";
import { handleGoogleChatWebhookRequest, registerGoogleChatWebhookTarget } from "./monitor.js";

vi.mock("./auth.js", () => ({
  verifyGoogleChatRequest: vi.fn(),
}));

function createWebhookRequest(params: {
  authorization?: string;
  payload: unknown;
  path?: string;
}): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage & {
    destroyed?: boolean;
    destroy: (error?: Error) => IncomingMessage;
  };
  req.method = "POST";
  req.url = params.path ?? "/googlechat";
  req.headers = {
    authorization: params.authorization ?? "",
    "content-type": "application/json",
  };
  req.destroyed = false;
  req.destroy = () => {
    req.destroyed = true;
    return req;
  };

  void Promise.resolve().then(() => {
    req.emit("data", Buffer.from(JSON.stringify(params.payload), "utf-8"));
    if (!req.destroyed) {
      req.emit("end");
    }
  });

  return req;
}

const baseAccount = (accountId: string) =>
  ({
    accountId,
    enabled: true,
    credentialSource: "none",
    config: {},
  }) as ResolvedGoogleChatAccount;

function registerTwoTargets() {
  const sinkA = vi.fn();
  const sinkB = vi.fn();
  const core = {} as PluginRuntime;
  const config = {} as OpenClawConfig;

  const unregisterA = registerGoogleChatWebhookTarget({
    account: baseAccount("A"),
    config,
    runtime: {},
    core,
    path: "/googlechat",
    statusSink: sinkA,
    mediaMaxMb: 5,
  });
  const unregisterB = registerGoogleChatWebhookTarget({
    account: baseAccount("B"),
    config,
    runtime: {},
    core,
    path: "/googlechat",
    statusSink: sinkB,
    mediaMaxMb: 5,
  });

  return {
    sinkA,
    sinkB,
    unregister: () => {
      unregisterA();
      unregisterB();
    },
  };
}

function createGroupGateTestCore(resolveAgentRoute: ReturnType<typeof vi.fn>): PluginRuntime {
  return {
    logging: {
      shouldLogVerbose: () => false,
    },
    channel: {
      commands: {
        shouldComputeCommandAuthorized: () => false,
        resolveCommandAuthorizedFromAuthorizers: () => undefined,
        shouldHandleTextCommands: () => false,
        isControlCommandMessage: () => false,
      },
      pairing: {
        readAllowFromStore: async () => [],
      },
      text: {
        hasControlCommand: () => false,
      },
      routing: {
        resolveAgentRoute,
      },
    },
  } as unknown as PluginRuntime;
}

describe("Google Chat webhook routing", () => {
  it("rejects ambiguous routing when multiple targets on the same path verify successfully", async () => {
    vi.mocked(verifyGoogleChatRequest).mockResolvedValue({ ok: true });

    const { sinkA, sinkB, unregister } = registerTwoTargets();

    try {
      const res = createMockServerResponse();
      const handled = await handleGoogleChatWebhookRequest(
        createWebhookRequest({
          authorization: "Bearer test-token",
          payload: { type: "ADDED_TO_SPACE", space: { name: "spaces/AAA" } },
        }),
        res,
      );

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(401);
      expect(sinkA).not.toHaveBeenCalled();
      expect(sinkB).not.toHaveBeenCalled();
    } finally {
      unregister();
    }
  });

  it("routes to the single verified target when earlier targets fail verification", async () => {
    vi.mocked(verifyGoogleChatRequest)
      .mockResolvedValueOnce({ ok: false, reason: "invalid" })
      .mockResolvedValueOnce({ ok: true });

    const { sinkA, sinkB, unregister } = registerTwoTargets();

    try {
      const res = createMockServerResponse();
      const handled = await handleGoogleChatWebhookRequest(
        createWebhookRequest({
          authorization: "Bearer test-token",
          payload: { type: "ADDED_TO_SPACE", space: { name: "spaces/BBB" } },
        }),
        res,
      );

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(200);
      expect(sinkA).not.toHaveBeenCalled();
      expect(sinkB).toHaveBeenCalledTimes(1);
    } finally {
      unregister();
    }
  });

  it("drops group messages when space users allowlist is explicitly empty", async () => {
    vi.mocked(verifyGoogleChatRequest).mockResolvedValue({ ok: true });

    const resolveAgentRoute = vi.fn(() => ({
      agentId: "main",
      sessionKey: "googlechat:test",
      accountId: "default",
    }));
    const unregister = registerGoogleChatWebhookTarget({
      account: {
        ...baseAccount("A"),
        config: {
          groupPolicy: "allowlist",
          groups: {
            "spaces/AAA": {
              requireMention: false,
              users: [],
            },
          },
          typingIndicator: "none",
        },
      },
      config: {},
      runtime: { error: vi.fn() },
      core: createGroupGateTestCore(resolveAgentRoute),
      path: "/googlechat",
      mediaMaxMb: 5,
    });

    try {
      const res = createMockServerResponse();
      const handled = await handleGoogleChatWebhookRequest(
        createWebhookRequest({
          authorization: "Bearer test-token",
          payload: {
            type: "MESSAGE",
            space: {
              name: "spaces/AAA",
              type: "SPACE",
            },
            message: {
              text: "hello",
              sender: {
                name: "users/attacker",
                displayName: "Attacker",
              },
            },
          },
        }),
        res,
      );

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(200);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(resolveAgentRoute).not.toHaveBeenCalled();
    } finally {
      unregister();
    }
  });
});
