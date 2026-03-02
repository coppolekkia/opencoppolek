/**
 * ChangesBuilder - High-level DSL for constructing PenPot file changes.
 *
 * Translates simple shape descriptions into the low-level change format
 * expected by PenPot's update-file RPC command.
 *
 * Handles:
 * - Computing selrect and points from x,y,width,height
 * - Building text content trees (root > paragraph-set > paragraph > spans)
 * - Identity transforms
 * - Parent-child relationships
 */

import type {
  AddColorChange,
  AddComponentChange,
  AddObjChange,
  AddPageChange,
  AddTypographyChange,
  DelObjChange,
  DelPageChange,
  Fill,
  LayoutProps,
  ModObjChange,
  ModPageChange,
  MovObjectsChange,
  PenpotChange,
  Selrect,
  SetOperation,
  ShapePoints,
  ShapeType,
  Stroke,
  TextContent,
} from "./types.js";
import { ROOT_FRAME_ID, generateUuid } from "./uuid.js";

// ============================================================================
// Geometry helpers
// ============================================================================

export function computeSelrect(x: number, y: number, w: number, h: number): Selrect {
  return { x, y, width: w, height: h, x1: x, y1: y, x2: x + w, y2: y + h };
}

export function computePoints(x: number, y: number, w: number, h: number): ShapePoints {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

const IDENTITY_TRANSFORM = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

// ============================================================================
// Text content builder
// ============================================================================

export type TextSpanInput = {
  text: string;
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  fontStyle?: string;
  fillColor?: string;
  fillOpacity?: number;
  letterSpacing?: string;
  lineHeight?: string;
  textDecoration?: string;
  textTransform?: string;
  textDirection?: "ltr" | "rtl" | "auto";
  typographyRefId?: string;
  typographyRefFile?: string;
};

export type TextParagraphInput = {
  spans: TextSpanInput[];
  textAlign?: string;
};

export function buildTextContent(paragraphs: TextParagraphInput[]): TextContent {
  return {
    type: "root",
    children: [
      {
        type: "paragraph-set",
        children: paragraphs.map((p) => ({
          type: "paragraph" as const,
          ...(p.textAlign ? { "text-align": p.textAlign } : {}),
          children: p.spans.map((s) => ({
            type: "text" as const,
            text: s.text,
            ...(s.fontFamily ? { "font-family": s.fontFamily } : {}),
            ...(s.fontSize ? { "font-size": s.fontSize } : {}),
            ...(s.fontWeight ? { "font-weight": s.fontWeight } : {}),
            ...(s.fontStyle ? { "font-style": s.fontStyle } : {}),
            ...(s.fillColor ? { "fill-color": s.fillColor } : {}),
            ...(s.fillOpacity !== undefined ? { "fill-opacity": s.fillOpacity } : {}),
            ...(s.letterSpacing ? { "letter-spacing": s.letterSpacing } : {}),
            ...(s.lineHeight ? { "line-height": s.lineHeight } : {}),
            ...(s.textDecoration ? { "text-decoration": s.textDecoration } : {}),
            ...(s.textTransform ? { "text-transform": s.textTransform } : {}),
            ...(s.textDirection ? { "text-direction": s.textDirection } : {}),
            ...(s.typographyRefId ? { "typography-ref-id": s.typographyRefId } : {}),
            ...(s.typographyRefFile ? { "typography-ref-file": s.typographyRefFile } : {}),
          })),
        })),
      },
    ],
  };
}

// ============================================================================
// Shape input types (what the user/Frank provides)
// ============================================================================

export type ShadowInput = {
  style: "drop-shadow" | "inner-shadow";
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
  hidden?: boolean;
  color: string;
  colorOpacity?: number;
};

export type BlurInput = {
  value: number;
  hidden?: boolean;
};

export type ExportInput = {
  type: "png" | "jpeg" | "svg" | "pdf" | "webp";
  scale?: number;
  suffix?: string;
};

export type InteractionInput = {
  eventType: string;
  actionType: string;
  destination?: string | null;
  preserveScroll?: boolean;
  delay?: number;
  url?: string;
  animationType?: string;
  duration?: number;
  easing?: string;
  direction?: string;
  way?: "in" | "out";
  overlayPosition?: { x: number; y: number };
  overlayPosType?: string;
  closeClickOutside?: boolean;
  backgroundOverlay?: boolean;
  positionRelativeTo?: string | null;
};

export type BaseShapeInput = {
  id?: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  opacity?: number;
  hidden?: boolean;
  fills?: Fill[];
  strokes?: Stroke[];
  shadow?: ShadowInput[];
  blur?: BlurInput;
  constraintsH?: "left" | "right" | "leftright" | "center" | "scale";
  constraintsV?: "top" | "bottom" | "topbottom" | "center" | "scale";
  exports?: ExportInput[];
  gridCellRow?: number;
  gridCellColumn?: number;
  gridCellRowSpan?: number;
  gridCellColumnSpan?: number;
  // Layout child properties
  layoutItemHSizing?: "fill" | "fix" | "auto";
  layoutItemVSizing?: "fill" | "fix" | "auto";
  layoutItemAlignSelf?: "start" | "end" | "center" | "stretch";
  layoutItemAbsolute?: boolean;
  layoutItemZIndex?: number;
  layoutItemMinW?: number;
  layoutItemMaxW?: number;
  layoutItemMinH?: number;
  layoutItemMaxH?: number;
  layoutItemMarginType?: "simple" | "multiple";
  layoutItemMargin?: { m1: number; m2: number; m3: number; m4: number };
  // Interactions
  interactions?: InteractionInput[];
  // Proportion
  proportionLock?: boolean;
  proportion?: number;
  // Blend mode
  blendMode?: string;
  // Component instance
  componentId?: string;
  componentFile?: string;
  componentRoot?: boolean;
};

export type RectInput = BaseShapeInput & {
  type: "rect";
  r1?: number;
  r2?: number;
  r3?: number;
  r4?: number;
};

export type CircleInput = BaseShapeInput & {
  type: "circle";
};

export type TextInput = BaseShapeInput & {
  type: "text";
  paragraphs?: TextParagraphInput[];
  growType?: "auto-width" | "auto-height" | "fixed";
  verticalAlign?: "top" | "center" | "bottom";
};

export type FrameInput = BaseShapeInput & {
  type: "frame";
  fillColor?: string;
  fillOpacity?: number;
  layout?: LayoutProps;
  children?: ShapeInput[];
  r1?: number;
  r2?: number;
  r3?: number;
  r4?: number;
  showContent?: boolean;
  hideInViewer?: boolean;
};

export type GroupInput = BaseShapeInput & {
  type: "group";
  children?: ShapeInput[];
  maskedGroup?: boolean;
};

export type PathCommandInput = {
  command: "move-to" | "line-to" | "curve-to" | "close-path";
  x?: number;
  y?: number;
  c1x?: number;
  c1y?: number;
  c2x?: number;
  c2y?: number;
};

export type PathInput = BaseShapeInput & {
  type: "path";
  content: PathCommandInput[];
};

export type ImageInput = BaseShapeInput & {
  type: "image";
  mediaId: string;
  mediaWidth: number;
  mediaHeight: number;
  mediaMtype: string;
};

export type BoolInput = BaseShapeInput & {
  type: "bool";
  boolType: "union" | "difference" | "intersection" | "exclude";
  children: ShapeInput[];
};

export type SvgRawInput = BaseShapeInput & {
  type: "svg-raw";
  svgContent: Record<string, unknown>;
};

export type ShapeInput =
  | RectInput
  | CircleInput
  | TextInput
  | FrameInput
  | GroupInput
  | PathInput
  | ImageInput
  | BoolInput
  | SvgRawInput;

// ============================================================================
// ChangesBuilder
// ============================================================================

export class ChangesBuilder {
  private changes: PenpotChange[] = [];
  private pageId: string;

  constructor(pageId: string) {
    this.pageId = pageId;
  }

  getChanges(): PenpotChange[] {
    return this.changes;
  }

  setPageId(pageId: string) {
    this.pageId = pageId;
  }

  // --------------------------------------------------------------------------
  // Pages
  // --------------------------------------------------------------------------

  addPage(id?: string, name?: string): string {
    const pageId = id ?? generateUuid();
    const change: AddPageChange = {
      type: "add-page",
      id: pageId,
      name: name ?? "Page",
    };
    this.changes.push(change);
    return pageId;
  }

  delPage(id: string): void {
    const change: DelPageChange = { type: "del-page", id };
    this.changes.push(change);
  }

  // --------------------------------------------------------------------------
  // Shapes
  // --------------------------------------------------------------------------

  private buildShapeObj(
    input: BaseShapeInput,
    type: ShapeType,
    extra: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const { x, y, width, height } = input;
    const obj: Record<string, unknown> = {
      id: input.id ?? generateUuid(),
      name: input.name,
      type,
      x,
      y,
      width,
      height,
      rotation: input.rotation ?? 0,
      selrect: computeSelrect(x, y, width, height),
      points: computePoints(x, y, width, height),
      transform: IDENTITY_TRANSFORM,
      "transform-inverse": IDENTITY_TRANSFORM,
      "proportion-lock": false,
      ...(input.opacity !== undefined ? { opacity: input.opacity } : {}),
      ...(input.hidden !== undefined ? { hidden: input.hidden } : {}),
      ...(input.fills ? { fills: input.fills } : {}),
      ...(input.strokes ? { strokes: input.strokes } : {}),
      ...extra,
    };

    // Shadow
    if (input.shadow) {
      obj.shadow = input.shadow.map((s) => ({
        id: generateUuid(),
        style: s.style,
        "offset-x": s.offsetX,
        "offset-y": s.offsetY,
        blur: s.blur,
        spread: s.spread,
        hidden: s.hidden ?? false,
        color: { color: s.color, opacity: s.colorOpacity ?? 1 },
      }));
    }

    // Blur
    if (input.blur) {
      obj.blur = {
        id: generateUuid(),
        type: "layer-blur",
        value: input.blur.value,
        hidden: input.blur.hidden ?? false,
      };
    }

    // Constraints
    if (input.constraintsH) obj["constraints-h"] = input.constraintsH;
    if (input.constraintsV) obj["constraints-v"] = input.constraintsV;

    // Exports
    if (input.exports) {
      obj.exports = input.exports.map((e) => ({
        type: e.type,
        scale: e.scale ?? 1,
        suffix: e.suffix ?? "",
      }));
    }

    // Grid cell positioning
    if (input.gridCellRow !== undefined) obj["layout-grid-cell-row"] = input.gridCellRow;
    if (input.gridCellColumn !== undefined) obj["layout-grid-cell-column"] = input.gridCellColumn;
    if (input.gridCellRowSpan !== undefined)
      obj["layout-grid-cell-row-span"] = input.gridCellRowSpan;
    if (input.gridCellColumnSpan !== undefined)
      obj["layout-grid-cell-column-span"] = input.gridCellColumnSpan;

    // Layout child properties
    if (input.layoutItemHSizing) obj["layout-item-h-sizing"] = input.layoutItemHSizing;
    if (input.layoutItemVSizing) obj["layout-item-v-sizing"] = input.layoutItemVSizing;
    if (input.layoutItemAlignSelf) obj["layout-item-align-self"] = input.layoutItemAlignSelf;
    if (input.layoutItemAbsolute !== undefined)
      obj["layout-item-absolute"] = input.layoutItemAbsolute;
    if (input.layoutItemZIndex !== undefined) obj["layout-item-z-index"] = input.layoutItemZIndex;
    if (input.layoutItemMinW !== undefined) obj["layout-item-min-w"] = input.layoutItemMinW;
    if (input.layoutItemMaxW !== undefined) obj["layout-item-max-w"] = input.layoutItemMaxW;
    if (input.layoutItemMinH !== undefined) obj["layout-item-min-h"] = input.layoutItemMinH;
    if (input.layoutItemMaxH !== undefined) obj["layout-item-max-h"] = input.layoutItemMaxH;
    if (input.layoutItemMarginType) obj["layout-item-margin-type"] = input.layoutItemMarginType;
    if (input.layoutItemMargin) obj["layout-item-margin"] = input.layoutItemMargin;

    // Interactions
    if (input.interactions) {
      obj.interactions = input.interactions.map((i) => ({
        "event-type": i.eventType,
        "action-type": i.actionType,
        ...(i.destination !== undefined ? { destination: i.destination } : {}),
        ...(i.preserveScroll !== undefined ? { "preserve-scroll": i.preserveScroll } : {}),
        ...(i.delay !== undefined ? { delay: i.delay } : {}),
        ...(i.url ? { url: i.url } : {}),
        ...(i.animationType ? { "animation-type": i.animationType } : {}),
        ...(i.duration !== undefined ? { duration: i.duration } : {}),
        ...(i.easing ? { easing: i.easing } : {}),
        ...(i.direction ? { direction: i.direction } : {}),
        ...(i.way ? { way: i.way } : {}),
        ...(i.overlayPosition ? { "overlay-position": i.overlayPosition } : {}),
        ...(i.overlayPosType ? { "overlay-pos-type": i.overlayPosType } : {}),
        ...(i.closeClickOutside !== undefined
          ? { "close-click-outside": i.closeClickOutside }
          : {}),
        ...(i.backgroundOverlay !== undefined ? { "background-overlay": i.backgroundOverlay } : {}),
        ...(i.positionRelativeTo !== undefined
          ? { "position-relative-to": i.positionRelativeTo }
          : {}),
      }));
    }

    // Proportion
    if (input.proportionLock !== undefined) obj["proportion-lock"] = input.proportionLock;
    if (input.proportion !== undefined) obj.proportion = input.proportion;

    // Blend mode
    if (input.blendMode) obj["blend-mode"] = input.blendMode;

    // Component instance
    if (input.componentId) obj["component-id"] = input.componentId;
    if (input.componentFile) obj["component-file"] = input.componentFile;
    if (input.componentRoot !== undefined) obj["component-root"] = input.componentRoot;

    return obj;
  }

  addRect(
    input: RectInput,
    parentId: string = ROOT_FRAME_ID,
    frameId: string = ROOT_FRAME_ID,
  ): string {
    const extra: Record<string, unknown> = {};
    if (input.r1 !== undefined) extra.r1 = input.r1;
    if (input.r2 !== undefined) extra.r2 = input.r2;
    if (input.r3 !== undefined) extra.r3 = input.r3;
    if (input.r4 !== undefined) extra.r4 = input.r4;

    const obj = this.buildShapeObj(input, "rect", extra);
    obj["frame-id"] = frameId;
    obj["parent-id"] = parentId;
    const id = obj.id as string;

    const change: AddObjChange = {
      type: "add-obj",
      id,
      "page-id": this.pageId,
      "frame-id": frameId,
      "parent-id": parentId,
      obj,
    };
    this.changes.push(change);
    return id;
  }

  addCircle(
    input: CircleInput,
    parentId: string = ROOT_FRAME_ID,
    frameId: string = ROOT_FRAME_ID,
  ): string {
    const obj = this.buildShapeObj(input, "circle");
    obj["frame-id"] = frameId;
    obj["parent-id"] = parentId;
    const id = obj.id as string;

    const change: AddObjChange = {
      type: "add-obj",
      id,
      "page-id": this.pageId,
      "frame-id": frameId,
      "parent-id": parentId,
      obj,
    };
    this.changes.push(change);
    return id;
  }

  addText(
    input: TextInput,
    parentId: string = ROOT_FRAME_ID,
    frameId: string = ROOT_FRAME_ID,
  ): string {
    const extra: Record<string, unknown> = {};

    if (input.paragraphs) {
      extra.content = buildTextContent(input.paragraphs);
    }
    if (input.growType) {
      extra["grow-type"] = input.growType;
    }
    if (input.verticalAlign) {
      extra["vertical-align"] = input.verticalAlign;
    }

    const obj = this.buildShapeObj(input, "text", extra);
    obj["frame-id"] = frameId;
    obj["parent-id"] = parentId;
    const id = obj.id as string;

    const change: AddObjChange = {
      type: "add-obj",
      id,
      "page-id": this.pageId,
      "frame-id": frameId,
      "parent-id": parentId,
      obj,
    };
    this.changes.push(change);
    return id;
  }

  addFrame(
    input: FrameInput,
    parentId: string = ROOT_FRAME_ID,
    frameId: string = ROOT_FRAME_ID,
  ): string {
    const extra: Record<string, unknown> = {
      shapes: [],
    };

    if (input.fillColor) {
      extra.fills = [{ "fill-color": input.fillColor, "fill-opacity": input.fillOpacity ?? 1 }];
    }

    // Frame corners
    if (input.r1 !== undefined) extra.r1 = input.r1;
    if (input.r2 !== undefined) extra.r2 = input.r2;
    if (input.r3 !== undefined) extra.r3 = input.r3;
    if (input.r4 !== undefined) extra.r4 = input.r4;

    // Frame-specific properties
    if (input.showContent !== undefined) extra["show-content"] = input.showContent;
    if (input.hideInViewer !== undefined) extra["hide-in-viewer"] = input.hideInViewer;

    // Layout properties
    if (input.layout) {
      const lp = input.layout;
      if (lp.layout) extra.layout = lp.layout;
      if (lp["layout-flex-dir"]) extra["layout-flex-dir"] = lp["layout-flex-dir"];
      if (lp["layout-gap"]) extra["layout-gap"] = lp["layout-gap"];
      if (lp["layout-padding"]) extra["layout-padding"] = lp["layout-padding"];
      if (lp["layout-justify-content"])
        extra["layout-justify-content"] = lp["layout-justify-content"];
      if (lp["layout-align-items"]) extra["layout-align-items"] = lp["layout-align-items"];
      if (lp["layout-align-content"]) extra["layout-align-content"] = lp["layout-align-content"];
      if (lp["layout-wrap-type"]) extra["layout-wrap-type"] = lp["layout-wrap-type"];
      if (lp["layout-grid-columns"]) extra["layout-grid-columns"] = lp["layout-grid-columns"];
      if (lp["layout-grid-rows"]) extra["layout-grid-rows"] = lp["layout-grid-rows"];
    }

    const obj = this.buildShapeObj(input, "frame", extra);
    obj["frame-id"] = frameId;
    obj["parent-id"] = parentId;
    const id = obj.id as string;

    const change: AddObjChange = {
      type: "add-obj",
      id,
      "page-id": this.pageId,
      "frame-id": frameId,
      "parent-id": parentId,
      obj,
    };
    this.changes.push(change);

    // Recursively add children
    if (input.children) {
      for (const child of input.children) {
        this.addShape(child, id, id);
      }
    }

    return id;
  }

  addGroup(
    input: GroupInput,
    parentId: string = ROOT_FRAME_ID,
    frameId: string = ROOT_FRAME_ID,
  ): string {
    const extra: Record<string, unknown> = { shapes: [] };
    if (input.maskedGroup !== undefined) extra["masked-group"] = input.maskedGroup;

    const obj = this.buildShapeObj(input, "group", extra);
    obj["frame-id"] = frameId;
    obj["parent-id"] = parentId;
    const id = obj.id as string;

    const change: AddObjChange = {
      type: "add-obj",
      id,
      "page-id": this.pageId,
      "frame-id": frameId,
      "parent-id": parentId,
      obj,
    };
    this.changes.push(change);

    if (input.children) {
      for (const child of input.children) {
        this.addShape(child, id, frameId);
      }
    }

    return id;
  }

  addPath(
    input: PathInput,
    parentId: string = ROOT_FRAME_ID,
    frameId: string = ROOT_FRAME_ID,
  ): string {
    const content = input.content.map((cmd) => {
      const params: Record<string, unknown> = {};
      if (cmd.x !== undefined) params.x = cmd.x;
      if (cmd.y !== undefined) params.y = cmd.y;
      if (cmd.c1x !== undefined) params.c1x = cmd.c1x;
      if (cmd.c1y !== undefined) params.c1y = cmd.c1y;
      if (cmd.c2x !== undefined) params.c2x = cmd.c2x;
      if (cmd.c2y !== undefined) params.c2y = cmd.c2y;
      return { command: cmd.command, params };
    });

    const obj = this.buildShapeObj(input, "path", { content });
    obj["frame-id"] = frameId;
    obj["parent-id"] = parentId;
    const id = obj.id as string;

    const change: AddObjChange = {
      type: "add-obj",
      id,
      "page-id": this.pageId,
      "frame-id": frameId,
      "parent-id": parentId,
      obj,
    };
    this.changes.push(change);
    return id;
  }

  addImage(
    input: ImageInput,
    parentId: string = ROOT_FRAME_ID,
    frameId: string = ROOT_FRAME_ID,
  ): string {
    const extra: Record<string, unknown> = {
      metadata: {
        id: input.mediaId,
        width: input.mediaWidth,
        height: input.mediaHeight,
        mtype: input.mediaMtype,
      },
    };

    const obj = this.buildShapeObj(input, "image", extra);
    obj["frame-id"] = frameId;
    obj["parent-id"] = parentId;
    const id = obj.id as string;

    const change: AddObjChange = {
      type: "add-obj",
      id,
      "page-id": this.pageId,
      "frame-id": frameId,
      "parent-id": parentId,
      obj,
    };
    this.changes.push(change);
    return id;
  }

  addBool(
    input: BoolInput,
    parentId: string = ROOT_FRAME_ID,
    frameId: string = ROOT_FRAME_ID,
  ): string {
    // Pre-generate IDs for children so we can include them in shapes array
    const childIds: string[] = [];
    const childInputs = input.children ?? [];
    for (const child of childInputs) {
      const childId = child.id ?? generateUuid();
      child.id = childId;
      childIds.push(childId);
    }

    const extra: Record<string, unknown> = {
      shapes: childIds,
      "bool-type": input.boolType,
      // Bool shapes require content (path description of the result).
      // Provide a minimal placeholder; Penpot recomputes on open.
      content: [],
    };

    const obj = this.buildShapeObj(input, "bool", extra);
    obj["frame-id"] = frameId;
    obj["parent-id"] = parentId;
    const id = obj.id as string;

    const change: AddObjChange = {
      type: "add-obj",
      id,
      "page-id": this.pageId,
      "frame-id": frameId,
      "parent-id": parentId,
      obj,
    };
    this.changes.push(change);

    for (const child of childInputs) {
      this.addShape(child, id, frameId);
    }

    return id;
  }

  addSvgRaw(
    input: SvgRawInput,
    parentId: string = ROOT_FRAME_ID,
    frameId: string = ROOT_FRAME_ID,
  ): string {
    const extra: Record<string, unknown> = {
      content: input.svgContent,
    };

    const obj = this.buildShapeObj(input, "svg-raw", extra);
    obj["frame-id"] = frameId;
    obj["parent-id"] = parentId;
    const id = obj.id as string;

    const change: AddObjChange = {
      type: "add-obj",
      id,
      "page-id": this.pageId,
      "frame-id": frameId,
      "parent-id": parentId,
      obj,
    };
    this.changes.push(change);
    return id;
  }

  /**
   * Add any shape type, dispatching to the appropriate method.
   */
  addShape(
    input: ShapeInput,
    parentId: string = ROOT_FRAME_ID,
    frameId: string = ROOT_FRAME_ID,
  ): string {
    switch (input.type) {
      case "rect":
        return this.addRect(input, parentId, frameId);
      case "circle":
        return this.addCircle(input, parentId, frameId);
      case "text":
        return this.addText(input, parentId, frameId);
      case "frame":
        return this.addFrame(input, parentId, frameId);
      case "group":
        return this.addGroup(input, parentId, frameId);
      case "path":
        return this.addPath(input, parentId, frameId);
      case "image":
        return this.addImage(input, parentId, frameId);
      case "bool":
        return this.addBool(input, parentId, frameId);
      case "svg-raw":
        return this.addSvgRaw(input, parentId, frameId);
      default:
        throw new Error(`Unknown shape type: ${(input as ShapeInput).type}`);
    }
  }

  // --------------------------------------------------------------------------
  // Modifications
  // --------------------------------------------------------------------------

  modShape(shapeId: string, attrs: Record<string, unknown>): void {
    const operations: SetOperation[] = Object.entries(attrs).map(([attr, val]) => ({
      type: "set",
      attr,
      val,
    }));

    const change: ModObjChange = {
      type: "mod-obj",
      id: shapeId,
      "page-id": this.pageId,
      operations,
    };
    this.changes.push(change);
  }

  delShape(shapeId: string): void {
    const change: DelObjChange = {
      type: "del-obj",
      id: shapeId,
      "page-id": this.pageId,
    };
    this.changes.push(change);
  }

  moveShapes(shapeIds: string[], newParentId: string, index?: number): void {
    const change: MovObjectsChange = {
      type: "mov-objects",
      "page-id": this.pageId,
      "parent-id": newParentId,
      shapes: shapeIds,
      ...(index !== undefined ? { index } : {}),
    };
    this.changes.push(change);
  }

  modPage(pageId: string, name: string): void {
    const change: ModPageChange = { type: "mod-page", id: pageId, name };
    this.changes.push(change);
  }

  // --------------------------------------------------------------------------
  // Library
  // --------------------------------------------------------------------------

  addColor(id: string, name: string, color: string, opacity: number = 1): void {
    const change: AddColorChange = {
      type: "add-color",
      color: { id, name, color, opacity },
    };
    this.changes.push(change);
  }

  addTypography(
    id: string,
    name: string,
    fontFamily: string,
    fontSize: string,
    fontWeight: string = "400",
    opts: {
      fontId?: string;
      fontVariantId?: string;
      fontStyle?: string;
      lineHeight?: string;
      letterSpacing?: string;
      textTransform?: string;
    } = {},
  ): void {
    const change: AddTypographyChange = {
      type: "add-typography",
      typography: {
        id,
        name,
        "font-id": opts.fontId ?? fontFamily.toLowerCase().replace(/\s+/g, "-"),
        "font-family": fontFamily,
        "font-variant-id": opts.fontVariantId ?? "regular",
        "font-size": fontSize,
        "font-weight": fontWeight,
        "font-style": opts.fontStyle ?? "normal",
        "line-height": opts.lineHeight ?? "1.2",
        "letter-spacing": opts.letterSpacing ?? "0",
        "text-transform": opts.textTransform ?? "none",
      },
    };
    this.changes.push(change);
  }

  addComponent(
    id: string,
    name: string,
    mainInstanceId: string,
    mainInstancePage: string,
    path?: string,
  ): void {
    const change: AddComponentChange = {
      type: "add-component",
      id,
      name,
      "main-instance-id": mainInstanceId,
      "main-instance-page": mainInstancePage,
      ...(path ? { path } : {}),
    };
    this.changes.push(change);
  }
}
