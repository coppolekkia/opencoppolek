/**
 * Integration test for PenPot Design Bridge.
 *
 * Tests the full flow:
 * 1. Verify auth (get-profile)
 * 2. List teams/projects
 * 3. Create a file
 * 4. Add a page
 * 5. Design a login UI (batch)
 * 6. Add library colors/typography
 * 7. Path shape (triangle)
 * 8. Shadow + blur
 * 9. Gradient fill
 * 10. Constraints
 * 11. Export settings
 * 12. Boolean operation (union)
 * 13. Grid layout
 * 14. Image upload + shape
 * 15. Component registration
 * 16. Layout child properties
 * 17. Frame rounded corners + clip
 * 18. Text vertical-align
 * 19. Stroke caps (arrows)
 * 20. Interactions (navigate)
 * 21. Masked group
 * 22. Blend mode + proportion lock
 * 23. Stroke gradient
 * 24. Page rename
 * 25. Inspect the file to verify
 */

import type { ShapeInput } from "./src/changes.js";
import { ChangesBuilder } from "./src/changes.js";
import { PenpotClient } from "./src/client.js";
import { generateUuid } from "./src/uuid.js";

const BASE_URL = process.env.PENPOT_BASE_URL ?? "http://localhost:9001";
const ACCESS_TOKEN = process.env.PENPOT_ACCESS_TOKEN!;

if (!ACCESS_TOKEN) {
  console.error("ERROR: PENPOT_ACCESS_TOKEN not set");
  process.exit(1);
}

const client = new PenpotClient({ baseUrl: BASE_URL, accessToken: ACCESS_TOKEN });

let passed = 0;
let failed = 0;

function ok(label: string, detail?: string) {
  passed++;
  console.log(`  ✓ ${label}${detail ? ` (${detail})` : ""}`);
}

function fail(label: string, err: unknown) {
  failed++;
  console.log(`  ✗ ${label}: ${err}`);
}

async function run() {
  console.log(`\nPenPot Design Bridge — Integration Test`);
  console.log(`Endpoint: ${BASE_URL}\n`);

  // ── 1. Auth / Profile ──────────────────────────────────────────────────
  console.log("1. Auth (get-profile)");
  let profile: Record<string, unknown>;
  try {
    profile = (await client.getProfile()) as Record<string, unknown>;
    ok("get-profile", `${profile.fullname} <${profile.email}>`);
  } catch (e) {
    fail("get-profile", e);
    console.log("\nAuth failed — cannot continue.\n");
    process.exit(1);
  }

  const defaultTeamId = profile["default-team-id"] as string;
  const defaultProjectId = profile["default-project-id"] as string;

  // ── 2. List Teams & Projects ───────────────────────────────────────────
  console.log("\n2. List teams & projects");
  try {
    const teams = (await client.getTeams()) as Record<string, unknown>[];
    ok("get-teams", `${teams.length} team(s)`);

    if (defaultTeamId) {
      const projects = (await client.getProjects(defaultTeamId)) as Record<string, unknown>[];
      ok("get-projects", `${projects.length} project(s) in default team`);
    }
  } catch (e) {
    fail("get-teams/projects", e);
  }

  // ── 3. Create a File ──────────────────────────────────────────────────
  console.log("\n3. Create file");
  let fileId: string | undefined;
  let revn = 0;
  let pageId: string | undefined;

  try {
    const file = (await client.createFile(
      defaultProjectId,
      "Integration Test — Login Screen",
    )) as Record<string, unknown>;
    fileId = file.id as string;
    revn = (file.revn as number) ?? 0;

    const data = file.data as Record<string, unknown> | undefined;
    const pages = (data?.pages as string[]) ?? [];
    pageId = pages[0];

    ok("create-file", `id=${fileId}, revn=${revn}, page=${pageId}`);
  } catch (e) {
    fail("create-file", e);
  }

  if (!fileId || !pageId) {
    console.log("\nFile creation failed — cannot continue.\n");
    process.exit(1);
  }

  // ── 4. Add a Page ─────────────────────────────────────────────────────
  console.log("\n4. Add page");
  let page2Id: string | undefined;
  try {
    const sessionId = generateUuid();
    page2Id = generateUuid();
    const builder = new ChangesBuilder(page2Id);
    builder.addPage(page2Id, "Settings Page");

    await client.updateFile({
      id: fileId,
      revn,
      "session-id": sessionId,
      changes: builder.getChanges() as unknown as Record<string, unknown>[],
    });
    revn++;
    ok("add-page", `id=${page2Id}`);
  } catch (e) {
    fail("add-page", e);
  }

  // ── 5. Design Login UI (batch) ────────────────────────────────────────
  console.log("\n5. Design login UI (batch shapes)");
  let loginFrameId: string | undefined;
  try {
    const sessionId = generateUuid();
    const builder = new ChangesBuilder(pageId);

    const loginTree: ShapeInput = {
      type: "frame",
      name: "Login Screen",
      x: 0,
      y: 0,
      width: 375,
      height: 812,
      fillColor: "#F9FAFB",
      layout: {
        layout: "flex",
        "layout-flex-dir": "column",
        "layout-justify-content": "center",
        "layout-align-items": "center",
        "layout-gap": { "row-gap": 16, "column-gap": 0 },
        "layout-padding": { p1: 40, p2: 24, p3: 40, p4: 24 },
      },
      children: [
        {
          type: "text",
          name: "App Title",
          x: 0,
          y: 0,
          width: 200,
          height: 40,
          paragraphs: [
            {
              spans: [
                {
                  text: "MyApp",
                  fontSize: "32",
                  fontWeight: "700",
                  fillColor: "#1F2937",
                  fontFamily: "Inter",
                },
              ],
              textAlign: "center",
            },
          ],
        },
        {
          type: "text",
          name: "Subtitle",
          x: 0,
          y: 0,
          width: 250,
          height: 24,
          paragraphs: [
            {
              spans: [
                {
                  text: "Sign in to continue",
                  fontSize: "16",
                  fontWeight: "400",
                  fillColor: "#6B7280",
                  fontFamily: "Inter",
                },
              ],
              textAlign: "center",
            },
          ],
        },
        {
          type: "frame",
          name: "Form Container",
          x: 0,
          y: 0,
          width: 327,
          height: 200,
          fillColor: "#FFFFFF",
          layout: {
            layout: "flex",
            "layout-flex-dir": "column",
            "layout-gap": { "row-gap": 12, "column-gap": 0 },
            "layout-padding": { p1: 24, p2: 24, p3: 24, p4: 24 },
          },
          children: [
            {
              type: "rect",
              name: "Email Input",
              x: 0,
              y: 0,
              width: 279,
              height: 48,
              r1: 8,
              r2: 8,
              r3: 8,
              r4: 8,
              fills: [{ "fill-color": "#F3F4F6", "fill-opacity": 1 }],
            },
            {
              type: "rect",
              name: "Password Input",
              x: 0,
              y: 0,
              width: 279,
              height: 48,
              r1: 8,
              r2: 8,
              r3: 8,
              r4: 8,
              fills: [{ "fill-color": "#F3F4F6", "fill-opacity": 1 }],
            },
            {
              type: "rect",
              name: "Sign In Button",
              x: 0,
              y: 0,
              width: 279,
              height: 48,
              r1: 8,
              r2: 8,
              r3: 8,
              r4: 8,
              fills: [{ "fill-color": "#3B82F6", "fill-opacity": 1 }],
            },
          ],
        },
        {
          type: "text",
          name: "Forgot Password",
          x: 0,
          y: 0,
          width: 200,
          height: 20,
          paragraphs: [
            {
              spans: [
                {
                  text: "Forgot password?",
                  fontSize: "14",
                  fontWeight: "400",
                  fillColor: "#3B82F6",
                  fontFamily: "Inter",
                },
              ],
              textAlign: "center",
            },
          ],
        },
      ],
    };

    loginFrameId = builder.addShape(loginTree);
    const changes = builder.getChanges();
    const shapeCount = changes.filter((c) => c.type === "add-obj").length;

    await client.updateFile({
      id: fileId,
      revn,
      "session-id": sessionId,
      changes: changes as unknown as Record<string, unknown>[],
    });
    revn++;
    ok("design-ui (batch)", `${shapeCount} shapes created`);
  } catch (e) {
    fail("design-ui", e);
  }

  // ── 6. Library (colors & typography) ──────────────────────────────────
  console.log("\n6. Add library items");
  try {
    const sessionId = generateUuid();
    const builder = new ChangesBuilder("00000000-0000-0000-0000-000000000000");

    builder.addColor(generateUuid(), "Primary", "#3B82F6");
    builder.addColor(generateUuid(), "Background", "#F9FAFB");
    builder.addColor(generateUuid(), "Surface", "#FFFFFF");
    builder.addColor(generateUuid(), "Text Primary", "#1F2937");
    builder.addColor(generateUuid(), "Text Secondary", "#6B7280");

    builder.addTypography(generateUuid(), "Heading", "Inter", "32", "700", { lineHeight: "1.2" });
    builder.addTypography(generateUuid(), "Body", "Inter", "16", "400", { lineHeight: "1.5" });
    builder.addTypography(generateUuid(), "Caption", "Inter", "14", "400", { lineHeight: "1.4" });

    await client.updateFile({
      id: fileId,
      revn,
      "session-id": sessionId,
      changes: builder.getChanges() as unknown as Record<string, unknown>[],
    });
    revn++;
    ok("add-library", "5 colors, 3 typographies");
  } catch (e) {
    fail("add-library", e);
  }

  // ── 7. Path shape ───────────────────────────────────────────────────
  console.log("\n7. Path shape (triangle)");
  try {
    const sessionId = generateUuid();
    const builder = new ChangesBuilder(pageId);
    builder.addShape({
      type: "path",
      name: "Triangle",
      x: 400,
      y: 0,
      width: 100,
      height: 100,
      fills: [{ "fill-color": "#EF4444", "fill-opacity": 1 }],
      content: [
        { command: "move-to", x: 450, y: 0 },
        { command: "line-to", x: 500, y: 100 },
        { command: "line-to", x: 400, y: 100 },
        { command: "close-path" },
      ],
    });
    await client.updateFile({
      id: fileId,
      revn,
      "session-id": sessionId,
      changes: builder.getChanges() as unknown as Record<string, unknown>[],
    });
    revn++;
    ok("add-path", "triangle");
  } catch (e) {
    fail("add-path", e);
  }

  // ── 8. Shadow + Blur ──────────────────────────────────────────────────
  console.log("\n8. Shadow and blur");
  try {
    const sessionId = generateUuid();
    const builder = new ChangesBuilder(pageId);
    builder.addShape({
      type: "rect",
      name: "Shadow Box",
      x: 400,
      y: 120,
      width: 100,
      height: 100,
      fills: [{ "fill-color": "#FFFFFF", "fill-opacity": 1 }],
      shadow: [
        {
          style: "drop-shadow",
          offsetX: 4,
          offsetY: 4,
          blur: 8,
          spread: 0,
          color: "#000000",
          colorOpacity: 0.25,
        },
      ],
      blur: { value: 2 },
    });
    await client.updateFile({
      id: fileId,
      revn,
      "session-id": sessionId,
      changes: builder.getChanges() as unknown as Record<string, unknown>[],
    });
    revn++;
    ok("shadow+blur", "drop-shadow + layer-blur");
  } catch (e) {
    fail("shadow+blur", e);
  }

  // ── 9. Gradient fill ──────────────────────────────────────────────────
  console.log("\n9. Gradient fill");
  try {
    const sessionId = generateUuid();
    const builder = new ChangesBuilder(pageId);
    builder.addShape({
      type: "rect",
      name: "Gradient Box",
      x: 400,
      y: 240,
      width: 100,
      height: 100,
      fills: [
        {
          "fill-color-gradient": {
            type: "linear",
            "start-x": 0,
            "start-y": 0,
            "end-x": 1,
            "end-y": 1,
            width: 1,
            stops: [
              { color: "#3B82F6", offset: 0, opacity: 1 },
              { color: "#8B5CF6", offset: 1, opacity: 1 },
            ],
          },
        },
      ],
    });
    await client.updateFile({
      id: fileId,
      revn,
      "session-id": sessionId,
      changes: builder.getChanges() as unknown as Record<string, unknown>[],
    });
    revn++;
    ok("gradient-fill", "linear blue-to-purple");
  } catch (e) {
    fail("gradient-fill", e);
  }

  // ── 10. Constraints ───────────────────────────────────────────────────
  console.log("\n10. Constraints");
  try {
    const sessionId = generateUuid();
    const builder = new ChangesBuilder(pageId);
    builder.addShape({
      type: "rect",
      name: "Constrained Box",
      x: 400,
      y: 360,
      width: 100,
      height: 40,
      fills: [{ "fill-color": "#10B981", "fill-opacity": 1 }],
      constraintsH: "leftright",
      constraintsV: "top",
    });
    await client.updateFile({
      id: fileId,
      revn,
      "session-id": sessionId,
      changes: builder.getChanges() as unknown as Record<string, unknown>[],
    });
    revn++;
    ok("constraints", "leftright + top");
  } catch (e) {
    fail("constraints", e);
  }

  // ── 11. Export settings ───────────────────────────────────────────────
  console.log("\n11. Export settings");
  try {
    const sessionId = generateUuid();
    const builder = new ChangesBuilder(pageId);
    builder.addShape({
      type: "rect",
      name: "Exportable Box",
      x: 400,
      y: 420,
      width: 100,
      height: 100,
      fills: [{ "fill-color": "#F59E0B", "fill-opacity": 1 }],
      exports: [
        { type: "png", scale: 2, suffix: "@2x" },
        { type: "svg", scale: 1, suffix: "" },
      ],
    });
    await client.updateFile({
      id: fileId,
      revn,
      "session-id": sessionId,
      changes: builder.getChanges() as unknown as Record<string, unknown>[],
    });
    revn++;
    ok("exports", "png@2x + svg");
  } catch (e) {
    fail("exports", e);
  }

  // ── 12. Boolean operation ─────────────────────────────────────────────
  console.log("\n12. Boolean operation (union)");
  try {
    const sessionId = generateUuid();
    const builder = new ChangesBuilder(pageId);
    builder.addShape({
      type: "bool",
      name: "Union Shape",
      x: 400,
      y: 540,
      width: 120,
      height: 80,
      boolType: "union",
      children: [
        {
          type: "circle",
          name: "Circle A",
          x: 400,
          y: 540,
          width: 80,
          height: 80,
          fills: [{ "fill-color": "#F59E0B", "fill-opacity": 1 }],
        },
        {
          type: "circle",
          name: "Circle B",
          x: 440,
          y: 540,
          width: 80,
          height: 80,
          fills: [{ "fill-color": "#F59E0B", "fill-opacity": 1 }],
        },
      ],
    });
    await client.updateFile({
      id: fileId,
      revn,
      "session-id": sessionId,
      changes: builder.getChanges() as unknown as Record<string, unknown>[],
    });
    revn++;
    ok("bool-union", "2 circles");
  } catch (e) {
    fail("bool-union", e);
  }

  // ── 13. Grid layout ───────────────────────────────────────────────────
  console.log("\n13. Grid layout");
  try {
    const sessionId = generateUuid();
    const builder = new ChangesBuilder(pageId);
    builder.addShape({
      type: "frame",
      name: "Grid Frame",
      x: 0,
      y: 850,
      width: 375,
      height: 200,
      fillColor: "#E5E7EB",
      layout: {
        layout: "grid",
        "layout-grid-columns": [
          { type: "flex", value: 1 },
          { type: "flex", value: 1 },
        ],
        "layout-grid-rows": [
          { type: "fixed", value: 80 },
          { type: "fixed", value: 80 },
        ],
        "layout-gap": { "row-gap": 8, "column-gap": 8 },
        "layout-padding": { p1: 8, p2: 8, p3: 8, p4: 8 },
      },
      children: [
        {
          type: "rect",
          name: "Cell 1",
          x: 0,
          y: 0,
          width: 50,
          height: 50,
          fills: [{ "fill-color": "#3B82F6", "fill-opacity": 1 }],
          gridCellRow: 1,
          gridCellColumn: 1,
        },
        {
          type: "rect",
          name: "Cell 2",
          x: 0,
          y: 0,
          width: 50,
          height: 50,
          fills: [{ "fill-color": "#EF4444", "fill-opacity": 1 }],
          gridCellRow: 1,
          gridCellColumn: 2,
        },
        {
          type: "rect",
          name: "Cell 3 (span)",
          x: 0,
          y: 0,
          width: 50,
          height: 50,
          fills: [{ "fill-color": "#10B981", "fill-opacity": 1 }],
          gridCellRow: 2,
          gridCellColumn: 1,
          gridCellColumnSpan: 2,
        },
      ],
    });
    await client.updateFile({
      id: fileId,
      revn,
      "session-id": sessionId,
      changes: builder.getChanges() as unknown as Record<string, unknown>[],
    });
    revn++;
    ok("grid-layout", "2x2 with column span");
  } catch (e) {
    fail("grid-layout", e);
  }

  // ── 14. Image upload + shape ──────────────────────────────────────────
  console.log("\n14. Image (upload + shape)");
  try {
    const media = await client.createFileMediaObjectFromUrl(
      fileId,
      "https://picsum.photos/150/150",
      "Test Image",
    );
    ok("upload-image", `mediaId=${media.id}, ${media.width}x${media.height}`);

    const sessionId = generateUuid();
    const builder = new ChangesBuilder(pageId);
    builder.addShape({
      type: "image",
      name: "Test Image",
      x: 520,
      y: 0,
      width: (media.width as number) || 150,
      height: (media.height as number) || 150,
      mediaId: media.id as string,
      mediaWidth: (media.width as number) || 150,
      mediaHeight: (media.height as number) || 150,
      mediaMtype: (media.mtype as string) || "image/jpeg",
    });
    await client.updateFile({
      id: fileId,
      revn,
      "session-id": sessionId,
      changes: builder.getChanges() as unknown as Record<string, unknown>[],
    });
    revn++;
    ok("image-shape", "placed on canvas");
  } catch (e) {
    fail("image", e);
  }

  // ── 15. Component registration ────────────────────────────────────────
  console.log("\n15. Component registration");
  try {
    if (!loginFrameId) throw new Error("loginFrameId not available");
    const compId = generateUuid();
    const sessionId = generateUuid();
    const builder = new ChangesBuilder("00000000-0000-0000-0000-000000000000");
    builder.addComponent(compId, "Login Screen", loginFrameId, pageId, "Screens");
    await client.updateFile({
      id: fileId,
      revn,
      "session-id": sessionId,
      changes: builder.getChanges() as unknown as Record<string, unknown>[],
    });
    revn++;
    ok("add-component", `id=${compId}`);
  } catch (e) {
    fail("add-component", e);
  }

  // ── 16. Layout child properties ────────────────────────────────────────
  console.log("\n16. Layout child properties (fill sizing)");
  try {
    const sessionId = generateUuid();
    const builder = new ChangesBuilder(pageId);
    builder.addShape({
      type: "frame",
      name: "Layout Child Test",
      x: 520,
      y: 200,
      width: 300,
      height: 100,
      fillColor: "#F3F4F6",
      layout: {
        layout: "flex",
        "layout-flex-dir": "row",
        "layout-gap": { "row-gap": 8, "column-gap": 8 },
        "layout-padding": { p1: 8, p2: 8, p3: 8, p4: 8 },
      },
      children: [
        {
          type: "rect",
          name: "Fill Child",
          x: 0,
          y: 0,
          width: 50,
          height: 50,
          fills: [{ "fill-color": "#3B82F6", "fill-opacity": 1 }],
          layoutItemHSizing: "fill",
          layoutItemVSizing: "fix",
          layoutItemMinW: 40,
          layoutItemMaxW: 200,
        },
        {
          type: "rect",
          name: "Auto Child",
          x: 0,
          y: 0,
          width: 80,
          height: 50,
          fills: [{ "fill-color": "#EF4444", "fill-opacity": 1 }],
          layoutItemHSizing: "auto",
          layoutItemAlignSelf: "center",
        },
      ],
    });
    await client.updateFile({
      id: fileId,
      revn,
      "session-id": sessionId,
      changes: builder.getChanges() as unknown as Record<string, unknown>[],
    });
    revn++;
    ok("layout-child", "fill + auto sizing, min/max width");
  } catch (e) {
    fail("layout-child", e);
  }

  // ── 17. Frame rounded corners + clip ──────────────────────────────────
  console.log("\n17. Frame rounded corners + clip");
  try {
    const sessionId = generateUuid();
    const builder = new ChangesBuilder(pageId);
    builder.addShape({
      type: "frame",
      name: "Rounded Clipped Frame",
      x: 520,
      y: 320,
      width: 200,
      height: 120,
      fillColor: "#DBEAFE",
      r1: 16,
      r2: 16,
      r3: 16,
      r4: 16,
      showContent: false,
      children: [
        {
          type: "rect",
          name: "Overflowing Child",
          x: 520,
          y: 320,
          width: 300,
          height: 200,
          fills: [{ "fill-color": "#3B82F6", "fill-opacity": 0.5 }],
        },
      ],
    });
    await client.updateFile({
      id: fileId,
      revn,
      "session-id": sessionId,
      changes: builder.getChanges() as unknown as Record<string, unknown>[],
    });
    revn++;
    ok("frame-corners+clip", "r=16, clipped");
  } catch (e) {
    fail("frame-corners+clip", e);
  }

  // ── 18. Text vertical-align ──────────────────────────────────────────
  console.log("\n18. Text vertical-align");
  try {
    const sessionId = generateUuid();
    const builder = new ChangesBuilder(pageId);
    builder.addShape({
      type: "text",
      name: "Centered Text",
      x: 520,
      y: 460,
      width: 200,
      height: 80,
      verticalAlign: "center",
      paragraphs: [
        {
          spans: [
            {
              text: "Vertically centered",
              fontSize: "16",
              fontWeight: "400",
              fillColor: "#1F2937",
              fontFamily: "Inter",
            },
          ],
          textAlign: "center",
        },
      ],
    });
    await client.updateFile({
      id: fileId,
      revn,
      "session-id": sessionId,
      changes: builder.getChanges() as unknown as Record<string, unknown>[],
    });
    revn++;
    ok("text-valign", "center");
  } catch (e) {
    fail("text-valign", e);
  }

  // ── 19. Stroke caps (arrows) ─────────────────────────────────────────
  console.log("\n19. Stroke caps");
  try {
    const sessionId = generateUuid();
    const builder = new ChangesBuilder(pageId);
    builder.addShape({
      type: "path",
      name: "Arrow Line",
      x: 520,
      y: 560,
      width: 200,
      height: 2,
      strokes: [
        {
          "stroke-color": "#1F2937",
          "stroke-opacity": 1,
          "stroke-width": 2,
          "stroke-style": "solid",
          "stroke-cap-start": "circle-marker",
          "stroke-cap-end": "triangle-arrow",
        },
      ],
      content: [
        { command: "move-to", x: 520, y: 561 },
        { command: "line-to", x: 720, y: 561 },
      ],
    });
    await client.updateFile({
      id: fileId,
      revn,
      "session-id": sessionId,
      changes: builder.getChanges() as unknown as Record<string, unknown>[],
    });
    revn++;
    ok("stroke-caps", "circle-marker → triangle-arrow");
  } catch (e) {
    fail("stroke-caps", e);
  }

  // ── 20. Interactions (navigate) ──────────────────────────────────────
  console.log("\n20. Interactions");
  try {
    const sessionId = generateUuid();
    const builder = new ChangesBuilder(pageId);
    builder.addShape({
      type: "rect",
      name: "Interactive Button",
      x: 520,
      y: 580,
      width: 150,
      height: 48,
      r1: 8,
      r2: 8,
      r3: 8,
      r4: 8,
      fills: [{ "fill-color": "#8B5CF6", "fill-opacity": 1 }],
      interactions: [
        {
          eventType: "click",
          actionType: "navigate",
          destination: page2Id ?? pageId,
          animationType: "dissolve",
          duration: 300,
          easing: "ease-in-out",
        },
      ],
    });
    await client.updateFile({
      id: fileId,
      revn,
      "session-id": sessionId,
      changes: builder.getChanges() as unknown as Record<string, unknown>[],
    });
    revn++;
    ok("interactions", "click → navigate with dissolve");
  } catch (e) {
    fail("interactions", e);
  }

  // ── 21. Masked group ─────────────────────────────────────────────────
  console.log("\n21. Masked group");
  try {
    const sessionId = generateUuid();
    const builder = new ChangesBuilder(pageId);
    builder.addShape({
      type: "group",
      name: "Masked Group",
      x: 520,
      y: 650,
      width: 100,
      height: 100,
      maskedGroup: true,
      children: [
        {
          type: "circle",
          name: "Mask Shape",
          x: 520,
          y: 650,
          width: 100,
          height: 100,
          fills: [{ "fill-color": "#000000", "fill-opacity": 1 }],
        },
        {
          type: "rect",
          name: "Masked Content",
          x: 510,
          y: 640,
          width: 120,
          height: 120,
          fills: [{ "fill-color": "#F59E0B", "fill-opacity": 1 }],
        },
      ],
    });
    await client.updateFile({
      id: fileId,
      revn,
      "session-id": sessionId,
      changes: builder.getChanges() as unknown as Record<string, unknown>[],
    });
    revn++;
    ok("masked-group", "circle mask on rect");
  } catch (e) {
    fail("masked-group", e);
  }

  // ── 22. Blend mode + proportion lock ─────────────────────────────────
  console.log("\n22. Blend mode + proportion lock");
  try {
    const sessionId = generateUuid();
    const builder = new ChangesBuilder(pageId);
    builder.addShape({
      type: "rect",
      name: "Blended Rect",
      x: 520,
      y: 770,
      width: 100,
      height: 100,
      fills: [{ "fill-color": "#EC4899", "fill-opacity": 0.8 }],
      blendMode: "multiply",
      proportionLock: true,
    });
    await client.updateFile({
      id: fileId,
      revn,
      "session-id": sessionId,
      changes: builder.getChanges() as unknown as Record<string, unknown>[],
    });
    revn++;
    ok("blend+proportion", "multiply blend, locked");
  } catch (e) {
    fail("blend+proportion", e);
  }

  // ── 23. Stroke gradient ──────────────────────────────────────────────
  console.log("\n23. Stroke gradient");
  try {
    const sessionId = generateUuid();
    const builder = new ChangesBuilder(pageId);
    builder.addShape({
      type: "rect",
      name: "Gradient Stroke Box",
      x: 640,
      y: 770,
      width: 100,
      height: 100,
      fills: [{ "fill-color": "#FFFFFF", "fill-opacity": 1 }],
      strokes: [
        {
          "stroke-width": 3,
          "stroke-style": "solid",
          "stroke-color-gradient": {
            type: "linear",
            "start-x": 0,
            "start-y": 0,
            "end-x": 1,
            "end-y": 0,
            width: 1,
            stops: [
              { color: "#EF4444", offset: 0, opacity: 1 },
              { color: "#3B82F6", offset: 1, opacity: 1 },
            ],
          },
        },
      ],
    });
    await client.updateFile({
      id: fileId,
      revn,
      "session-id": sessionId,
      changes: builder.getChanges() as unknown as Record<string, unknown>[],
    });
    revn++;
    ok("stroke-gradient", "red-to-blue linear");
  } catch (e) {
    fail("stroke-gradient", e);
  }

  // ── 24. Page rename ──────────────────────────────────────────────────
  console.log("\n24. Page rename");
  try {
    if (!page2Id) throw new Error("page2Id not available");
    const sessionId = generateUuid();
    const builder = new ChangesBuilder(page2Id);
    builder.modPage(page2Id, "Preferences Page");
    await client.updateFile({
      id: fileId,
      revn,
      "session-id": sessionId,
      changes: builder.getChanges() as unknown as Record<string, unknown>[],
    });
    revn++;
    ok("mod-page", "renamed to 'Preferences Page'");
  } catch (e) {
    fail("mod-page", e);
  }

  // ── 25. Inspect File ──────────────────────────────────────────────────
  console.log("\n25. Inspect file (verify)");
  try {
    const file = (await client.getFile(fileId)) as Record<string, unknown>;
    const data = file.data as Record<string, unknown>;
    const pageIds = (data.pages as string[]) ?? [];
    const pagesIndex = (data["pages-index"] as Record<string, Record<string, unknown>>) ?? {};

    ok("get-file", `revn=${file.revn}, ${pageIds.length} page(s)`);

    for (const pid of pageIds) {
      const page = pagesIndex[pid];
      if (!page) continue;
      const objects = (page.objects as Record<string, unknown>) ?? {};
      const count = Object.keys(objects).length;
      ok(`  page "${page.name}"`, `${count} object(s)`);
    }
  } catch (e) {
    fail("get-file (verify)", e);
  }

  // ── Summary ───────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (fileId) {
    console.log(`\nOpen in PenPot: ${BASE_URL}/#/workspace/${fileId}`);
  }
  console.log();

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
