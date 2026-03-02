/**
 * penpot_upload_image - Upload an image to a PenPot file from a URL.
 * Returns the media object details needed for creating image shapes.
 */

import type { AnyAgentTool } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { jsonResult } from "openclaw/plugin-sdk";
import type { PenpotClient } from "../client.js";

export function createUploadImageTool(client: PenpotClient): AnyAgentTool {
  return {
    name: "penpot_upload_image",
    label: "PenPot: Upload Image",
    description:
      "Upload an image to a PenPot file from a URL. Returns the media object details (mediaId, width, height, mtype) needed when creating image shapes with penpot_design_ui.",
    parameters: Type.Object({
      fileId: Type.String({ description: "The file ID to upload the image to" }),
      url: Type.String({ description: "URL of the image to upload" }),
      name: Type.String({ description: "Name for the image asset" }),
    }),
    async execute(_toolCallId, params) {
      const { fileId, url, name } = params as {
        fileId: string;
        url: string;
        name: string;
      };

      const media = await client.createFileMediaObjectFromUrl(fileId, url, name);

      return jsonResult({
        mediaId: media.id,
        width: media.width,
        height: media.height,
        mtype: media.mtype,
        name: media.name,
      });
    },
  };
}
