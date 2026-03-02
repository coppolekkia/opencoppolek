/**
 * PenPot RPC HTTP client.
 *
 * Communicates with PenPot's backend via Transit-encoded HTTP requests.
 * Authenticates using access tokens (created in PenPot Settings > Access Tokens).
 */

import { transitDecode, transitEncode } from "./transit.js";

export type PenpotClientConfig = {
  baseUrl: string;
  accessToken: string;
};

export class PenpotApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string,
  ) {
    super(message);
    this.name = "PenpotApiError";
  }
}

export class PenpotClient {
  private readonly baseUrl: string;
  private readonly accessToken: string;

  constructor(config: PenpotClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.accessToken = config.accessToken;
  }

  /**
   * Call a PenPot RPC command.
   * Encodes params as Transit JSON, sends to /api/rpc/command/<name>,
   * decodes Transit JSON response.
   */
  async rpc(command: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const url = `${this.baseUrl}/api/rpc/command/${command}`;
    const body = transitEncode(params);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/transit+json",
        Accept: "application/transit+json",
        Authorization: `Token ${this.accessToken}`,
      },
      body,
    });

    if (!response.ok) {
      let errorBody: unknown;
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("transit")) {
        const text = await response.text();
        errorBody = transitDecode(text);
      } else {
        errorBody = await response.text();
      }
      throw new PenpotApiError(
        response.status,
        errorBody,
        `PenPot RPC ${command} failed (${response.status}): ${JSON.stringify(errorBody)}`,
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("transit")) {
      const text = await response.text();
      return transitDecode(text);
    }

    // Some commands return empty 204
    if (response.status === 204) {
      return null;
    }

    // Fallback to JSON
    return response.json();
  }

  // =========================================================================
  // Convenience Methods
  // =========================================================================

  async getProfile() {
    return this.rpc("get-profile") as Promise<Record<string, unknown>>;
  }

  async getTeams() {
    return this.rpc("get-teams") as Promise<Record<string, unknown>[]>;
  }

  async getProjects(teamId: string) {
    return this.rpc("get-projects", { "team-id": teamId }) as Promise<Record<string, unknown>[]>;
  }

  async createFile(projectId: string, name: string) {
    return this.rpc("create-file", {
      "project-id": projectId,
      name,
    }) as Promise<Record<string, unknown>>;
  }

  async getFile(fileId: string, features?: string[]) {
    const params: Record<string, unknown> = { id: fileId };
    if (features) {
      params.features = new Set(features);
    }
    return this.rpc("get-file", params) as Promise<Record<string, unknown>>;
  }

  async createFileMediaObjectFromUrl(fileId: string, url: string, name: string) {
    return this.rpc("create-file-media-object-from-url", {
      "file-id": fileId,
      "is-local": true,
      url,
      name,
    }) as Promise<Record<string, unknown>>;
  }

  async updateFile(params: {
    id: string;
    revn: number;
    vern?: number;
    "session-id": string;
    changes: Record<string, unknown>[];
  }) {
    // PenPot 2.13+ requires vern; default to 0 if not provided
    const withVern = { vern: 0, ...params };
    return this.rpc("update-file", withVern);
  }
}
