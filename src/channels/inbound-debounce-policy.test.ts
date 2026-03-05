import { describe, expect, it, vi } from "vitest";
import { resolveInboundDebounceMs } from "../auto-reply/inbound-debounce.js";
import {
  createChannelInboundDebouncer,
  shouldDebounceTextInbound,
} from "./inbound-debounce-policy.js";

describe("shouldDebounceTextInbound", () => {
  it("rejects blank text, media, and control commands", () => {
    const cfg = {} as Parameters<typeof shouldDebounceTextInbound>[0]["cfg"];

    expect(shouldDebounceTextInbound({ text: "   ", cfg })).toBe(false);
    expect(shouldDebounceTextInbound({ text: "hello", cfg, hasMedia: true })).toBe(false);
    expect(shouldDebounceTextInbound({ text: "/status", cfg })).toBe(false);
  });

  it("accepts normal text when debounce is allowed", () => {
    const cfg = {} as Parameters<typeof shouldDebounceTextInbound>[0]["cfg"];
    expect(shouldDebounceTextInbound({ text: "hello there", cfg })).toBe(true);
    expect(shouldDebounceTextInbound({ text: "hello there", cfg, allowDebounce: false })).toBe(
      false,
    );
  });
});

describe("resolveInboundDebounceMs", () => {
  it("respects priority override > session exact > session prefix > channel > base", () => {
    const cfg = {
      messages: {
        inbound: {
          debounceMs: 100,
          byChannel: {
            discord: 80,
          },
          bySessionId: {
            "discord:default:ch-1": 60,
            "discord:default:ch-1:user-1": 40,
          },
        },
      },
    } as Parameters<typeof resolveInboundDebounceMs>[0]["cfg"];

    expect(
      resolveInboundDebounceMs({
        cfg,
        channel: "discord",
        sessionId: "discord:default:ch-1:user-1",
      }),
    ).toBe(40);

    expect(
      resolveInboundDebounceMs({
        cfg,
        channel: "discord",
        sessionId: "discord:default:ch-1:user-2",
      }),
    ).toBe(60);

    expect(
      resolveInboundDebounceMs({
        cfg,
        channel: "discord",
        sessionId: "discord:default:ch-9:user-1",
      }),
    ).toBe(80);

    expect(
      resolveInboundDebounceMs({
        cfg,
        channel: "slack",
        sessionId: "slack:default:c-1:u-1",
      }),
    ).toBe(100);

    expect(
      resolveInboundDebounceMs({
        cfg,
        channel: "discord",
        sessionId: "discord:default:ch-1:user-1",
        overrideMs: 20,
      }),
    ).toBe(20);
  });

  it("uses the longest matching session prefix", () => {
    const cfg = {
      messages: {
        inbound: {
          bySessionId: {
            "discord:default": 75,
            "discord:default:ch-1": 45,
            "discord:default:ch-1:user": 15,
          },
        },
      },
    } as Parameters<typeof resolveInboundDebounceMs>[0]["cfg"];

    expect(
      resolveInboundDebounceMs({
        cfg,
        channel: "discord",
        sessionId: "discord:default:ch-1:user-9",
      }),
    ).toBe(15);
  });

  it("preserves zero-valued session overrides", () => {
    const cfg = {
      messages: {
        inbound: {
          debounceMs: 50,
          byChannel: {
            discord: 30,
          },
          bySessionId: {
            "discord:default:ch-1:user-1": 0,
          },
        },
      },
    } as Parameters<typeof resolveInboundDebounceMs>[0]["cfg"];

    expect(
      resolveInboundDebounceMs({
        cfg,
        channel: "discord",
        sessionId: "discord:default:ch-1:user-1",
      }),
    ).toBe(0);
  });

  it("ignores empty bySessionId keys", () => {
    const cfg = {
      messages: {
        inbound: {
          debounceMs: 90,
          byChannel: {
            discord: 70,
          },
          bySessionId: {
            "": 5,
            "discord:default:ch-1": 30,
          },
        },
      },
    } as Parameters<typeof resolveInboundDebounceMs>[0]["cfg"];

    expect(
      resolveInboundDebounceMs({
        cfg,
        channel: "discord",
        sessionId: "discord:default:ch-9:user-1",
      }),
    ).toBe(70);
  });
});

describe("createChannelInboundDebouncer", () => {
  it("resolves per-channel debounce and forwards callbacks", async () => {
    vi.useFakeTimers();
    try {
      const flushed: string[][] = [];
      const cfg = {
        messages: {
          inbound: {
            debounceMs: 10,
            byChannel: {
              slack: 25,
            },
          },
        },
      } as Parameters<typeof createChannelInboundDebouncer<{ id: string }>>[0]["cfg"];

      const { debounceMs, debouncer } = createChannelInboundDebouncer<{ id: string }>({
        cfg,
        channel: "slack",
        buildKey: (item) => item.id,
        onFlush: async (items) => {
          flushed.push(items.map((entry) => entry.id));
        },
      });

      expect(debounceMs).toBe(25);

      await debouncer.enqueue({ id: "a" });
      await debouncer.enqueue({ id: "a" });
      await vi.advanceTimersByTimeAsync(30);

      expect(flushed).toEqual([["a", "a"]]);
    } finally {
      vi.useRealTimers();
    }
  });
});
