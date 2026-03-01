import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withTempDir } from "../test-utils/temp-dir.js";
import {
  cameraTempPath,
  parseCameraClipPayload,
  parseCameraSnapPayload,
  writeCameraClipPayloadToFile,
  writeBase64ToFile,
  writeUrlToFile,
} from "./nodes-camera.js";
import { parseScreenRecordPayload, screenRecordTempPath } from "./nodes-screen.js";

const { fetchWithSsrFGuardMock } = vi.hoisted(() => ({
  fetchWithSsrFGuardMock: vi.fn(),
}));

vi.mock("../infra/net/fetch-guard.js", () => ({
  fetchWithSsrFGuard: (...args: unknown[]) => fetchWithSsrFGuardMock(...args),
}));

async function withCameraTempDir<T>(run: (dir: string) => Promise<T>): Promise<T> {
  return await withTempDir("openclaw-test-", run);
}

describe("nodes camera helpers", () => {
  function stubGuardedFetchResponse(response: Response) {
    fetchWithSsrFGuardMock.mockResolvedValue({
      response,
      finalUrl: "https://example.com/final",
      release: vi.fn(async () => {}),
    });
  }

  it("parses camera.snap payload", () => {
    expect(
      parseCameraSnapPayload({
        format: "jpg",
        base64: "aGk=",
        width: 10,
        height: 20,
      }),
    ).toEqual({ format: "jpg", base64: "aGk=", width: 10, height: 20 });
  });

  it("rejects invalid camera.snap payload", () => {
    expect(() => parseCameraSnapPayload({ format: "jpg" })).toThrow(
      /invalid camera\.snap payload/i,
    );
  });

  it("parses camera.clip payload", () => {
    expect(
      parseCameraClipPayload({
        format: "mp4",
        base64: "AAEC",
        durationMs: 1234,
        hasAudio: true,
      }),
    ).toEqual({
      format: "mp4",
      base64: "AAEC",
      durationMs: 1234,
      hasAudio: true,
    });
  });

  it("rejects invalid camera.clip payload", () => {
    expect(() =>
      parseCameraClipPayload({ format: "mp4", base64: "AAEC", durationMs: 1234 }),
    ).toThrow(/invalid camera\.clip payload/i);
  });

  it("builds stable temp paths when id provided", () => {
    const p = cameraTempPath({
      kind: "snap",
      facing: "front",
      ext: "jpg",
      tmpDir: "/tmp",
      id: "id1",
    });
    expect(p).toBe(path.join("/tmp", "openclaw-camera-snap-front-id1.jpg"));
  });

  it("writes camera clip payload to temp path", async () => {
    await withCameraTempDir(async (dir) => {
      const out = await writeCameraClipPayloadToFile({
        payload: {
          format: "mp4",
          base64: "aGk=",
          durationMs: 200,
          hasAudio: false,
        },
        facing: "front",
        expectedHost: "10.0.0.5",
        tmpDir: dir,
        id: "clip1",
      });
      expect(out).toBe(path.join(dir, "openclaw-camera-clip-front-clip1.mp4"));
      await expect(fs.readFile(out, "utf8")).resolves.toBe("hi");
    });
  });

  it("writes camera clip payload from url", async () => {
    stubGuardedFetchResponse(new Response("url-clip", { status: 200 }));
    await withCameraTempDir(async (dir) => {
      const out = await writeCameraClipPayloadToFile({
        payload: {
          format: "mp4",
          url: "https://example.com/clip.mp4",
          durationMs: 200,
          hasAudio: false,
        },
        facing: "back",
        expectedHost: "example.com",
        tmpDir: dir,
        id: "clip2",
      });
      expect(out).toBe(path.join(dir, "openclaw-camera-clip-back-clip2.mp4"));
      await expect(fs.readFile(out, "utf8")).resolves.toBe("url-clip");
    });
  });

  it("writes base64 to file", async () => {
    await withCameraTempDir(async (dir) => {
      const out = path.join(dir, "x.bin");
      await writeBase64ToFile(out, "aGk=");
      await expect(fs.readFile(out, "utf8")).resolves.toBe("hi");
    });
  });

  afterEach(() => {
    fetchWithSsrFGuardMock.mockReset();
  });

  it("writes url payload to file", async () => {
    stubGuardedFetchResponse(new Response("url-content", { status: 200 }));
    await withCameraTempDir(async (dir) => {
      const out = path.join(dir, "x.bin");
      await writeUrlToFile(out, "https://example.com/clip.mp4", "example.com");
      await expect(fs.readFile(out, "utf8")).resolves.toBe("url-content");
    });
  });

  it("allows http url payload for RFC1918 expected host", async () => {
    stubGuardedFetchResponse(new Response("url-content", { status: 200 }));
    await withCameraTempDir(async (dir) => {
      const out = path.join(dir, "x-http-private.bin");
      await writeUrlToFile(out, "http://10.0.0.5/clip.mp4", "10.0.0.5");
      await expect(fs.readFile(out, "utf8")).resolves.toBe("url-content");
    });
  });

  it("rejects invalid url payload responses", async () => {
    const cases: Array<{
      name: string;
      url: string;
      response?: Response;
      expectedMessage: RegExp;
    }> = [
      {
        name: "non-https url",
        url: "http://example.com/x.bin",
        expectedMessage: /only https/i,
      },
      {
        name: "non-https url with public ip",
        url: "http://8.8.8.8/x.bin",
        expectedMessage: /only https/i,
      },
      {
        name: "oversized content-length",
        url: "https://example.com/huge.bin",
        response: new Response("tiny", {
          status: 200,
          headers: { "content-length": String(999_999_999) },
        }),
        expectedMessage: /exceeds max/i,
      },
      {
        name: "non-ok status",
        url: "https://example.com/down.bin",
        response: new Response("down", { status: 503, statusText: "Service Unavailable" }),
        expectedMessage: /503/i,
      },
      {
        name: "empty response body",
        url: "https://example.com/empty.bin",
        response: new Response(null, { status: 200 }),
        expectedMessage: /empty response body/i,
      },
    ];

    for (const testCase of cases) {
      if (testCase.response) {
        stubGuardedFetchResponse(testCase.response);
      }
      const expectedHost = testCase.url.includes("8.8.8.8") ? "8.8.8.8" : "example.com";
      await expect(
        writeUrlToFile("/tmp/ignored", testCase.url, expectedHost),
        testCase.name,
      ).rejects.toThrow(testCase.expectedMessage);
    }
  });

  it("rejects when expectedHost is missing", async () => {
    await expect(writeUrlToFile("/tmp/ignored", "https://example.com/x.bin", "")).rejects.toThrow(
      /expectedHost is required/i,
    );
  });

  it("rejects url host mismatch", async () => {
    await expect(
      writeUrlToFile("/tmp/ignored", "https://example.com/x.bin", "10.0.0.4"),
    ).rejects.toThrow(/does not match expected host/i);
  });

  it("removes partially written file when url stream fails", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("partial"));
        controller.error(new Error("stream exploded"));
      },
    });
    stubGuardedFetchResponse(new Response(stream, { status: 200 }));

    await withCameraTempDir(async (dir) => {
      const out = path.join(dir, "broken.bin");
      await expect(
        writeUrlToFile(out, "https://example.com/broken.bin", "example.com"),
      ).rejects.toThrow(/stream exploded/i);
      await expect(fs.stat(out)).rejects.toThrow();
    });
  });
});

describe("nodes screen helpers", () => {
  it("parses screen.record payload", () => {
    const payload = parseScreenRecordPayload({
      format: "mp4",
      base64: "Zm9v",
      durationMs: 1000,
      fps: 12,
      screenIndex: 0,
      hasAudio: true,
    });
    expect(payload.format).toBe("mp4");
    expect(payload.base64).toBe("Zm9v");
    expect(payload.durationMs).toBe(1000);
    expect(payload.fps).toBe(12);
    expect(payload.screenIndex).toBe(0);
    expect(payload.hasAudio).toBe(true);
  });

  it("drops invalid optional fields instead of throwing", () => {
    const payload = parseScreenRecordPayload({
      format: "mp4",
      base64: "Zm9v",
      durationMs: "nope",
      fps: null,
      screenIndex: "0",
      hasAudio: 1,
    });
    expect(payload.durationMs).toBeUndefined();
    expect(payload.fps).toBeUndefined();
    expect(payload.screenIndex).toBeUndefined();
    expect(payload.hasAudio).toBeUndefined();
  });

  it("rejects invalid screen.record payload", () => {
    expect(() => parseScreenRecordPayload({ format: "mp4" })).toThrow(
      /invalid screen\.record payload/i,
    );
  });

  it("builds screen record temp path", () => {
    const p = screenRecordTempPath({
      ext: "mp4",
      tmpDir: "/tmp",
      id: "id1",
    });
    expect(p).toBe(path.join("/tmp", "openclaw-screen-record-id1.mp4"));
  });
});
