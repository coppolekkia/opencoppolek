import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildWorkspaceSkillsPrompt } from "./skills.js";
import { writeSkill } from "./skills.test-helpers.js";

const tempDirs: string[] = [];

async function createTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe("managed skills fallback for sub-agent workspaces", () => {
  it("loads shared sibling skills when managed dir resolves to workspace/skills", async () => {
    const stateDir = await createTempDir("openclaw-state-");
    const workspaceDir = path.join(stateDir, "workspace-max");
    const sharedSkillsDir = path.join(stateDir, "skills", "shared-skill");

    await writeSkill({
      dir: sharedSkillsDir,
      name: "shared-skill",
      description: "Shared skill from state root",
    });

    const prompt = buildWorkspaceSkillsPrompt(workspaceDir, {
      managedSkillsDir: path.join(workspaceDir, "skills"),
      bundledSkillsDir: path.join(stateDir, ".bundled"),
    });

    expect(prompt).toContain("Shared skill from state root");
    expect(prompt.replaceAll("\\", "/")).toContain("skills/shared-skill/SKILL.md");
  });

  it("keeps workspace precedence over shared sibling fallback", async () => {
    const stateDir = await createTempDir("openclaw-state-");
    const workspaceDir = path.join(stateDir, "workspace-max");
    const sharedSkillsDir = path.join(stateDir, "skills", "demo-skill");
    const workspaceSkillDir = path.join(workspaceDir, "skills", "demo-skill");

    await writeSkill({
      dir: sharedSkillsDir,
      name: "demo-skill",
      description: "Shared version",
    });
    await writeSkill({
      dir: workspaceSkillDir,
      name: "demo-skill",
      description: "Workspace version",
    });

    const prompt = buildWorkspaceSkillsPrompt(workspaceDir, {
      managedSkillsDir: path.join(workspaceDir, "skills"),
      bundledSkillsDir: path.join(stateDir, ".bundled"),
    });

    expect(prompt).toContain("Workspace version");
    expect(prompt).not.toContain("Shared version");
  });
});
