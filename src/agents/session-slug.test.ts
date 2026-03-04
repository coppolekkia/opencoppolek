import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:crypto", () => ({
  randomInt: vi.fn((_max: number) => 0),
}));

import { randomInt } from "node:crypto";
import { createSessionSlug } from "./session-slug.js";

const mockedRandomInt = vi.mocked(randomInt);

describe("session slug", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockedRandomInt.mockImplementation(() => 0);
  });

  it("generates a two-word slug by default", () => {
    const slug = createSessionSlug();
    expect(slug).toBe("amber-atlas");
  });

  it("adds a numeric suffix when the base slug is taken", () => {
    const slug = createSessionSlug((id) => id === "amber-atlas");
    expect(slug).toBe("amber-atlas-2");
  });

  it("falls back to three words when collisions persist", () => {
    const slug = createSessionSlug((id) => /^amber-atlas(-\d+)?$/.test(id));
    expect(slug).toBe("amber-atlas-atlas");
  });
});
