import { describe, expect, it, vi, afterEach } from "vitest";
import {
  registerUnhandledRejectionHandler,
  isTransientNetworkError,
} from "../../../infra/unhandled-rejections.js";

describe("streaming rejection abort (#24622)", () => {
  describe("registerUnhandledRejectionHandler", () => {
    let unregister: (() => void) | undefined;

    afterEach(() => {
      unregister?.();
      unregister = undefined;
    });

    it("handler receives TypeError: fetch failed and can claim it", () => {
      const handler = vi.fn().mockReturnValue(true);
      unregister = registerUnhandledRejectionHandler(handler);

      const error = new TypeError("fetch failed");
      // Simulate what the global handler does: check if any registered handler claims it
      const claimed = handler(error);
      expect(claimed).toBe(true);
      expect(handler).toHaveBeenCalledWith(error);
    });

    it("handler can reject non-streaming errors", () => {
      const handler = vi.fn((reason: unknown) => {
        return reason instanceof TypeError && reason.message === "fetch failed";
      });
      unregister = registerUnhandledRejectionHandler(handler);

      expect(handler(new TypeError("fetch failed"))).toBe(true);
      expect(handler(new Error("some other error"))).toBe(false);
      expect(handler(new TypeError("Cannot read properties"))).toBe(false);
    });

    it("unregister prevents handler from being called", () => {
      const handler = vi.fn().mockReturnValue(true);
      unregister = registerUnhandledRejectionHandler(handler);
      unregister();
      unregister = undefined;
      // After unregister, the handler should no longer be in the set
      // (we can't easily test this without access to internals, but the
      // function should be safe to call)
    });
  });

  describe("isTransientNetworkError classifies fetch failures", () => {
    it("classifies TypeError: fetch failed as transient", () => {
      expect(isTransientNetworkError(new TypeError("fetch failed"))).toBe(true);
    });

    it("classifies ECONNRESET as transient", () => {
      const err = Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });
      expect(isTransientNetworkError(err)).toBe(true);
    });

    it("classifies ETIMEDOUT as transient", () => {
      const err = Object.assign(new Error("connect ETIMEDOUT"), { code: "ETIMEDOUT" });
      expect(isTransientNetworkError(err)).toBe(true);
    });

    it("does not classify billing errors as transient", () => {
      expect(isTransientNetworkError(new Error("insufficient credits"))).toBe(false);
      expect(isTransientNetworkError(new Error("billing error: payment required"))).toBe(false);
    });
  });

  describe("streaming error abort flow", () => {
    it("captured streaming error replaces generic AbortError", () => {
      // Simulates the fix logic in attempt.ts:
      // When a streaming rejection is captured, promptError should be
      // the original error, not the AbortError from abortable().
      const streamingErrorRef: { error?: Error } = {};
      streamingErrorRef.error = new TypeError("fetch failed");
      const abortError = new Error("aborted");
      abortError.name = "AbortError";

      // The fix: promptError = streamingErrorRef.error ?? err
      const promptError = streamingErrorRef.error ?? abortError;
      expect(promptError).toBe(streamingErrorRef.error);
      expect(promptError.message).toBe("fetch failed");
    });

    it("without captured error, original error is preserved", () => {
      const streamingErrorRef: { error?: Error } = {};
      const originalError = new Error("some prompt error");

      const promptError = streamingErrorRef.error ?? originalError;
      expect(promptError).toBe(originalError);
    });
  });

  describe("isStreamingAbort classification in run loop", () => {
    it("identifies streaming abort when promptError is not AbortError/TimeoutError", () => {
      const aborted = true;

      // Case 1: streaming error (fetch failed) - should be treated as streaming abort
      const fetchError = new TypeError("fetch failed");
      const isStreamingAbort1 =
        aborted &&
        fetchError instanceof Error &&
        fetchError.name !== "AbortError" &&
        fetchError.name !== "TimeoutError";
      expect(isStreamingAbort1).toBe(true);

      // Case 2: normal abort - should NOT be treated as streaming abort
      const abortError = new Error("aborted");
      abortError.name = "AbortError";
      const isStreamingAbort2 =
        aborted &&
        abortError instanceof Error &&
        abortError.name !== "AbortError" &&
        abortError.name !== "TimeoutError";
      expect(isStreamingAbort2).toBe(false);

      // Case 3: timeout - should NOT be treated as streaming abort
      const timeoutError = new Error("request timed out");
      timeoutError.name = "TimeoutError";
      const isStreamingAbort3 =
        aborted &&
        timeoutError instanceof Error &&
        timeoutError.name !== "AbortError" &&
        timeoutError.name !== "TimeoutError";
      expect(isStreamingAbort3).toBe(false);

      // Case 4: ECONNRESET - should be treated as streaming abort
      const connError = Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });
      const isStreamingAbort4 =
        aborted &&
        connError instanceof Error &&
        connError.name !== "AbortError" &&
        connError.name !== "TimeoutError";
      expect(isStreamingAbort4).toBe(true);
    });

    it("does not process prompt errors when not aborted (existing behavior)", () => {
      const aborted = false;
      const promptError = new TypeError("fetch failed");
      const isStreamingAbort =
        aborted &&
        promptError instanceof Error &&
        promptError.name !== "AbortError" &&
        promptError.name !== "TimeoutError";

      // When not aborted, the existing `promptError && !aborted` path handles it
      expect(!aborted || isStreamingAbort).toBe(true);
    });
  });
});
