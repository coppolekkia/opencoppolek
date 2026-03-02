import { randomBytes } from "crypto";
import { readFileSync, writeFileSync, renameSync, unlinkSync } from "fs";
import { dirname, join } from "path";
import { mask } from "./token-redactor.js";

interface RotationResult {
  previousTokenPrefix: string;
  newTokenPrefix: string;
  rotatedAt: string;
  configPath: string;
}

function generateToken(bytes: number = 24): string {
  return randomBytes(bytes).toString("hex");
}

/**
 * Atomically write content to a file.
 * Forces 0o600 permissions to match the main config writer
 * (src/config/io.ts). On Windows, falls back gracefully if
 * rename fails due to EPERM/EEXIST.
 */
function atomicWriteFileSync(filePath: string, content: string): void {
  const dir = dirname(filePath);
  const tmpPath = join(dir, `.openclaw-tmp-${process.pid}-${Date.now()}`);

  try {
    writeFileSync(tmpPath, content, { encoding: "utf-8", mode: 0o600 });
  } catch (writeErr) {
    try { unlinkSync(tmpPath); } catch { /* ignore */ }
    throw writeErr;
  }

  try {
    renameSync(tmpPath, filePath);
  } catch (renameErr: any) {
    if (renameErr.code === "EPERM" || renameErr.code === "EEXIST") {
      try {
        unlinkSync(filePath);
        renameSync(tmpPath, filePath);
      } catch (fallbackErr: any) {
        // Do NOT delete tmpPath — it is the only copy of the new config.
        const recovery = new Error(
          `Failed to write config. New config preserved at ${tmpPath}. ` +
            `Rename it to ${filePath} manually to recover.`,
        );
        (recovery as any).cause = fallbackErr;
        throw recovery;
      }
    } else {
      try { unlinkSync(tmpPath); } catch { /* ignore */ }
      throw renameErr;
    }
  }
}

/**
 * Rotate the gateway auth token in the config file.
 * Callers should serialize rotation attempts (single-operator model).
 *
 * Note: Uses JSON.parse. If configs adopt JSON5 (comments, trailing
 * commas), switch to parseConfigJson5 from src/config/io.ts.
 */
export function rotateToken(configPath: string): RotationResult {
  const raw = readFileSync(configPath, "utf-8");
  const config = JSON.parse(raw);

  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    throw new Error(
      `Cannot rotate: ${configPath} does not contain a JSON object`,
    );
  }

  const oldToken: string = config?.gateway?.auth?.token || "";
  const newToken = generateToken();

  if (!config.gateway) config.gateway = {};
  if (!config.gateway.auth) config.gateway.auth = {};
  config.gateway.auth.token = newToken;

  atomicWriteFileSync(configPath, JSON.stringify(config, null, 2));

  return {
    previousTokenPrefix: oldToken ? mask(oldToken) : "(none)",
    newTokenPrefix: mask(newToken),
    rotatedAt: new Date().toISOString(),
    configPath,
  };
}
