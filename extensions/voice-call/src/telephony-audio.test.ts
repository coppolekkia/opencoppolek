import { describe, expect, it } from "vitest";
import {
  convertPcmToMulaw8k,
  convertPcmChunkToMulaw8k,
  createPcmToMulawStreamState,
  flushPcmToMulawStream,
} from "./telephony-audio.js";

describe("incremental PCM-to-mulaw conversion", () => {
  it("produces identical output to single-pass for even-aligned chunks", () => {
    // Create a PCM buffer with known samples (16-bit LE, 24kHz -> 8kHz)
    const sampleRate = 24000;
    const numSamples = 300;
    const pcm = Buffer.alloc(numSamples * 2);
    for (let i = 0; i < numSamples; i++) {
      // Sine-like pattern
      const value = Math.round(Math.sin((i / numSamples) * Math.PI * 4) * 16000);
      pcm.writeInt16LE(value, i * 2);
    }

    // Single-pass reference
    const reference = convertPcmToMulaw8k(pcm, sampleRate);

    // Incremental: split into even-sized chunks
    const chunkSize = 100; // 50 samples per chunk (even)
    const state = createPcmToMulawStreamState();
    const chunks: Buffer[] = [];

    for (let offset = 0; offset < pcm.length; offset += chunkSize) {
      const chunk = pcm.subarray(offset, Math.min(offset + chunkSize, pcm.length));
      const result = convertPcmChunkToMulaw8k(chunk, sampleRate, state);
      if (result.length > 0) {
        chunks.push(result);
      }
    }
    flushPcmToMulawStream(state);

    const incremental = Buffer.concat(chunks);
    expect(incremental).toEqual(reference);
  });

  it("handles odd-byte chunks via leftover stashing", () => {
    const sampleRate = 8000;
    // 4 samples = 8 bytes
    const pcm = Buffer.alloc(8);
    pcm.writeInt16LE(100, 0);
    pcm.writeInt16LE(200, 2);
    pcm.writeInt16LE(300, 4);
    pcm.writeInt16LE(400, 6);

    const reference = convertPcmToMulaw8k(pcm, sampleRate);

    // Split at odd boundaries: 3 bytes, 3 bytes, 2 bytes
    const state = createPcmToMulawStreamState();
    const chunks: Buffer[] = [];

    const c1 = convertPcmChunkToMulaw8k(pcm.subarray(0, 3), sampleRate, state);
    if (c1.length > 0) chunks.push(c1);

    const c2 = convertPcmChunkToMulaw8k(pcm.subarray(3, 6), sampleRate, state);
    if (c2.length > 0) chunks.push(c2);

    const c3 = convertPcmChunkToMulaw8k(pcm.subarray(6, 8), sampleRate, state);
    if (c3.length > 0) chunks.push(c3);

    flushPcmToMulawStream(state);

    const incremental = Buffer.concat(chunks);
    expect(incremental).toEqual(reference);
  });

  it("handles leftover byte at end of stream", () => {
    const sampleRate = 8000;
    // 3 bytes = 1 sample + 1 leftover byte
    const pcm = Buffer.alloc(3);
    pcm.writeInt16LE(500, 0);
    pcm[2] = 0x42; // leftover

    const reference = convertPcmToMulaw8k(pcm.subarray(0, 2), sampleRate);

    const state = createPcmToMulawStreamState();
    const result = convertPcmChunkToMulaw8k(pcm, sampleRate, state);
    const flushed = flushPcmToMulawStream(state);

    expect(state.leftover).toBeNull();
    expect(flushed.length).toBe(0);
    expect(result).toEqual(reference);
  });

  it("flush clears leftover state", () => {
    const state = createPcmToMulawStreamState();
    // Feed a single byte (odd)
    convertPcmChunkToMulaw8k(Buffer.from([0x42]), 8000, state);
    expect(state.leftover).not.toBeNull();

    flushPcmToMulawStream(state);
    expect(state.leftover).toBeNull();
  });

  it("empty chunk produces empty output", () => {
    const state = createPcmToMulawStreamState();
    const result = convertPcmChunkToMulaw8k(Buffer.alloc(0), 8000, state);
    expect(result.length).toBe(0);
  });
});
