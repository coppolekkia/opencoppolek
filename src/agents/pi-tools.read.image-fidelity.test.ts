import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";
import { describe, expect, it, vi } from "vitest";

const { sanitizeToolResultImagesMock } = vi.hoisted(() => ({
  sanitizeToolResultImagesMock: vi.fn(async (result: AgentToolResult<unknown>) => result),
}));

vi.mock("./tool-images.js", () => ({
  sanitizeToolResultImages: sanitizeToolResultImagesMock,
}));

import { createOpenClawReadTool } from "./pi-tools.read.js";

const tinyPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2f7z8AAAAASUVORK5CYII=";

describe("createOpenClawReadTool image fidelity", () => {
  it("does not run image sanitization on read image results", async () => {
    const baseResult: AgentToolResult<unknown> = {
      content: [
        { type: "text", text: "Read image file [image/png]" },
        { type: "image", data: tinyPngBase64, mimeType: "image/png" },
      ],
      details: { path: "/tmp/sample.png" },
    };
    const baseRead = {
      name: "read",
      label: "read",
      description: "test read",
      parameters: Type.Object({
        path: Type.String(),
        limit: Type.Optional(Type.Number()),
        offset: Type.Optional(Type.Number()),
      }),
      execute: vi.fn(async () => baseResult),
    };

    const wrapped = createOpenClawReadTool(
      baseRead as unknown as Parameters<typeof createOpenClawReadTool>[0],
    );
    const result = await wrapped.execute("read-img-1", { path: "/tmp/sample.png", limit: 1 });

    const image = result.content.find((block) => block.type === "image") as
      | { data: string; mimeType: string }
      | undefined;
    expect(image).toBeDefined();
    expect(image?.data).toBe(tinyPngBase64);
    expect(image?.mimeType).toBe("image/png");
    expect(sanitizeToolResultImagesMock).not.toHaveBeenCalled();
  });
});
