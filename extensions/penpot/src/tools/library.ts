/**
 * penpot_manage_library - Add colors and typography styles to file library.
 */

import type { AnyAgentTool } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { jsonResult } from "openclaw/plugin-sdk";
import type { PenpotClient } from "../client.js";
import { ChangesBuilder } from "../changes.js";
import { generateUuid } from "../uuid.js";

const ColorSchema = Type.Object({
  name: Type.String({ description: "Color name (e.g., 'Primary', 'Background')" }),
  color: Type.String({ description: "Hex color value (e.g., '#3B82F6')" }),
  opacity: Type.Optional(Type.Number({ description: "Opacity 0-1 (default: 1)" })),
});

const TypographySchema = Type.Object({
  name: Type.String({ description: "Typography style name (e.g., 'Heading', 'Body')" }),
  fontFamily: Type.String({ description: "Font family (e.g., 'Inter', 'Roboto')" }),
  fontSize: Type.String({ description: "Font size (e.g., '16', '24')" }),
  fontWeight: Type.Optional(Type.String({ description: "Font weight (e.g., '400', '700')" })),
  fontStyle: Type.Optional(Type.String({ description: "Font style (e.g., 'normal', 'italic')" })),
  lineHeight: Type.Optional(Type.String({ description: "Line height (e.g., '1.5', '24')" })),
  letterSpacing: Type.Optional(Type.String({ description: "Letter spacing (e.g., '0', '0.5')" })),
});

const ComponentSchema = Type.Object({
  name: Type.String({ description: "Component name (e.g., 'Button', 'Card')" }),
  path: Type.Optional(Type.String({ description: "Component path/group (e.g., 'Atoms/Buttons')" })),
  mainInstanceId: Type.String({ description: "Shape ID of the main component instance" }),
  mainInstancePage: Type.String({ description: "Page ID where the main instance lives" }),
});

export function createManageLibraryTool(client: PenpotClient): AnyAgentTool {
  return {
    name: "penpot_manage_library",
    label: "PenPot: Manage Library",
    description:
      "Add colors, typography styles, and components to a PenPot file's library. These can be reused across the design file for consistent styling.",
    parameters: Type.Object({
      fileId: Type.String({ description: "The file ID" }),
      revn: Type.Number({ description: "Current file revision number" }),
      colors: Type.Optional(
        Type.Array(ColorSchema, { description: "Colors to add to the library" }),
      ),
      typographies: Type.Optional(
        Type.Array(TypographySchema, { description: "Typography styles to add" }),
      ),
      components: Type.Optional(
        Type.Array(ComponentSchema, { description: "Components to register in the library" }),
      ),
    }),
    async execute(_toolCallId, params) {
      const { fileId, revn, colors, typographies, components } = params as {
        fileId: string;
        revn: number;
        colors?: Array<{ name: string; color: string; opacity?: number }>;
        typographies?: Array<{
          name: string;
          fontFamily: string;
          fontSize: string;
          fontWeight?: string;
          fontStyle?: string;
          lineHeight?: string;
          letterSpacing?: string;
        }>;
        components?: Array<{
          name: string;
          path?: string;
          mainInstanceId: string;
          mainInstancePage: string;
        }>;
      };

      const sessionId = generateUuid();
      // Use a dummy page ID since library changes are file-level
      const builder = new ChangesBuilder("00000000-0000-0000-0000-000000000000");

      const colorIds: Array<{ id: string; name: string }> = [];
      const typographyIds: Array<{ id: string; name: string }> = [];
      const componentIds: Array<{ id: string; name: string }> = [];

      if (colors) {
        for (const c of colors) {
          const id = generateUuid();
          builder.addColor(id, c.name, c.color, c.opacity ?? 1);
          colorIds.push({ id, name: c.name });
        }
      }

      if (typographies) {
        for (const t of typographies) {
          const id = generateUuid();
          builder.addTypography(id, t.name, t.fontFamily, t.fontSize, t.fontWeight ?? "400", {
            fontStyle: t.fontStyle,
            lineHeight: t.lineHeight,
            letterSpacing: t.letterSpacing,
          });
          typographyIds.push({ id, name: t.name });
        }
      }

      if (components) {
        for (const comp of components) {
          const id = generateUuid();
          builder.addComponent(
            id,
            comp.name,
            comp.mainInstanceId,
            comp.mainInstancePage,
            comp.path,
          );
          componentIds.push({ id, name: comp.name });
        }
      }

      const changes = builder.getChanges();

      if (changes.length === 0) {
        return jsonResult({ success: true, message: "No library items to add" });
      }

      await client.updateFile({
        id: fileId,
        revn,
        "session-id": sessionId,
        changes: changes as unknown as Record<string, unknown>[],
      });

      return jsonResult({
        success: true,
        colorsAdded: colorIds,
        typographiesAdded: typographyIds,
        componentsAdded: componentIds,
        newRevn: revn + 1,
      });
    },
  };
}
