/**
 * penpot_update_file - Low-level changes for individual shape operations.
 *
 * Provides fine-grained control: add, modify, or delete individual shapes.
 */

import type { AnyAgentTool } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { jsonResult } from "openclaw/plugin-sdk";
import { stringEnum } from "openclaw/plugin-sdk";
import type { PenpotClient } from "../client.js";
import { ChangesBuilder, type ShapeInput } from "../changes.js";
import { generateUuid } from "../uuid.js";

const OPERATION_TYPES = ["add-shape", "modify-shape", "delete-shape", "move-shapes"] as const;

const OperationSchema = Type.Object({
  op: stringEnum(OPERATION_TYPES, { description: "Operation type" }),

  // For add-shape
  shape: Type.Optional(Type.Any({ description: "Shape definition (for add-shape)" })),
  parentId: Type.Optional(
    Type.String({ description: "Parent shape ID (for add-shape, move-shapes)" }),
  ),
  frameId: Type.Optional(Type.String({ description: "Frame ID (for add-shape)" })),

  // For modify-shape
  shapeId: Type.Optional(Type.String({ description: "Shape ID to modify or delete" })),
  attrs: Type.Optional(
    Type.Record(Type.String(), Type.Any(), {
      description:
        "Attributes to set (for modify-shape). Keys are attribute names, values are new values.",
    }),
  ),

  // For move-shapes
  shapeIds: Type.Optional(Type.Array(Type.String(), { description: "Shape IDs to move" })),
  index: Type.Optional(Type.Number({ description: "Target index for move-shapes" })),
});

export function createUpdateFileTool(client: PenpotClient): AnyAgentTool {
  return {
    name: "penpot_update_file",
    label: "PenPot: Update File",
    description: `Low-level file update tool for individual shape operations. Use penpot_design_ui for creating complete UIs.

Operations:
- add-shape: Add a single shape (provide shape, parentId, frameId)
- modify-shape: Change shape attributes (provide shapeId, attrs)
- delete-shape: Remove a shape (provide shapeId)
- move-shapes: Move shapes to a new parent (provide shapeIds, parentId)`,
    parameters: Type.Object({
      fileId: Type.String({ description: "The file ID" }),
      pageId: Type.String({ description: "The page ID" }),
      revn: Type.Number({ description: "Current file revision number" }),
      operations: Type.Array(OperationSchema, { description: "Array of operations to perform" }),
    }),
    async execute(_toolCallId, params) {
      const { fileId, pageId, revn, operations } = params as {
        fileId: string;
        pageId: string;
        revn: number;
        operations: Array<{
          op: (typeof OPERATION_TYPES)[number];
          shape?: ShapeInput;
          parentId?: string;
          frameId?: string;
          shapeId?: string;
          attrs?: Record<string, unknown>;
          shapeIds?: string[];
          index?: number;
        }>;
      };

      const sessionId = generateUuid();
      const builder = new ChangesBuilder(pageId);
      const results: Array<{ op: string; id?: string }> = [];

      for (const operation of operations) {
        switch (operation.op) {
          case "add-shape": {
            if (!operation.shape) throw new Error("add-shape requires 'shape'");
            const id = builder.addShape(operation.shape, operation.parentId, operation.frameId);
            results.push({ op: "add-shape", id });
            break;
          }
          case "modify-shape": {
            if (!operation.shapeId) throw new Error("modify-shape requires 'shapeId'");
            if (!operation.attrs) throw new Error("modify-shape requires 'attrs'");
            builder.modShape(operation.shapeId, operation.attrs);
            results.push({ op: "modify-shape", id: operation.shapeId });
            break;
          }
          case "delete-shape": {
            if (!operation.shapeId) throw new Error("delete-shape requires 'shapeId'");
            builder.delShape(operation.shapeId);
            results.push({ op: "delete-shape", id: operation.shapeId });
            break;
          }
          case "move-shapes": {
            if (!operation.shapeIds) throw new Error("move-shapes requires 'shapeIds'");
            if (!operation.parentId) throw new Error("move-shapes requires 'parentId'");
            builder.moveShapes(operation.shapeIds, operation.parentId, operation.index);
            results.push({ op: "move-shapes" });
            break;
          }
        }
      }

      const changes = builder.getChanges();

      await client.updateFile({
        id: fileId,
        revn,
        "session-id": sessionId,
        changes: changes as unknown as Record<string, unknown>[],
      });

      return jsonResult({
        success: true,
        operationsApplied: results.length,
        results,
        newRevn: revn + 1,
      });
    },
  };
}
