import { describe, expect, it, vi } from "vitest";
import type { SlackSendIdentity } from "../send.js";

const sendMock = vi.fn().mockResolvedValue({ ts: "1234.5678", channel: "C123" });

vi.mock("../send.js", () => ({
  sendMessageSlack: (...args: unknown[]) => sendMock(...args),
}));

const { deliverReplies } = await import("./replies.js");

const baseParams = {
  target: "C123",
  token: "xoxb-test",
  accountId: "acct-1",
  runtime: {
    log: vi.fn(),
    error: vi.fn(),
    exit: vi.fn(),
  } as unknown as import("../../runtime.js").RuntimeEnv,
  textLimit: 4000,
  replyToMode: "all" as const,
};

describe("deliverReplies", () => {
  it("passes identity to sendMessageSlack for text replies", async () => {
    sendMock.mockClear();
    const identity: SlackSendIdentity = { username: "Quill", iconUrl: "https://example.com/q.png" };
    await deliverReplies({
      ...baseParams,
      replies: [{ text: "hello" }],
      identity,
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const opts = sendMock.mock.calls[0][2];
    expect(opts.identity).toEqual(identity);
  });

  it("passes identity to sendMessageSlack for media replies", async () => {
    sendMock.mockClear();
    const identity: SlackSendIdentity = { username: "Forge", iconEmoji: ":hammer:" };
    await deliverReplies({
      ...baseParams,
      replies: [{ text: "check this", mediaUrl: "https://example.com/img.png" }],
      identity,
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const opts = sendMock.mock.calls[0][2];
    expect(opts.identity).toEqual(identity);
  });

  it("omits identity when not provided", async () => {
    sendMock.mockClear();
    await deliverReplies({
      ...baseParams,
      replies: [{ text: "no identity" }],
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const opts = sendMock.mock.calls[0][2];
    expect(opts.identity).toBeUndefined();
  });
});
