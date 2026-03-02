import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AUTH_STORE_VERSION } from "./auth-profiles/constants.js";
import { resolveImplicitProviders } from "./models-config.providers.js";

describe("minimax-portal implicit provider", () => {
  it("does not inject oauth placeholder when explicit minimax-portal apiKey is configured", async () => {
    const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-minimax-portal-"));
    try {
      fs.writeFileSync(
        path.join(agentDir, "auth-profiles.json"),
        `${JSON.stringify(
          {
            version: AUTH_STORE_VERSION,
            profiles: {
              "minimax-portal:default": {
                type: "oauth",
                provider: "minimax-portal",
                access: "oauth-token",
                refresh: "refresh-token",
                expires: Date.now() + 60_000,
              },
            },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );

      const providers = await resolveImplicitProviders({
        agentDir,
        explicitProviders: {
          "minimax-portal": {
            apiKey: "real-api-key",
          } as never,
        },
      });

      expect(providers).toBeDefined();
      expect(providers?.["minimax-portal"]).toBeDefined();
      expect(providers?.["minimax-portal"]?.models?.length).toBeGreaterThan(0);
      expect(providers?.["minimax-portal"]?.apiKey).toBeUndefined();
    } finally {
      fs.rmSync(agentDir, { recursive: true, force: true });
    }
  });

  it("keeps oauth-backed implicit provider when explicit minimax-portal apiKey is absent", async () => {
    const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-minimax-portal-"));
    try {
      fs.writeFileSync(
        path.join(agentDir, "auth-profiles.json"),
        `${JSON.stringify(
          {
            version: AUTH_STORE_VERSION,
            profiles: {
              "minimax-portal:default": {
                type: "oauth",
                provider: "minimax-portal",
                access: "oauth-token",
                refresh: "refresh-token",
                expires: Date.now() + 60_000,
              },
            },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );

      const providers = await resolveImplicitProviders({ agentDir });
      expect(providers).toBeDefined();
      expect(providers?.["minimax-portal"]?.apiKey).toBe("minimax-oauth");
    } finally {
      fs.rmSync(agentDir, { recursive: true, force: true });
    }
  });
});
