import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { withTempHome } from "./home-env.test-harness.js";
import { snapshotConfigBackupFile } from "./io.js";

describe("snapshotConfigBackupFile", () => {
  it("preserves latest .bak when refresh copy fails after rotation", async () => {
    await withTempHome("openclaw-config-backup-", async (home) => {
      const configPath = path.join(home, ".openclaw", "openclaw.json");
      const backupPath = `${configPath}.bak`;
      await fsp.mkdir(path.dirname(configPath), { recursive: true });
      await fsp.writeFile(
        configPath,
        JSON.stringify({ gateway: { mode: "local" } }, null, 2),
        "utf-8",
      );
      await fsp.writeFile(backupPath, "previous-backup", "utf-8");

      const copyFileOriginal = fs.promises.copyFile.bind(fs.promises);
      const copyFileSpy = vi
        .spyOn(fs.promises, "copyFile")
        .mockImplementation(async (src, dest) => {
          if (String(src) === configPath && String(dest) === backupPath) {
            const err = Object.assign(new Error("no space left"), { code: "ENOSPC" });
            throw err;
          }
          return await copyFileOriginal(src, dest);
        });

      try {
        const result = await snapshotConfigBackupFile();
        expect(result.ok).toBe(false);
      } finally {
        copyFileSpy.mockRestore();
      }

      expect(await fsp.readFile(backupPath, "utf-8")).toBe("previous-backup");
    });
  });
});
