import type { OpenClawConfig } from "openclaw/plugin-sdk/matrix";
import { describe, expect, it, vi } from "vitest";
import { handleMatrixAction } from "./tool-actions.js";

const mocks = vi.hoisted(() => ({
  sendMatrixMessage: vi.fn().mockResolvedValue({ messageId: "evt-1", roomId: "!room:example" }),
}));

vi.mock("./matrix/actions.js", async () => {
  const actual = await vi.importActual<typeof import("./matrix/actions.js")>("./matrix/actions.js");
  return {
    ...actual,
    sendMatrixMessage: mocks.sendMatrixMessage,
  };
});

describe("handleMatrixAction", () => {
  it("forwards mediaLocalRoots on sendMessage actions", async () => {
    const cfg: OpenClawConfig = {
      channels: {
        matrix: {
          actions: { messages: true },
        },
      },
    };

    await handleMatrixAction(
      {
        action: "sendMessage",
        to: "room:!room:example",
        content: "caption",
        mediaUrl: "file:///tmp/file.png",
      },
      cfg,
      { mediaLocalRoots: ["/tmp/workspace"] },
    );

    expect(mocks.sendMatrixMessage).toHaveBeenCalledWith(
      "room:!room:example",
      "caption",
      expect.objectContaining({
        mediaUrl: "file:///tmp/file.png",
        mediaLocalRoots: ["/tmp/workspace"],
      }),
    );
  });
});
