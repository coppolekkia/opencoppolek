import { describe, expect, it, vi } from "vitest";
import { readResponseWithLimit } from "./read-response-with-limit.js";

type ReaderLike = {
  read: () => Promise<ReadableStreamReadResult<Uint8Array>>;
  cancel: () => Promise<void>;
  releaseLock: () => void;
};

function createResponse(reader: ReaderLike): Response {
  return {
    body: {
      getReader: () => reader,
    } as unknown as ReadableStream<Uint8Array>,
  } as unknown as Response;
}

describe("readResponseWithLimit", () => {
  it("reports reader cancel errors via onCleanupError before overflow", async () => {
    const read = vi
      .fn<ReaderLike["read"]>()
      .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2, 3]) })
      .mockResolvedValueOnce({ done: false, value: new Uint8Array([4, 5, 6]) });
    const cancel = vi.fn<ReaderLike["cancel"]>(async () => {
      throw new Error("cancel failed");
    });
    const releaseLock = vi.fn<ReaderLike["releaseLock"]>();
    const reader = { read, cancel, releaseLock };
    const response = createResponse(reader);
    const onCleanupError = vi.fn();

    await expect(
      readResponseWithLimit(response, 4, {
        onCleanupError,
      }),
    ).rejects.toThrow("Content too large");

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalledTimes(1);
    expect(onCleanupError).toHaveBeenCalledTimes(1);
    expect(onCleanupError).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "cancel",
        res: response,
      }),
    );
  });

  it("reports releaseLock errors via onCleanupError after successful reads", async () => {
    const read = vi
      .fn<ReaderLike["read"]>()
      .mockResolvedValueOnce({ done: false, value: new Uint8Array([7, 8, 9]) })
      .mockResolvedValueOnce({ done: true, value: undefined });
    const cancel = vi.fn<ReaderLike["cancel"]>(async () => {});
    const releaseLock = vi.fn<ReaderLike["releaseLock"]>(() => {
      throw new Error("releaseLock failed");
    });
    const reader = { read, cancel, releaseLock };
    const response = createResponse(reader);
    const onCleanupError = vi.fn();

    const result = await readResponseWithLimit(response, 16, { onCleanupError });

    expect(result).toEqual(Buffer.from([7, 8, 9]));
    expect(cancel).not.toHaveBeenCalled();
    expect(onCleanupError).toHaveBeenCalledTimes(1);
    expect(onCleanupError).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "releaseLock",
        res: response,
      }),
    );
  });
});
