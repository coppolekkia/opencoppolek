import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../../../config/config.js";
import { buildCommandTestParams } from "../commands-spawn.test-harness.js";
import {
  isAcpCommandDiscordChannel,
  resolveAcpCommandBindingContext,
  resolveAcpCommandConversationId,
} from "./context.js";

const baseCfg = {
  session: { mainKey: "main", scope: "per-sender" },
} satisfies OpenClawConfig;

describe("commands-acp context", () => {
  it("resolves channel/account/thread context from originating fields", () => {
    const params = buildCommandTestParams("/acp sessions", baseCfg, {
      Provider: "discord",
      Surface: "discord",
      OriginatingChannel: "discord",
      OriginatingTo: "channel:parent-1",
      AccountId: "work",
      MessageThreadId: "thread-42",
    });

    expect(resolveAcpCommandBindingContext(params)).toEqual({
      channel: "discord",
      accountId: "work",
      threadId: "thread-42",
      conversationId: "thread-42",
      parentConversationId: "parent-1",
    });
    expect(isAcpCommandDiscordChannel(params)).toBe(true);
  });

  it("falls back to default account and target-derived conversation id", () => {
    const params = buildCommandTestParams("/acp status", baseCfg, {
      Provider: "slack",
      Surface: "slack",
      OriginatingChannel: "slack",
      To: "<#123456789>",
    });

    expect(resolveAcpCommandBindingContext(params)).toEqual({
      channel: "slack",
      accountId: "default",
      threadId: undefined,
      conversationId: "123456789",
      parentConversationId: "123456789",
    });
    expect(resolveAcpCommandConversationId(params)).toBe("123456789");
    expect(isAcpCommandDiscordChannel(params)).toBe(false);
  });

  it("resolves parentConversationId from OriginatingConversationId for Slack DMs", () => {
    const params = buildCommandTestParams("/acp spawn claude --thread here", baseCfg, {
      Provider: "slack",
      Surface: "slack",
      OriginatingChannel: "slack",
      OriginatingTo: "user:U12345",
      OriginatingConversationId: "D98765",
      AccountId: "test",
      MessageThreadId: "1709000000.000100",
    });

    const ctx = resolveAcpCommandBindingContext(params);
    expect(ctx.channel).toBe("slack");
    expect(ctx.threadId).toBe("1709000000.000100");
    expect(ctx.parentConversationId).toBe("D98765");
  });
});
