/**
 * penpot_create_file - Create a new design file in a project.
 * penpot_inspect_file - Read file structure (pages, shapes, revn/vern).
 */

import type { AnyAgentTool } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { jsonResult } from "openclaw/plugin-sdk";
import type { PenpotClient } from "../client.js";

export function createCreateFileTool(client: PenpotClient): AnyAgentTool {
  return {
    name: "penpot_create_file",
    label: "PenPot: Create File",
    description:
      "Create a new design file in a PenPot project. Returns the file ID, initial page ID, and revision numbers needed for subsequent operations.",
    parameters: Type.Object({
      projectId: Type.String({ description: "Project ID to create the file in" }),
      name: Type.String({ description: "Name for the new design file" }),
    }),
    async execute(_toolCallId, params) {
      const { projectId, name } = params as { projectId: string; name: string };
      const file = (await client.createFile(projectId, name)) as Record<string, unknown>;

      // Extract page info from file data
      const data = file.data as Record<string, unknown> | undefined;
      const pages = (data?.pages as string[]) ?? [];
      const pagesIndex = (data?.["pages-index"] as Record<string, Record<string, unknown>>) ?? {};

      const pageList = pages.map((pid) => ({
        id: pid,
        name: pagesIndex[pid]?.name ?? "Page 1",
      }));

      return jsonResult({
        fileId: file.id,
        name: file.name,
        revn: file.revn ?? 0,
        vern: file.vern ?? 0,
        pages: pageList,
      });
    },
  };
}

export function createInspectFileTool(client: PenpotClient): AnyAgentTool {
  return {
    name: "penpot_inspect_file",
    label: "PenPot: Inspect File",
    description:
      "Read the structure of a PenPot design file. Returns pages, shapes on each page, and the current revision number (revn) needed for update operations.",
    parameters: Type.Object({
      fileId: Type.String({ description: "The file ID to inspect" }),
      includeShapes: Type.Optional(
        Type.Boolean({
          description: "Include shape details for each page (default: true)",
        }),
      ),
    }),
    async execute(_toolCallId, params) {
      const { fileId, includeShapes = true } = params as {
        fileId: string;
        includeShapes?: boolean;
      };

      const file = (await client.getFile(fileId)) as Record<string, unknown>;
      const data = file.data as Record<string, unknown> | undefined;
      const pageIds = (data?.pages as string[]) ?? [];
      const pagesIndex = (data?.["pages-index"] as Record<string, Record<string, unknown>>) ?? {};

      const pages = pageIds.map((pid) => {
        const page = pagesIndex[pid];
        if (!page) return { id: pid, name: "Unknown", shapes: [] };

        const result: Record<string, unknown> = {
          id: pid,
          name: page.name,
        };

        if (includeShapes) {
          const objects = (page.objects as Record<string, Record<string, unknown>>) ?? {};
          result.shapeCount = Object.keys(objects).length;
          result.shapes = Object.values(objects).map((obj) => ({
            id: obj.id,
            name: obj.name,
            type: obj.type,
            x: obj.x,
            y: obj.y,
            width: obj.width,
            height: obj.height,
            parentId: obj["parent-id"],
            frameId: obj["frame-id"],
          }));
        }

        return result;
      });

      return jsonResult({
        fileId: file.id,
        name: file.name,
        revn: file.revn ?? 0,
        vern: file.vern ?? 0,
        pages,
      });
    },
  };
}
