import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSlackMessageHandler } from "./message-handler.js";

const enqueueMock = vi.fn(async (_entry: unknown) => {});
const flushKeyMock = vi.fn(async (_key: string) => {});
const resolveThreadTsMock = vi.fn(async ({ message }: { message: Record<string, unknown> }) => ({
  ...message,
}));

vi.mock("../../auto-reply/inbound-debounce.js", () => ({
  resolveInboundDebounceMs: () => 10,
  createInboundDebouncer: () => ({
    enqueue: (entry: unknown) => enqueueMock(entry),
    flushKey: (key: string) => flushKeyMock(key),
  }),
}));

vi.mock("./thread-resolution.js", () => ({
  createSlackThreadTsResolver: () => ({
    resolve: (entry: { message: Record<string, unknown> }) => resolveThreadTsMock(entry),
  }),
}));

function createContext(overrides?: {
  markMessageSeen?: (channel: string | undefined, ts: string | undefined) => boolean;
}) {
  return {
    cfg: {},
    accountId: "default",
    app: {
      client: {},
    },
    runtime: {},
    markMessageSeen: (channel: string | undefined, ts: string | undefined) =>
      overrides?.markMessageSeen?.(channel, ts) ?? false,
  } as Parameters<typeof createSlackMessageHandler>[0]["ctx"];
}

function createHandlerWithTracker(overrides?: {
  markMessageSeen?: (channel: string | undefined, ts: string | undefined) => boolean;
}) {
  const trackEvent = vi.fn();
  const handler = createSlackMessageHandler({
    ctx: createContext(overrides),
    account: { accountId: "default" } as Parameters<typeof createSlackMessageHandler>[0]["account"],
    trackEvent,
  });
  return { handler, trackEvent };
}

describe("createSlackMessageHandler", () => {
  beforeEach(() => {
    enqueueMock.mockClear();
    flushKeyMock.mockClear();
    resolveThreadTsMock.mockClear();
  });

  it("does not track invalid non-message events from the message stream", async () => {
    const trackEvent = vi.fn();
    const handler = createSlackMessageHandler({
      ctx: createContext(),
      account: { accountId: "default" } as Parameters<
        typeof createSlackMessageHandler
      >[0]["account"],
      trackEvent,
    });

    await handler(
      {
        type: "reaction_added",
        channel: "D1",
        ts: "123.456",
      } as never,
      { source: "message" },
    );

    expect(trackEvent).not.toHaveBeenCalled();
    expect(resolveThreadTsMock).not.toHaveBeenCalled();
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("does not track duplicate messages that are already seen", async () => {
    const { handler, trackEvent } = createHandlerWithTracker({ markMessageSeen: () => true });

    await handler(
      {
        type: "message",
        channel: "D1",
        ts: "123.456",
        text: "hello",
      } as never,
      { source: "message" },
    );

    expect(trackEvent).not.toHaveBeenCalled();
    expect(resolveThreadTsMock).not.toHaveBeenCalled();
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("tracks accepted non-duplicate messages", async () => {
    const { handler, trackEvent } = createHandlerWithTracker();

    await handler(
      {
        type: "message",
        channel: "D1",
        ts: "123.456",
        text: "hello",
      } as never,
      { source: "message" },
    );

    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(resolveThreadTsMock).toHaveBeenCalledTimes(1);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });

  it("app_mention bypasses dedup cache so channel mentions are not silently dropped", async () => {
    // Simulate the race: `message` arrives first and poisons the dedup cache,
    // then `app_mention` arrives with wasMentioned=true. The app_mention must
    // NOT be dropped by markMessageSeen.
    const seen = new Set<string>();
    const { handler, trackEvent } = createHandlerWithTracker({
      markMessageSeen: (channel, ts) => {
        const key = `${channel}:${ts}`;
        if (seen.has(key)) {
          return true;
        }
        seen.add(key);
        return false;
      },
    });

    // First: message event arrives and is processed (sets dedup key)
    await handler(
      {
        type: "message",
        channel: "C999",
        ts: "1700000000.000100",
        text: "<@U_BOT> hello",
        user: "U111",
      } as never,
      { source: "message" },
    );

    // Second: app_mention for the same ts — must NOT be deduped
    await handler(
      {
        type: "app_mention",
        channel: "C999",
        ts: "1700000000.000100",
        text: "<@U_BOT> hello",
        user: "U111",
      } as never,
      { source: "app_mention", wasMentioned: true },
    );

    expect(trackEvent).toHaveBeenCalledTimes(2);
    expect(enqueueMock).toHaveBeenCalledTimes(2);
  });

  it("flushes pending top-level buffered keys before immediate non-debounce follow-ups", async () => {
    const handler = createSlackMessageHandler({
      ctx: createContext(),
      account: { accountId: "default" } as Parameters<
        typeof createSlackMessageHandler
      >[0]["account"],
    });

    await handler(
      {
        type: "message",
        channel: "C111",
        user: "U111",
        ts: "1709000000.000100",
        text: "first buffered text",
      } as never,
      { source: "message" },
    );
    await handler(
      {
        type: "message",
        subtype: "file_share",
        channel: "C111",
        user: "U111",
        ts: "1709000000.000200",
        text: "file follows",
        files: [{ id: "F1" }],
      } as never,
      { source: "message" },
    );

    expect(flushKeyMock).toHaveBeenCalledWith("slack:default:C111:1709000000.000100:U111");
  });
});
