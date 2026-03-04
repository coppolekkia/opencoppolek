import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { withTempHome } from "./home-env.test-harness.js";
import { restoreConfigFromBackupFile } from "./io.js";

describe("restoreConfigFromBackupFile", () => {
  it("falls back to copy when rename fails with EPERM", async () => {
    await withTempHome("openclaw-config-restore-", async (home) => {
      const configPath = path.join(home, ".openclaw", "openclaw.json");
      const backupPath = `${configPath}.bak`;
      await fsp.mkdir(path.dirname(configPath), { recursive: true });
      await fsp.writeFile(
        configPath,
        JSON.stringify({ gateway: { mode: "local", port: 18789 } }, null, 2),
        "utf-8",
      );
      await fsp.writeFile(
        backupPath,
        JSON.stringify({ gateway: { mode: "local", port: 19876 } }, null, 2),
        "utf-8",
      );

      const renameSpy = vi.spyOn(fs.promises, "rename").mockRejectedValueOnce(
        Object.assign(new Error("destination busy"), {
          code: "EPERM",
        }),
      );

      try {
        const restored = await restoreConfigFromBackupFile();
        expect(restored.ok).toBe(true);
      } finally {
        renameSpy.mockRestore();
      }

      const raw = await fsp.readFile(configPath, "utf-8");
      const persisted = JSON.parse(raw) as { gateway?: { port?: number } };
      expect(persisted.gateway?.port).toBe(19876);
    });
  });
});
