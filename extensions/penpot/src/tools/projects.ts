/**
 * penpot_list_projects - List teams and projects to find where to work.
 */

import type { AnyAgentTool } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { jsonResult } from "openclaw/plugin-sdk";
import type { PenpotClient } from "../client.js";

export function createListProjectsTool(client: PenpotClient): AnyAgentTool {
  return {
    name: "penpot_list_projects",
    label: "PenPot: List Projects",
    description:
      "List all teams and their projects in PenPot. Use this to find the team-id and project-id you need for creating files. Returns teams with their projects.",
    parameters: Type.Object({
      teamId: Type.Optional(
        Type.String({
          description:
            "Filter to a specific team ID. If omitted, lists all teams with their projects.",
        }),
      ),
    }),
    async execute(_toolCallId, params) {
      const { teamId } = params as { teamId?: string };

      if (teamId) {
        const projects = await client.getProjects(teamId);
        return jsonResult({
          teamId,
          projects: (projects as Record<string, unknown>[]).map((p) => ({
            id: p.id,
            name: p.name,
            createdAt: p["created-at"],
            modifiedAt: p["modified-at"],
          })),
        });
      }

      // List all teams with their projects
      const teams = (await client.getTeams()) as Record<string, unknown>[];
      const results = [];

      for (const team of teams) {
        const tId = team.id as string;
        const projects = (await client.getProjects(tId)) as Record<string, unknown>[];
        results.push({
          teamId: tId,
          teamName: team.name,
          projects: projects.map((p) => ({
            id: p.id,
            name: p.name,
          })),
        });
      }

      return jsonResult({ teams: results });
    },
  };
}
