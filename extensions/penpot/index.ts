/**
 * OpenClaw PenPot Design Bridge Plugin
 *
 * Provides direct access to PenPot's backend RPC API for headless,
 * programmatic design operations. No browser or MCP required.
 *
 * Tools registered:
 * - penpot_list_projects: List teams and projects
 * - penpot_create_file: Create a new design file
 * - penpot_inspect_file: Read file structure
 * - penpot_add_page: Add a page to a file
 * - penpot_design_ui: Design complete UIs (batch, primary tool)
 * - penpot_update_file: Low-level shape operations
 * - penpot_manage_library: Colors and typography management
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { PenpotClient } from "./src/client.js";
import { createDesignUiTool } from "./src/tools/design.js";
import { createCreateFileTool, createInspectFileTool } from "./src/tools/files.js";
import { createUploadImageTool } from "./src/tools/images.js";
import { createManageLibraryTool } from "./src/tools/library.js";
import { createAddPageTool } from "./src/tools/pages.js";
import { createListProjectsTool } from "./src/tools/projects.js";
import { createUpdateFileTool } from "./src/tools/update.js";

// ============================================================================
// Config
// ============================================================================

type PenpotConfig = {
  accessToken: string;
  baseUrl: string;
};

function resolveEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, envVar) => {
    const envValue = process.env[envVar];
    if (!envValue) {
      throw new Error(`Environment variable ${envVar} is not set`);
    }
    return envValue;
  });
}

const configSchema = {
  parse(value: unknown): PenpotConfig {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("penpot config required (accessToken, baseUrl)");
    }
    const cfg = value as Record<string, unknown>;

    if (typeof cfg.accessToken !== "string" || !cfg.accessToken) {
      throw new Error("penpot: accessToken is required");
    }

    const baseUrl = typeof cfg.baseUrl === "string" ? cfg.baseUrl : "https://design.penpot.app";

    return {
      accessToken: resolveEnvVars(cfg.accessToken),
      baseUrl: resolveEnvVars(baseUrl),
    };
  },
};

// ============================================================================
// Plugin Definition
// ============================================================================

const penpotPlugin = {
  id: "penpot",
  name: "PenPot Design Bridge",
  description: "Direct PenPot backend integration for headless design operations",

  configSchema,

  register(api: OpenClawPluginApi) {
    const cfg = configSchema.parse(api.pluginConfig);
    const client = new PenpotClient({
      baseUrl: cfg.baseUrl,
      accessToken: cfg.accessToken,
    });

    api.logger.info(`penpot: plugin registered (endpoint: ${cfg.baseUrl})`);

    // Register all tools
    api.registerTool(createListProjectsTool(client), { name: "penpot_list_projects" });
    api.registerTool(createCreateFileTool(client), { name: "penpot_create_file" });
    api.registerTool(createInspectFileTool(client), { name: "penpot_inspect_file" });
    api.registerTool(createAddPageTool(client), { name: "penpot_add_page" });
    api.registerTool(createDesignUiTool(client), { name: "penpot_design_ui" });
    api.registerTool(createUpdateFileTool(client), { name: "penpot_update_file" });
    api.registerTool(createUploadImageTool(client), { name: "penpot_upload_image" });
    api.registerTool(createManageLibraryTool(client), { name: "penpot_manage_library" });

    // Register service for lifecycle management
    api.registerService({
      id: "penpot",
      async start() {
        // Verify connection on startup
        try {
          const profile = await client.getProfile();
          api.logger.info(
            `penpot: connected as ${(profile as Record<string, unknown>).fullname ?? (profile as Record<string, unknown>).email}`,
          );
        } catch (err) {
          api.logger.warn(`penpot: connection check failed: ${String(err)}`);
        }
      },
      stop() {
        api.logger.info("penpot: stopped");
      },
    });
  },
};

export default penpotPlugin;
