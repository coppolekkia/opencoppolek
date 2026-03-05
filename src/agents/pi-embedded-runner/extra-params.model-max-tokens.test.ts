import type { StreamFn } from "@mariozechner/pi-agent-core";
import type { Context, Model, SimpleStreamOptions } from "@mariozechner/pi-ai";
import { describe, expect, it, vi } from "vitest";
import { applyExtraParamsToAgent } from "./extra-params.js";

vi.mock("@mariozechner/pi-ai", () => ({
  streamSimple: vi.fn(() => ({
    push: vi.fn(),
    result: vi.fn(),
  })),
}));

function captureStreamOptions(params: {
  provider: string;
  modelId: string;
  cfg?: Parameters<typeof applyExtraParamsToAgent>[1];
  modelMaxTokens?: number;
}): SimpleStreamOptions | undefined {
  let captured: SimpleStreamOptions | undefined;
  const baseStreamFn: StreamFn = (_model, _context, options) => {
    captured = options;
    return {} as ReturnType<StreamFn>;
  };
  const agent = { streamFn: baseStreamFn };

  applyExtraParamsToAgent(
    agent,
    params.cfg,
    params.provider,
    params.modelId,
    undefined,
    undefined,
    undefined,
    params.modelMaxTokens,
  );

  const model = {
    api: "openai-completions",
    provider: params.provider,
    id: params.modelId,
  } as Model<"openai-completions">;
  const context: Context = { messages: [] };
  void agent.streamFn?.(model, context, {});

  return captured;
}

describe("extra-params: model maxTokens fallback", () => {
  it("forwards model maxTokens when no explicit params.maxTokens is configured", () => {
    const opts = captureStreamOptions({
      provider: "openrouter",
      modelId: "openai/gpt-oss-120b:free",
      modelMaxTokens: 40000,
    });

    expect(opts?.maxTokens).toBe(40000);
  });

  it("explicit params.maxTokens takes precedence over model maxTokens", () => {
    const opts = captureStreamOptions({
      provider: "openrouter",
      modelId: "openai/gpt-oss-120b:free",
      modelMaxTokens: 40000,
      cfg: {
        agents: {
          defaults: {
            models: {
              "openrouter/openai/gpt-oss-120b:free": {
                params: { maxTokens: 12000 },
              },
            },
          },
        },
      } as Parameters<typeof applyExtraParamsToAgent>[1],
    });

    expect(opts?.maxTokens).toBe(12000);
  });

  it("does not set maxTokens when neither params nor model value is provided", () => {
    const opts = captureStreamOptions({
      provider: "openai",
      modelId: "gpt-4",
    });

    expect(opts?.maxTokens).toBeUndefined();
  });
});
