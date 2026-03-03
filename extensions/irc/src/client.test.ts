import { describe, expect, it } from "vitest";
import { buildFallbackNick, buildIrcNickServCommands } from "./client.js";

describe("irc client nickserv", () => {
  it("builds IDENTIFY command when password is set", () => {
    expect(
      buildIrcNickServCommands({
        password: "secret",
      }),
    ).toEqual(["PRIVMSG NickServ :IDENTIFY secret"]);
  });

  it("builds REGISTER command when enabled with email", () => {
    expect(
      buildIrcNickServCommands({
        password: "secret",
        register: true,
        registerEmail: "bot@example.com",
      }),
    ).toEqual([
      "PRIVMSG NickServ :IDENTIFY secret",
      "PRIVMSG NickServ :REGISTER secret bot@example.com",
    ]);
  });

  it("rejects register without registerEmail", () => {
    expect(() =>
      buildIrcNickServCommands({
        password: "secret",
        register: true,
      }),
    ).toThrow(/registerEmail/);
  });

  it("sanitizes outbound NickServ payloads", () => {
    expect(
      buildIrcNickServCommands({
        service: "NickServ\n",
        password: "secret\r\nJOIN #bad",
      }),
    ).toEqual(["PRIVMSG NickServ :IDENTIFY secret JOIN #bad"]);
  });
});

describe("buildFallbackNick", () => {
  it("appends underscore for first attempt (attempt=0)", () => {
    expect(buildFallbackNick("mybot", 0)).toBe("mybot_");
  });

  it("appends numeric suffix for subsequent attempts", () => {
    expect(buildFallbackNick("mybot", 1)).toBe("mybot_1");
    expect(buildFallbackNick("mybot", 2)).toBe("mybot_2");
    expect(buildFallbackNick("mybot", 3)).toBe("mybot_3");
  });

  it("generates unique nicks across attempts", () => {
    const nicks = new Set<string>();
    for (let i = 0; i < 5; i++) {
      nicks.add(buildFallbackNick("openclaw", i));
    }
    expect(nicks.size).toBe(5);
  });

  it("truncates long nicks to respect 30-char limit", () => {
    const longNick = "a".repeat(30);
    const result = buildFallbackNick(longNick, 3);
    expect(result.length).toBeLessThanOrEqual(30);
    expect(result).toMatch(/_3$/);
  });

  it("falls back to openclaw when nick sanitizes to empty", () => {
    expect(buildFallbackNick("🤖", 0)).toBe("openclaw_");
    expect(buildFallbackNick("🤖", 2)).toBe("openclaw_2");
  });
});
