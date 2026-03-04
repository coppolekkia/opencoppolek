import { describe, expect, it } from "vitest";
import {
  buildCronEventPrompt,
  buildExecEventPrompt,
  isExecCompletionEvent,
} from "./heartbeat-events-filter.js";

describe("heartbeat event prompts", () => {
  it("builds user-relay cron prompt by default", () => {
    const prompt = buildCronEventPrompt(["Cron: rotate logs"]);
    expect(prompt).toContain("Please relay this reminder to the user");
  });

  it("builds internal-only cron prompt when delivery is disabled", () => {
    const prompt = buildCronEventPrompt(["Cron: rotate logs"], { deliverToUser: false });
    expect(prompt).toContain("Handle this reminder internally");
    expect(prompt).not.toContain("Please relay this reminder to the user");
  });

  it("builds internal-only exec prompt when delivery is disabled", () => {
    const prompt = buildExecEventPrompt({ deliverToUser: false });
    expect(prompt).toContain("Handle the result internally");
    expect(prompt).not.toContain("Please relay the command output to the user");
  });
});

describe("isExecCompletionEvent", () => {
  it("detects node exec finished events", () => {
    expect(isExecCompletionEvent("Exec finished (node=node-2 id=run-2, code 0)\ndone")).toBe(true);
  });

  it("detects local exec completed events", () => {
    expect(isExecCompletionEvent("Exec completed (abc12345, code 0) :: done")).toBe(true);
  });

  it("detects local exec failed events", () => {
    expect(isExecCompletionEvent("Exec failed (abc12345, code 1) :: error output")).toBe(true);
  });

  it("rejects unrelated events", () => {
    expect(isExecCompletionEvent("Cron: rotate logs")).toBe(false);
    expect(isExecCompletionEvent("HEARTBEAT_OK")).toBe(false);
    expect(isExecCompletionEvent("Discord reaction added")).toBe(false);
  });
});
