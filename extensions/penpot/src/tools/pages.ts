/**
 * penpot_add_page - Add a page to a PenPot file.
 */

import type { AnyAgentTool } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { jsonResult } from "openclaw/plugin-sdk";
import type { PenpotClient } from "../client.js";
import { ChangesBuilder } from "../changes.js";
import { generateUuid } from "../uuid.js";

export function createAddPageTool(client: PenpotClient): AnyAgentTool {
  return {
    name: "penpot_add_page",
    label: "PenPot: Add Page",
    description: "Add a new page to an existing PenPot design file. Returns the new page ID.",
    parameters: Type.Object({
      fileId: Type.String({ description: "The file ID to add the page to" }),
      revn: Type.Number({
        description: "Current file revision number (from inspect_file or create_file)",
      }),
      name: Type.Optional(Type.String({ description: "Page name (default: 'Page')" })),
    }),
    async execute(_toolCallId, params) {
      const { fileId, revn, name } = params as {
        fileId: string;
        revn: number;
        name?: string;
      };

      const pageId = generateUuid();
      const sessionId = generateUuid();
      const builder = new ChangesBuilder(pageId);
      builder.addPage(pageId, name ?? "Page");

      await client.updateFile({
        id: fileId,
        revn,
        "session-id": sessionId,
        changes: builder.getChanges() as unknown as Record<string, unknown>[],
      });

      return jsonResult({
        pageId,
        name: name ?? "Page",
        newRevn: revn + 1,
      });
    },
  };
}
