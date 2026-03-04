import type { MatrixClient } from "@vector-im/matrix-bot-sdk";
import type { PluginRuntime, RuntimeEnv, RuntimeLogger } from "openclaw/plugin-sdk";
import { describe, expect, it, vi } from "vitest";
import type { CoreConfig, MatrixRoomConfig } from "../../types.js";
import { createMatrixRoomMessageHandler } from "./handler.js";
import { EventType, type MatrixRawEvent } from "./types.js";

function createHarness(params?: { roomsConfig?: Record<string, MatrixRoomConfig> }) {
  const readAllowFromStore = vi.fn().mockResolvedValue([]);
  const getMemberDisplayName = vi.fn().mockResolvedValue("Attacker");

  const client = {
    getUserId: vi.fn().mockResolvedValue("@bot:example.org"),
  } as unknown as MatrixClient;

  const handler = createMatrixRoomMessageHandler({
    client,
    core: {
      channel: {
        pairing: {
          readAllowFromStore,
        },
      },
    } as unknown as PluginRuntime,
    cfg: {} as CoreConfig,
    runtime: {} as RuntimeEnv,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as RuntimeLogger,
    logVerboseMessage: vi.fn(),
    allowFrom: [],
    roomsConfig: params?.roomsConfig,
    mentionRegexes: [],
    groupPolicy: "allowlist",
    replyToMode: "off",
    threadReplies: "off",
    dmEnabled: true,
    dmPolicy: "open",
    textLimit: 4000,
    mediaMaxBytes: 20 * 1024 * 1024,
    startupMs: Date.now(),
    startupGraceMs: 120_000,
    directTracker: {
      isDirectMessage: vi.fn().mockResolvedValue(false),
    },
    getRoomInfo: vi.fn().mockResolvedValue({
      name: undefined,
      canonicalAlias: undefined,
      altAliases: [],
    }),
    getMemberDisplayName,
    accountId: "default",
  });

  const event = {
    event_id: "$evt-1",
    sender: "@attacker:example.org",
    type: EventType.RoomMessage,
    origin_server_ts: Date.now(),
    content: {
      msgtype: "m.text",
      body: "   ",
    },
  } as MatrixRawEvent;

  return {
    handler,
    event,
    readAllowFromStore,
    getMemberDisplayName,
  };
}

describe("createMatrixRoomMessageHandler room users allowlist", () => {
  it("fails closed when room users allowlist override is explicitly empty", async () => {
    const { handler, event, readAllowFromStore, getMemberDisplayName } = createHarness({
      roomsConfig: {
        "!room:example.org": {
          users: [],
        },
      },
    });

    await handler("!room:example.org", event);

    expect(getMemberDisplayName).not.toHaveBeenCalled();
    expect(readAllowFromStore).not.toHaveBeenCalled();
  });

  it("keeps processing when room users allowlist is unset", async () => {
    const { handler, event, readAllowFromStore, getMemberDisplayName } = createHarness({
      roomsConfig: {
        "!room:example.org": {},
      },
    });

    await handler("!room:example.org", event);

    expect(getMemberDisplayName).toHaveBeenCalledTimes(1);
    expect(readAllowFromStore).toHaveBeenCalledTimes(1);
  });
});
