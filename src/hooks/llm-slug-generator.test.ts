import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";

const runEmbeddedPiAgentMock = vi.fn();

vi.mock("../agents/pi-embedded.js", () => ({
  runEmbeddedPiAgent: (params: unknown) => runEmbeddedPiAgentMock(params),
}));

vi.mock("../agents/agent-scope.js", async () => {
  const actual = await vi.importActual<typeof import("../agents/agent-scope.js")>(
    "../agents/agent-scope.js",
  );
  return {
    ...actual,
    resolveDefaultAgentId: () => "main",
    resolveAgentWorkspaceDir: () => "/tmp",
    resolveAgentDir: () => "/tmp/agent",
  };
});

import { generateSlugViaLLM } from "./llm-slug-generator.js";

describe("generateSlugViaLLM", () => {
  beforeEach(() => {
    runEmbeddedPiAgentMock.mockReset();
    runEmbeddedPiAgentMock.mockResolvedValue({
      payloads: [{ text: "bug-fix" }],
      meta: {},
    });
  });

  it("uses agents.defaults.model.primary when the default agent has no explicit model", async () => {
    const cfg = {
      agents: {
        defaults: {
          model: {
            primary: "openai/gpt-5",
          },
        },
        list: [{ id: "main", default: true }],
      },
    } as OpenClawConfig;

    await generateSlugViaLLM({
      sessionContent: "Investigating slug generation model selection",
      cfg,
    });

    expect(runEmbeddedPiAgentMock).toHaveBeenCalledTimes(1);
    const call = runEmbeddedPiAgentMock.mock.calls[0]?.[0] as
      | { provider?: string; model?: string }
      | undefined;
    expect(call?.provider).toBe("openai");
    expect(call?.model).toBe("gpt-5");
  });
});
