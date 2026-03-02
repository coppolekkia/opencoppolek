/**
 * penpot_design_ui - Design a complete UI layout in one batch call.
 *
 * This is the primary tool for Frank. It accepts a component tree
 * (frames, shapes, text with children) and translates it into
 * PenPot changes in a single update-file call.
 */

import type { AnyAgentTool } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { jsonResult } from "openclaw/plugin-sdk";
import type { PenpotClient } from "../client.js";
import { ChangesBuilder, type ShapeInput } from "../changes.js";
import { generateUuid } from "../uuid.js";

// ============================================================================
// TypeBox schemas for the recursive component tree
// ============================================================================

const GradientStopSchema = Type.Object({
  color: Type.String({ description: "Hex color (e.g., '#3B82F6')" }),
  offset: Type.Number({ description: "Position in gradient 0-1" }),
  opacity: Type.Number({ description: "Opacity 0-1" }),
});

const GradientSchema = Type.Object({
  type: Type.String({ description: "linear or radial" }),
  "start-x": Type.Number({ description: "Start X (0-1 normalized)" }),
  "start-y": Type.Number({ description: "Start Y (0-1 normalized)" }),
  "end-x": Type.Number({ description: "End X (0-1 normalized)" }),
  "end-y": Type.Number({ description: "End Y (0-1 normalized)" }),
  width: Type.Number({ description: "Gradient width (1 for linear, radius for radial)" }),
  stops: Type.Array(GradientStopSchema),
});

const FillSchema = Type.Object({
  "fill-color": Type.Optional(Type.String()),
  "fill-opacity": Type.Optional(Type.Number()),
  "fill-color-gradient": Type.Optional(GradientSchema),
  "fill-color-ref-id": Type.Optional(Type.String({ description: "Library color reference ID" })),
  "fill-color-ref-file": Type.Optional(
    Type.String({ description: "Library color reference file ID" }),
  ),
});

const StrokeSchema = Type.Object({
  "stroke-color": Type.Optional(Type.String()),
  "stroke-opacity": Type.Optional(Type.Number()),
  "stroke-width": Type.Optional(Type.Number()),
  "stroke-alignment": Type.Optional(Type.String({ description: "inner, center, or outer" })),
  "stroke-style": Type.Optional(
    Type.String({ description: "solid, dotted, dashed, mixed, none, or svg" }),
  ),
  "stroke-color-gradient": Type.Optional(GradientSchema),
  "stroke-color-ref-id": Type.Optional(Type.String({ description: "Library color reference ID" })),
  "stroke-color-ref-file": Type.Optional(
    Type.String({ description: "Library color reference file ID" }),
  ),
  "stroke-cap-start": Type.Optional(
    Type.String({
      description:
        "Start cap: round, square, line-arrow, triangle-arrow, square-marker, circle-marker, diamond-marker",
    }),
  ),
  "stroke-cap-end": Type.Optional(
    Type.String({
      description:
        "End cap: round, square, line-arrow, triangle-arrow, square-marker, circle-marker, diamond-marker",
    }),
  ),
});

const TextSpanSchema = Type.Object({
  text: Type.String(),
  fontFamily: Type.Optional(Type.String()),
  fontSize: Type.Optional(Type.String()),
  fontWeight: Type.Optional(Type.String()),
  fontStyle: Type.Optional(Type.String()),
  fillColor: Type.Optional(Type.String()),
  fillOpacity: Type.Optional(Type.Number()),
  letterSpacing: Type.Optional(Type.String()),
  lineHeight: Type.Optional(Type.String()),
  textDecoration: Type.Optional(Type.String()),
  textTransform: Type.Optional(Type.String()),
  textDirection: Type.Optional(Type.String({ description: "ltr, rtl, or auto" })),
  typographyRefId: Type.Optional(Type.String({ description: "Library typography reference ID" })),
  typographyRefFile: Type.Optional(
    Type.String({ description: "Library typography reference file ID" }),
  ),
});

const TextParagraphSchema = Type.Object({
  spans: Type.Array(TextSpanSchema),
  textAlign: Type.Optional(Type.String()),
});

const ShadowSchema = Type.Object({
  style: Type.String({ description: "drop-shadow or inner-shadow" }),
  offsetX: Type.Number({ description: "Horizontal offset" }),
  offsetY: Type.Number({ description: "Vertical offset" }),
  blur: Type.Number({ description: "Blur radius" }),
  spread: Type.Number({ description: "Spread radius" }),
  hidden: Type.Optional(Type.Boolean()),
  color: Type.String({ description: "Shadow color (hex)" }),
  colorOpacity: Type.Optional(Type.Number({ description: "Shadow color opacity 0-1" })),
});

const BlurSchema = Type.Object({
  value: Type.Number({ description: "Blur radius" }),
  hidden: Type.Optional(Type.Boolean()),
});

const ExportSchema = Type.Object({
  type: Type.String({ description: "png, jpeg, svg, pdf, or webp" }),
  scale: Type.Optional(Type.Number({ description: "Export scale (default: 1)" })),
  suffix: Type.Optional(Type.String({ description: "Filename suffix (e.g., '@2x')" })),
});

const InteractionSchema = Type.Object({
  eventType: Type.String({
    description: "click, mouse-press, mouse-over, mouse-enter, mouse-leave, or after-delay",
  }),
  actionType: Type.String({
    description: "navigate, open-overlay, toggle-overlay, close-overlay, prev-screen, or open-url",
  }),
  destination: Type.Optional(Type.String({ description: "Target frame/page ID" })),
  preserveScroll: Type.Optional(Type.Boolean()),
  delay: Type.Optional(Type.Number({ description: "Delay in ms (for after-delay)" })),
  url: Type.Optional(Type.String({ description: "URL (for open-url action)" })),
  animationType: Type.Optional(Type.String({ description: "dissolve, slide, or push" })),
  duration: Type.Optional(Type.Number({ description: "Animation duration in ms" })),
  easing: Type.Optional(
    Type.String({ description: "linear, ease, ease-in, ease-out, or ease-in-out" }),
  ),
  direction: Type.Optional(Type.String({ description: "right, left, up, or down" })),
  way: Type.Optional(Type.String({ description: "in or out" })),
  overlayPosType: Type.Optional(
    Type.String({
      description:
        "manual, center, top-left, top-right, top-center, bottom-left, bottom-right, bottom-center",
    }),
  ),
  closeClickOutside: Type.Optional(Type.Boolean()),
  backgroundOverlay: Type.Optional(Type.Boolean()),
});

const LayoutItemMarginSchema = Type.Object({
  m1: Type.Number(),
  m2: Type.Number(),
  m3: Type.Number(),
  m4: Type.Number(),
});

const PathCommandSchema = Type.Object({
  command: Type.String({ description: "move-to, line-to, curve-to, or close-path" }),
  x: Type.Optional(Type.Number()),
  y: Type.Optional(Type.Number()),
  c1x: Type.Optional(Type.Number({ description: "First control point X (curve-to)" })),
  c1y: Type.Optional(Type.Number({ description: "First control point Y (curve-to)" })),
  c2x: Type.Optional(Type.Number({ description: "Second control point X (curve-to)" })),
  c2y: Type.Optional(Type.Number({ description: "Second control point Y (curve-to)" })),
});

const GridTrackSchema = Type.Object({
  type: Type.String({ description: "flex, percent, fixed, or auto" }),
  value: Type.Optional(Type.Number()),
});

const LayoutSchema = Type.Object({
  layout: Type.Optional(Type.String({ description: "flex or grid" })),
  "layout-flex-dir": Type.Optional(
    Type.String({ description: "row, column, row-reverse, column-reverse" }),
  ),
  "layout-gap": Type.Optional(
    Type.Object({ "row-gap": Type.Number(), "column-gap": Type.Number() }),
  ),
  "layout-padding": Type.Optional(
    Type.Object({ p1: Type.Number(), p2: Type.Number(), p3: Type.Number(), p4: Type.Number() }),
  ),
  "layout-justify-content": Type.Optional(Type.String()),
  "layout-align-items": Type.Optional(Type.String()),
  "layout-align-content": Type.Optional(Type.String()),
  "layout-wrap-type": Type.Optional(Type.String()),
  "layout-grid-columns": Type.Optional(
    Type.Array(GridTrackSchema, { description: "Grid column definitions" }),
  ),
  "layout-grid-rows": Type.Optional(
    Type.Array(GridTrackSchema, { description: "Grid row definitions" }),
  ),
});

// Use Type.Unsafe for the recursive shape tree since TypeBox doesn't support recursive refs easily
const ShapeTreeSchema = Type.Unsafe<ShapeInput>(
  Type.Object({
    type: Type.String({
      description: "rect, circle, text, frame, group, path, image, or bool",
    }),
    name: Type.String({ description: "Shape name" }),
    x: Type.Number({ description: "X position" }),
    y: Type.Number({ description: "Y position" }),
    width: Type.Number({ description: "Width" }),
    height: Type.Number({ description: "Height" }),
    rotation: Type.Optional(Type.Number()),
    opacity: Type.Optional(Type.Number()),
    hidden: Type.Optional(Type.Boolean()),
    fills: Type.Optional(Type.Array(FillSchema)),
    strokes: Type.Optional(Type.Array(StrokeSchema)),
    // Rect-specific
    r1: Type.Optional(Type.Number({ description: "Top-left border radius" })),
    r2: Type.Optional(Type.Number({ description: "Top-right border radius" })),
    r3: Type.Optional(Type.Number({ description: "Bottom-right border radius" })),
    r4: Type.Optional(Type.Number({ description: "Bottom-left border radius" })),
    // Text-specific
    paragraphs: Type.Optional(Type.Array(TextParagraphSchema)),
    growType: Type.Optional(Type.String()),
    // Frame-specific
    fillColor: Type.Optional(Type.String()),
    fillOpacity: Type.Optional(Type.Number()),
    layout: Type.Optional(LayoutSchema),
    // Children (for frames, groups, and bool)
    children: Type.Optional(Type.Array(Type.Any())),
    // Path-specific
    content: Type.Optional(
      Type.Array(PathCommandSchema, { description: "Path commands (for type=path)" }),
    ),
    // Image-specific
    mediaId: Type.Optional(
      Type.String({ description: "Media object ID from penpot_upload_image (for type=image)" }),
    ),
    mediaWidth: Type.Optional(Type.Number({ description: "Media width (for type=image)" })),
    mediaHeight: Type.Optional(Type.Number({ description: "Media height (for type=image)" })),
    mediaMtype: Type.Optional(Type.String({ description: "Media MIME type (for type=image)" })),
    // Bool-specific
    boolType: Type.Optional(
      Type.String({
        description: "union, difference, intersection, or exclude (for type=bool)",
      }),
    ),
    // Effects
    shadow: Type.Optional(Type.Array(ShadowSchema, { description: "Drop or inner shadows" })),
    blur: Type.Optional(BlurSchema),
    // Constraints
    constraintsH: Type.Optional(
      Type.String({ description: "Horizontal: left, right, leftright, center, scale" }),
    ),
    constraintsV: Type.Optional(
      Type.String({ description: "Vertical: top, bottom, topbottom, center, scale" }),
    ),
    // Exports
    exports: Type.Optional(Type.Array(ExportSchema, { description: "Export settings" })),
    // Grid cell positioning (when inside a grid layout)
    gridCellRow: Type.Optional(Type.Number({ description: "Grid row (1-based)" })),
    gridCellColumn: Type.Optional(Type.Number({ description: "Grid column (1-based)" })),
    gridCellRowSpan: Type.Optional(Type.Number({ description: "Grid row span" })),
    gridCellColumnSpan: Type.Optional(Type.Number({ description: "Grid column span" })),
    // Layout child properties (when inside a flex/grid layout)
    layoutItemHSizing: Type.Optional(
      Type.String({ description: "Horizontal sizing: fill, fix, or auto" }),
    ),
    layoutItemVSizing: Type.Optional(
      Type.String({ description: "Vertical sizing: fill, fix, or auto" }),
    ),
    layoutItemAlignSelf: Type.Optional(
      Type.String({ description: "start, end, center, or stretch" }),
    ),
    layoutItemAbsolute: Type.Optional(
      Type.Boolean({ description: "Absolute positioned in layout" }),
    ),
    layoutItemZIndex: Type.Optional(Type.Number({ description: "Z-index in layout" })),
    layoutItemMinW: Type.Optional(Type.Number({ description: "Minimum width" })),
    layoutItemMaxW: Type.Optional(Type.Number({ description: "Maximum width" })),
    layoutItemMinH: Type.Optional(Type.Number({ description: "Minimum height" })),
    layoutItemMaxH: Type.Optional(Type.Number({ description: "Maximum height" })),
    layoutItemMarginType: Type.Optional(Type.String({ description: "simple or multiple" })),
    layoutItemMargin: Type.Optional(LayoutItemMarginSchema),
    // Interactions (prototyping)
    interactions: Type.Optional(
      Type.Array(InteractionSchema, { description: "Prototype interactions" }),
    ),
    // Proportion lock
    proportionLock: Type.Optional(Type.Boolean({ description: "Lock aspect ratio" })),
    // Blend mode
    blendMode: Type.Optional(
      Type.String({ description: "CSS blend mode (e.g., multiply, screen, overlay)" }),
    ),
    // Component instance
    componentId: Type.Optional(
      Type.String({ description: "Component ID this shape is an instance of" }),
    ),
    componentFile: Type.Optional(Type.String({ description: "File ID the component belongs to" })),
    componentRoot: Type.Optional(Type.Boolean({ description: "Is component root" })),
    // Frame-specific: corners and clipping
    showContent: Type.Optional(
      Type.Boolean({ description: "Show content outside frame (clip if false)" }),
    ),
    hideInViewer: Type.Optional(
      Type.Boolean({ description: "Hide frame in viewer/presentation mode" }),
    ),
    // Text-specific: vertical alignment
    verticalAlign: Type.Optional(Type.String({ description: "top, center, or bottom" })),
    // Group-specific: masking
    maskedGroup: Type.Optional(Type.Boolean({ description: "Use first child as mask" })),
    // SVG raw content
    svgContent: Type.Optional(
      Type.Object(
        {},
        { additionalProperties: true, description: "SVG content map (for type=svg-raw)" },
      ),
    ),
  }),
);

export function createDesignUiTool(client: PenpotClient): AnyAgentTool {
  return {
    name: "penpot_design_ui",
    label: "PenPot: Design UI",
    description: `Design a complete UI layout in PenPot by describing a component tree. This is the primary design tool.

Shape types: rect, circle, text, frame, group, path, image, bool, svg-raw.

Frames: children (nested shapes), layout (flex/grid), r1-r4 (border radius), showContent (clip), hideInViewer.
Text: paragraphs with spans, growType, verticalAlign. Spans support textDirection, typographyRefId/File.
Rects: r1-r4 (border radius), fills (solid, gradient, or library ref).
Path: content (array of commands: move-to, line-to, curve-to, close-path).
Image: mediaId/Width/Height/Mtype (upload first via penpot_upload_image).
Bool: boolType (union/difference/intersection/exclude) and children.
Group: maskedGroup (use first child as mask).

Any shape can have: shadow (array), blur, constraintsH/V, exports, interactions, proportionLock, blendMode.
Layout children: layoutItemHSizing/VSizing (fill/fix/auto), layoutItemAlignSelf, layoutItemAbsolute, layoutItemMinW/MaxW/MinH/MaxH, layoutItemMargin.
Fills: solid color, gradient (fill-color-gradient), or library ref (fill-color-ref-id/file).
Strokes: stroke-color-gradient, stroke-cap-start/end (arrow markers), stroke-color-ref-id/file.
Interactions: eventType + actionType for prototyping (navigate, open-overlay, open-url, etc.).
Component instances: componentId, componentFile, componentRoot.
Grid layout: layout-grid-columns/rows [{type, value}], children use gridCellRow/Column/Span.`,
    parameters: Type.Object({
      fileId: Type.String({ description: "The file ID to design in" }),
      pageId: Type.String({ description: "The page ID to add shapes to" }),
      revn: Type.Number({ description: "Current file revision number" }),
      shapes: Type.Array(ShapeTreeSchema, {
        description: "Array of shape trees to add to the page",
      }),
    }),
    async execute(_toolCallId, params) {
      const { fileId, pageId, revn, shapes } = params as {
        fileId: string;
        pageId: string;
        revn: number;
        shapes: ShapeInput[];
      };

      const sessionId = generateUuid();
      const builder = new ChangesBuilder(pageId);
      const shapeIds: string[] = [];

      for (const shape of shapes) {
        const id = builder.addShape(shape);
        shapeIds.push(id);
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
        shapesCreated: changes.filter((c) => c.type === "add-obj").length,
        rootShapeIds: shapeIds,
        newRevn: revn + 1,
      });
    },
  };
}
