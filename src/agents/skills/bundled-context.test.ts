import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { captureEnv } from "../../test-utils/env.js";
import { resolveBundledSkillsContext } from "./bundled-context.js";

describe("resolveBundledSkillsContext", () => {
  let envSnapshot: ReturnType<typeof captureEnv>;

  beforeEach(() => {
    envSnapshot = captureEnv(["OPENCLAW_BUNDLED_SKILLS_DIR"]);
  });

  afterEach(() => {
    envSnapshot.restore();
  });

  it("coerces unquoted numeric frontmatter skill names to strings", async () => {
    const bundledDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-bundled-context-"));
    const numericSkillDir = path.join(bundledDir, "numeric-name");
    await fs.mkdir(numericSkillDir, { recursive: true });
    await fs.writeFile(
      path.join(numericSkillDir, "SKILL.md"),
      "---\nname: 12306\ndescription: Numeric bundled name\n---\n",
      "utf-8",
    );

    process.env.OPENCLAW_BUNDLED_SKILLS_DIR = bundledDir;
    const context = resolveBundledSkillsContext();

    expect(context.names.has("12306")).toBe(true);
  });
});
