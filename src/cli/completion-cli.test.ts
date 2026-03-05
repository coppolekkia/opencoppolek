import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";

const { getSubCliEntries, registerSubCliByName } = vi.hoisted(() => ({
  getSubCliEntries: vi.fn(() => []),
  registerSubCliByName: vi.fn(async () => {}),
}));

vi.mock("./program/register.subclis.js", () => ({
  getSubCliEntries,
  registerSubCliByName,
}));

const { getCompletionScript } = await import("./completion-cli.js");

describe("completion-cli", () => {
  it("generates zsh completion that initializes compinit before compdef", () => {
    const program = new Command();
    program.name("openclaw");

    const script = getCompletionScript("zsh", program);
    const compinitIndex = script.indexOf("autoload -Uz compinit");
    const compdefIndex = script.indexOf("compdef _openclaw_root_completion openclaw");

    expect(script).toContain("if ! (( $+functions[compdef] )); then");
    expect(compinitIndex).toBeGreaterThan(-1);
    expect(compdefIndex).toBeGreaterThan(-1);
    expect(compinitIndex).toBeLessThan(compdefIndex);
  });
});
