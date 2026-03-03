import { beforeEach, describe, expect, it } from "vitest";
import { getSessionBindingService, __testing as bindingTesting } from "./session-binding-service.js";
import {
  ensureWebchatSessionBindingAdapterRegistered,
  __testing as webchatAdapterTesting,
} from "./webchat-session-binding-adapter.js";

describe("webchat session binding adapter", () => {
  beforeEach(() => {
    bindingTesting.resetSessionBindingAdaptersForTests();
    webchatAdapterTesting.resetWebchatSessionBindingAdaptersForTests();
  });

  it("registers webchat thread-binding capabilities on demand", () => {
    const service = getSessionBindingService();
    expect(
      service.getCapabilities({
        channel: "webchat",
        accountId: "default",
      }),
    ).toMatchObject({
      adapterAvailable: false,
      bindSupported: false,
      unbindSupported: false,
      placements: [],
    });

    ensureWebchatSessionBindingAdapterRegistered("default");

    expect(
      service.getCapabilities({
        channel: "webchat",
        accountId: "default",
      }),
    ).toMatchObject({
      adapterAvailable: true,
      bindSupported: true,
      unbindSupported: true,
      placements: ["current", "child"],
    });
  });

  it("binds, resolves, and unbinds webchat conversations", async () => {
    ensureWebchatSessionBindingAdapterRegistered("default");
    const service = getSessionBindingService();

    const bound = await service.bind({
      targetSessionKey: "agent:codex:acp:webchat-session",
      targetKind: "session",
      conversation: {
        channel: "webchat",
        accountId: "default",
        conversationId: "agent:main:main",
      },
      placement: "child",
      metadata: {
        boundBy: "system",
      },
    });

    expect(bound.conversation.channel).toBe("webchat");
    expect(bound.conversation.accountId).toBe("default");
    expect(bound.conversation.conversationId).toBe("agent:main:main");

    const resolved = service.resolveByConversation({
      channel: "webchat",
      accountId: "default",
      conversationId: "agent:main:main",
    });
    expect(resolved?.targetSessionKey).toBe("agent:codex:acp:webchat-session");

    const bySession = service.listBySession("agent:codex:acp:webchat-session");
    expect(bySession).toHaveLength(1);

    const removed = await service.unbind({
      targetSessionKey: "agent:codex:acp:webchat-session",
      reason: "test-cleanup",
    });
    expect(removed).toHaveLength(1);
    expect(
      service.resolveByConversation({
        channel: "webchat",
        accountId: "default",
        conversationId: "agent:main:main",
      }),
    ).toBeNull();
  });
});
