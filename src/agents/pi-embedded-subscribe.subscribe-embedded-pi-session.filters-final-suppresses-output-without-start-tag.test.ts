import type { AssistantMessage } from "@mariozechner/pi-ai";
import { describe, expect, it, vi } from "vitest";
import {
  createStubSessionHarness,
  emitAssistantTextDelta,
  emitMessageStartAndEndForAssistantText,
  extractAgentEventPayloads,
} from "./pi-embedded-subscribe.e2e-harness.js";
import { subscribeEmbeddedPiSession } from "./pi-embedded-subscribe.js";

describe("subscribeEmbeddedPiSession", () => {
  it("filters to <final> and suppresses output without a start tag", () => {
    const { session, emit } = createStubSessionHarness();

    const onPartialReply = vi.fn();
    const onAgentEvent = vi.fn();

    subscribeEmbeddedPiSession({
      session,
      runId: "run",
      enforceFinalTag: true,
      onPartialReply,
      onAgentEvent,
    });

    emit({ type: "message_start", message: { role: "assistant" } });
    emitAssistantTextDelta({ emit, delta: "<final>Hi there</final>" });

    expect(onPartialReply).toHaveBeenCalled();
    const firstPayload = onPartialReply.mock.calls[0][0];
    expect(firstPayload.text).toBe("Hi there");

    onPartialReply.mockClear();

    emit({ type: "message_start", message: { role: "assistant" } });
    emitAssistantTextDelta({ emit, delta: "</final>Oops no start" });

    expect(onPartialReply).not.toHaveBeenCalled();
  });
  it("falls back to raw text on message_end without <final> tags when enforced and nothing was streamed", () => {
    const { session, emit } = createStubSessionHarness();

    const onAgentEvent = vi.fn();

    subscribeEmbeddedPiSession({
      session,
      runId: "run",
      enforceFinalTag: true,
      onAgentEvent,
    });
    emitMessageStartAndEndForAssistantText({ emit, text: "Hello world" });
    // When enforceFinalTag is true but no assistant event was emitted during
    // streaming, the message_end fallback fires so the response isn't silently
    // dropped (#34537).  Thinking tags are stripped in the fallback path.
    const payloads = extractAgentEventPayloads(onAgentEvent.mock.calls);
    expect(payloads).toHaveLength(1);
    expect(payloads[0].text).toBe("Hello world");
  });
  it("suppresses thinking-only text on message_end when enforceFinalTag is true", () => {
    const { session, emit } = createStubSessionHarness();

    const onAgentEvent = vi.fn();

    subscribeEmbeddedPiSession({
      session,
      runId: "run",
      enforceFinalTag: true,
      onAgentEvent,
    });
    emitMessageStartAndEndForAssistantText({
      emit,
      text: "<think>internal reasoning only</think>",
    });
    // Thinking-only content is correctly stripped and nothing is emitted.
    const payloads = extractAgentEventPayloads(onAgentEvent.mock.calls);
    expect(payloads).toHaveLength(0);
  });
  it("emits via streaming when <final> tags are present and enforcement is on", () => {
    const { session, emit } = createStubSessionHarness();

    const onPartialReply = vi.fn();
    const onAgentEvent = vi.fn();

    subscribeEmbeddedPiSession({
      session,
      runId: "run",
      enforceFinalTag: true,
      onPartialReply,
      onAgentEvent,
    });

    // With enforceFinalTag, content is emitted via streaming (text_delta path),
    // NOT recovered from message_end fallback. extractAssistantText strips
    // <final> tags, so message_end would see plain text with no <final> markers
    // and correctly suppress it (treated as reasoning leak).
    emit({ type: "message_start", message: { role: "assistant" } });
    emitAssistantTextDelta({ emit, delta: "<final>Hello world</final>" });

    expect(onPartialReply).toHaveBeenCalled();
    expect(onPartialReply.mock.calls[0][0].text).toBe("Hello world");
  });
  it("does not require <final> when enforcement is off", () => {
    const { session, emit } = createStubSessionHarness();

    const onPartialReply = vi.fn();

    subscribeEmbeddedPiSession({
      session,
      runId: "run",
      onPartialReply,
    });

    emitAssistantTextDelta({ emit, delta: "Hello world" });

    const payload = onPartialReply.mock.calls[0][0];
    expect(payload.text).toBe("Hello world");
  });
  it("emits block replies on message_end", () => {
    const { session, emit } = createStubSessionHarness();

    const onBlockReply = vi.fn();

    subscribeEmbeddedPiSession({
      session,
      runId: "run",
      onBlockReply,
      blockReplyBreak: "message_end",
    });

    const assistantMessage = {
      role: "assistant",
      content: [{ type: "text", text: "Hello block" }],
    } as AssistantMessage;

    emit({ type: "message_end", message: assistantMessage });

    expect(onBlockReply).toHaveBeenCalled();
    const payload = onBlockReply.mock.calls[0][0];
    expect(payload.text).toBe("Hello block");
  });
});
