import path from "node:path";
import type { OpenClawConfig } from "../../config/config.js";
import { loadWorkspaceSkillEntries, type SkillEntry, type SkillSnapshot } from "../skills.js";

function isSkillPathInsideWorkspace(workspaceDir: string, filePath: string): boolean {
  const workspaceRoot = path.resolve(workspaceDir);
  const resolvedSkillPath = path.resolve(filePath);
  const relative = path.relative(workspaceRoot, resolvedSkillPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function resolveEmbeddedRunSkillEntries(params: {
  workspaceDir: string;
  config?: OpenClawConfig;
  skillsSnapshot?: SkillSnapshot;
  enforceWorkspacePaths?: boolean;
}): {
  shouldLoadSkillEntries: boolean;
  skillEntries: SkillEntry[];
} {
  const enforceWorkspacePaths = params.enforceWorkspacePaths ?? true;
  const hasResolvedSkills = Boolean(params.skillsSnapshot?.resolvedSkills);
  const snapshotHasOutOfWorkspacePaths =
    enforceWorkspacePaths &&
    hasResolvedSkills &&
    (params.skillsSnapshot?.resolvedSkills ?? []).some(
      (skill) => !isSkillPathInsideWorkspace(params.workspaceDir, skill.filePath),
    );
  const shouldLoadSkillEntries =
    !params.skillsSnapshot || !params.skillsSnapshot.resolvedSkills || snapshotHasOutOfWorkspacePaths;
  if (shouldLoadSkillEntries && params.skillsSnapshot) {
    // Force resolveSkillsPromptForRun(...) to rebuild prompt text from runtime skill entries.
    params.skillsSnapshot.prompt = "";
    delete params.skillsSnapshot.resolvedSkills;
  }
  return {
    shouldLoadSkillEntries,
    skillEntries: shouldLoadSkillEntries
      ? loadWorkspaceSkillEntries(params.workspaceDir, { config: params.config })
      : [],
  };
}
