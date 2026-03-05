import { z } from "zod";
import type { OpenClawConfig } from "../../config/config.js";
import { loadWorkspaceSkillEntries } from "../skills/workspace.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult } from "./common.js";

export function createListSkillsTool(options?: {
  workspaceDir?: string;
  config?: OpenClawConfig;
}): AnyAgentTool {
  return {
    name: "list_skills",
    label: "List Skills",
    description:
      "List available skills with name, description, and location. Use to discover skills on demand.",
    parameters: z.object({}).strict(),
    execute: async () => {
      const entries = loadWorkspaceSkillEntries(options?.workspaceDir ?? process.cwd(), {
        config: options?.config,
      });
      const filtered = entries.filter((entry) => entry.invocation?.disableModelInvocation !== true);
      const payload = filtered
        .map((entry) => ({
          name: entry.skill.name,
          description: entry.skill.description ?? "",
          location: entry.skill.filePath,
        }))
        .toSorted((a, b) => a.name.localeCompare(b.name));
      return jsonResult(payload);
    },
  };
}
