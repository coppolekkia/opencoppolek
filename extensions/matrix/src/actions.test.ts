import type { OpenClawConfig } from "openclaw/plugin-sdk/matrix";
import { describe, expect, it, vi } from "vitest";
import { matrixMessageActions } from "./actions.js";

const mocks = vi.hoisted(() => ({
  handleMatrixAction: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("./tool-actions.js", () => ({
  handleMatrixAction: mocks.handleMatrixAction,
}));

vi.mock("./matrix/accounts.js", () => ({
  resolveMatrixAccount: vi.fn().mockReturnValue({ enabled: true, configured: true }),
}));

describe("matrixMessageActions", () => {
  it("forwards mediaLocalRoots to handleMatrixAction for send", async () => {
    const cfg: OpenClawConfig = {
      channels: {
        matrix: {
          homeserver: "https://matrix.example",
          accessToken: "token",
          userId: "@bot:example",
        },
      },
    };

    await matrixMessageActions.handleAction?.({
      channel: "matrix",
      action: "send",
      cfg,
      params: {
        to: "room:!room:example",
        message: "hello",
        media: "file:///tmp/file.png",
      },
      mediaLocalRoots: ["/tmp/workspace"],
    });

    expect(mocks.handleMatrixAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "sendMessage",
        mediaUrl: "file:///tmp/file.png",
      }),
      cfg,
      { mediaLocalRoots: ["/tmp/workspace"] },
    );
  });
});
