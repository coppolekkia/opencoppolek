/**
 * TypeScript types for PenPot shapes, changes, and operations.
 * Mirrors the Clojure specs in penpot/common/src/app/common/types/shape.cljc
 * and penpot/common/src/app/common/files/changes.cljc
 */

// ============================================================================
// Geometry
// ============================================================================

export type Point = { x: number; y: number };

export type Selrect = {
  x: number;
  y: number;
  width: number;
  height: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

/** Four corners: top-left, top-right, bottom-right, bottom-left */
export type ShapePoints = [Point, Point, Point, Point];

// ============================================================================
// Fill & Stroke
// ============================================================================

export type GradientStop = {
  color: string;
  offset: number;
  opacity: number;
};

export type Gradient = {
  type: "linear" | "radial";
  "start-x": number;
  "start-y": number;
  "end-x": number;
  "end-y": number;
  width: number;
  stops: GradientStop[];
};

export type Fill = {
  "fill-color"?: string;
  "fill-opacity"?: number;
  "fill-color-gradient"?: Gradient;
  "fill-color-ref-id"?: string;
  "fill-color-ref-file"?: string;
};

export type Stroke = {
  "stroke-color"?: string;
  "stroke-opacity"?: number;
  "stroke-width"?: number;
  "stroke-alignment"?: "inner" | "center" | "outer";
  "stroke-style"?: "solid" | "dotted" | "dashed" | "mixed" | "none" | "svg";
  "stroke-color-gradient"?: Gradient;
  "stroke-color-ref-id"?: string;
  "stroke-color-ref-file"?: string;
  "stroke-cap-start"?:
    | "round"
    | "square"
    | "line-arrow"
    | "triangle-arrow"
    | "square-marker"
    | "circle-marker"
    | "diamond-marker";
  "stroke-cap-end"?:
    | "round"
    | "square"
    | "line-arrow"
    | "triangle-arrow"
    | "square-marker"
    | "circle-marker"
    | "diamond-marker";
};

// ============================================================================
// Path Content
// ============================================================================

export type PathCommandMoveTo = { command: "move-to"; x: number; y: number };
export type PathCommandLineTo = { command: "line-to"; x: number; y: number };
export type PathCommandCurveTo = {
  command: "curve-to";
  x: number;
  y: number;
  c1x: number;
  c1y: number;
  c2x: number;
  c2y: number;
};
export type PathCommandClosePath = { command: "close-path" };

export type PathCommand =
  | PathCommandMoveTo
  | PathCommandLineTo
  | PathCommandCurveTo
  | PathCommandClosePath;

// ============================================================================
// Effects (Shadow, Blur)
// ============================================================================

export type Shadow = {
  id: string;
  style: "drop-shadow" | "inner-shadow";
  "offset-x": number;
  "offset-y": number;
  blur: number;
  spread: number;
  hidden?: boolean;
  color: { color: string; opacity: number };
};

export type Blur = {
  id: string;
  type: "layer-blur";
  value: number;
  hidden?: boolean;
};

// ============================================================================
// Exports
// ============================================================================

export type ExportSetting = {
  type: "png" | "jpeg" | "svg" | "pdf" | "webp";
  scale: number;
  suffix: string;
};

// ============================================================================
// Constraints
// ============================================================================

export type ConstraintH = "left" | "right" | "leftright" | "center" | "scale";
export type ConstraintV = "top" | "bottom" | "topbottom" | "center" | "scale";

// ============================================================================
// Text Content
// ============================================================================

export type TextSpan = {
  type: "text";
  text: string;
  "font-family"?: string;
  "font-size"?: string;
  "font-weight"?: string;
  "font-style"?: string;
  "fill-color"?: string;
  "fill-opacity"?: number;
  "letter-spacing"?: string;
  "line-height"?: string;
  "text-decoration"?: string;
  "text-transform"?: string;
  "text-direction"?: "ltr" | "rtl" | "auto";
  "typography-ref-id"?: string;
  "typography-ref-file"?: string;
};

export type TextParagraph = {
  type: "paragraph";
  children: TextSpan[];
  "text-align"?: string;
};

export type TextParagraphSet = {
  type: "paragraph-set";
  children: TextParagraph[];
};

export type TextContent = {
  type: "root";
  children: TextParagraphSet[];
};

// ============================================================================
// Layout (Flex/Grid)
// ============================================================================

export type LayoutType = "flex" | "grid";
export type FlexDirection = "row" | "row-reverse" | "column" | "column-reverse";
export type JustifyContent =
  | "start"
  | "center"
  | "end"
  | "space-between"
  | "space-around"
  | "space-evenly";
export type AlignItems = "start" | "center" | "end" | "stretch";
export type AlignContent =
  | "start"
  | "center"
  | "end"
  | "space-between"
  | "space-around"
  | "space-evenly"
  | "stretch";

export type GridTrackType = "flex" | "percent" | "fixed" | "auto";

export type GridTrack = {
  type: GridTrackType;
  value?: number;
};

export type LayoutProps = {
  layout?: LayoutType;
  "layout-flex-dir"?: FlexDirection;
  "layout-gap"?: { "row-gap": number; "column-gap": number };
  "layout-padding"?: { p1: number; p2: number; p3: number; p4: number };
  "layout-justify-content"?: JustifyContent;
  "layout-align-items"?: AlignItems;
  "layout-align-content"?: AlignContent;
  "layout-wrap-type"?: "wrap" | "nowrap";
  "layout-grid-columns"?: GridTrack[];
  "layout-grid-rows"?: GridTrack[];
};

// ============================================================================
// Interactions
// ============================================================================

export type InteractionEventType =
  | "click"
  | "mouse-press"
  | "mouse-over"
  | "mouse-enter"
  | "mouse-leave"
  | "after-delay";

export type InteractionActionType =
  | "navigate"
  | "open-overlay"
  | "toggle-overlay"
  | "close-overlay"
  | "prev-screen"
  | "open-url";

export type AnimationType = "dissolve" | "slide" | "push";
export type AnimationEasing = "linear" | "ease" | "ease-in" | "ease-out" | "ease-in-out";
export type AnimationDirection = "right" | "left" | "up" | "down";

export type OverlayPosType =
  | "manual"
  | "center"
  | "top-left"
  | "top-right"
  | "top-center"
  | "bottom-left"
  | "bottom-right"
  | "bottom-center";

export type Interaction = {
  "event-type": InteractionEventType;
  "action-type": InteractionActionType;
  destination?: string | null;
  "preserve-scroll"?: boolean;
  delay?: number;
  url?: string;
  "animation-type"?: AnimationType;
  duration?: number;
  easing?: AnimationEasing;
  direction?: AnimationDirection;
  way?: "in" | "out";
  "overlay-position"?: Point;
  "overlay-pos-type"?: OverlayPosType;
  "close-click-outside"?: boolean;
  "background-overlay"?: boolean;
  "position-relative-to"?: string | null;
};

// ============================================================================
// Layout Child Properties
// ============================================================================

export type LayoutItemSizing = "fill" | "fix" | "auto";
export type LayoutItemAlignSelf = "start" | "end" | "center" | "stretch";

export type LayoutChildProps = {
  "layout-item-h-sizing"?: LayoutItemSizing;
  "layout-item-v-sizing"?: LayoutItemSizing;
  "layout-item-align-self"?: LayoutItemAlignSelf;
  "layout-item-absolute"?: boolean;
  "layout-item-z-index"?: number;
  "layout-item-min-w"?: number;
  "layout-item-max-w"?: number;
  "layout-item-min-h"?: number;
  "layout-item-max-h"?: number;
  "layout-item-margin-type"?: "simple" | "multiple";
  "layout-item-margin"?: { m1: number; m2: number; m3: number; m4: number };
};

// ============================================================================
// Shape Types
// ============================================================================

export type ShapeType =
  | "rect"
  | "circle"
  | "text"
  | "frame"
  | "path"
  | "group"
  | "image"
  | "bool"
  | "svg-raw";

export type ShapeBase = {
  id: string;
  name: string;
  type: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  opacity?: number;
  hidden?: boolean;
  blocked?: boolean;
  fills?: Fill[];
  strokes?: Stroke[];
  "blend-mode"?: string;
  selrect?: Selrect;
  points?: ShapePoints;
  transform?: { a: number; b: number; c: number; d: number; e: number; f: number };
  "transform-inverse"?: { a: number; b: number; c: number; d: number; e: number; f: number };
  /** Child shape IDs (for frames/groups) */
  shapes?: string[];
  /** Parent frame ID */
  "frame-id"?: string;
  /** Parent shape ID */
  "parent-id"?: string;
  shadow?: Shadow[];
  blur?: Blur;
  "constraints-h"?: ConstraintH;
  "constraints-v"?: ConstraintV;
  exports?: ExportSetting[];
  interactions?: Interaction[];
  "proportion-lock"?: boolean;
  proportion?: number;
  "blend-mode"?: string;
  "component-id"?: string;
  "component-file"?: string;
  "component-root"?: boolean;
  "masked-group"?: boolean;
} & LayoutChildProps;

export type RectShape = ShapeBase & {
  type: "rect";
  r1?: number;
  r2?: number;
  r3?: number;
  r4?: number;
};

export type CircleShape = ShapeBase & {
  type: "circle";
};

export type TextShape = ShapeBase & {
  type: "text";
  content?: TextContent;
  "grow-type"?: "auto-width" | "auto-height" | "fixed";
  "vertical-align"?: "top" | "center" | "bottom";
};

export type FrameShape = ShapeBase & {
  type: "frame";
  "fill-color"?: string;
  "fill-opacity"?: number;
  "hide-fill-on-export"?: boolean;
  "show-content"?: boolean;
  "hide-in-viewer"?: boolean;
  r1?: number;
  r2?: number;
  r3?: number;
  r4?: number;
  shapes: string[];
} & LayoutProps;

export type GroupShape = ShapeBase & {
  type: "group";
  shapes: string[];
};

export type PathShape = ShapeBase & {
  type: "path";
  content: PathCommand[];
};

export type ImageShape = ShapeBase & {
  type: "image";
  metadata: {
    id: string;
    width: number;
    height: number;
    mtype: string;
  };
};

export type BoolShape = ShapeBase & {
  type: "bool";
  "bool-type": "union" | "difference" | "intersection" | "exclude";
  shapes: string[];
  "bool-content"?: PathCommand[];
};

export type SvgRawShape = ShapeBase & {
  type: "svg-raw";
  content: Record<string, unknown>;
};

export type PenpotShape =
  | RectShape
  | CircleShape
  | TextShape
  | FrameShape
  | GroupShape
  | PathShape
  | ImageShape
  | BoolShape
  | SvgRawShape;

// ============================================================================
// Changes
// ============================================================================

export type SetOperation = {
  type: "set";
  attr: string;
  val: unknown;
};

export type AddObjChange = {
  type: "add-obj";
  id: string;
  "page-id": string;
  "frame-id": string;
  "parent-id": string;
  obj: Record<string, unknown>;
  "ignore-touched"?: boolean;
};

export type ModObjChange = {
  type: "mod-obj";
  id: string;
  "page-id": string;
  operations: SetOperation[];
};

export type DelObjChange = {
  type: "del-obj";
  id: string;
  "page-id": string;
};

export type AddPageChange = {
  type: "add-page";
  id: string;
  name: string;
};

export type ModPageChange = {
  type: "mod-page";
  id: string;
  name: string;
};

export type DelPageChange = {
  type: "del-page";
  id: string;
};

export type MovObjectsChange = {
  type: "mov-objects";
  "page-id": string;
  "parent-id": string;
  shapes: string[];
  index?: number;
};

export type AddColorChange = {
  type: "add-color";
  color: {
    id: string;
    name: string;
    color: string;
    opacity: number;
  };
};

export type AddTypographyChange = {
  type: "add-typography";
  typography: {
    id: string;
    name: string;
    "font-id": string;
    "font-family": string;
    "font-variant-id": string;
    "font-size": string;
    "font-weight": string;
    "font-style": string;
    "line-height": string;
    "letter-spacing": string;
    "text-transform": string;
  };
};

export type AddComponentChange = {
  type: "add-component";
  id: string;
  name: string;
  path?: string;
  "main-instance-id": string;
  "main-instance-page": string;
};

export type PenpotChange =
  | AddObjChange
  | ModObjChange
  | DelObjChange
  | AddPageChange
  | ModPageChange
  | DelPageChange
  | MovObjectsChange
  | AddColorChange
  | AddTypographyChange
  | AddComponentChange;

// ============================================================================
// API Types
// ============================================================================

export type PenpotTeam = {
  id: string;
  name: string;
};

export type PenpotProject = {
  id: string;
  name: string;
  "team-id": string;
  "created-at"?: string;
  "modified-at"?: string;
};

export type PenpotFile = {
  id: string;
  name: string;
  "project-id": string;
  revn: number;
  vern?: number;
  data?: PenpotFileData;
};

export type PenpotFileData = {
  pages: string[];
  "pages-index": Record<string, PenpotPageData>;
};

export type PenpotPageData = {
  id: string;
  name: string;
  objects: Record<string, Record<string, unknown>>;
};

export type PenpotProfile = {
  id: string;
  email: string;
  fullname: string;
  "default-team-id": string;
  "default-project-id": string;
};

export type UpdateFileParams = {
  id: string;
  revn: number;
  vern?: number;
  "session-id": string;
  changes: PenpotChange[];
};
