import { randomBytes } from "crypto";
import {
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  chmodSync,
  openSync,
  closeSync,
} from "fs";
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

function atomicWriteFileSync(filePath: string, content: string): void {
  const dir = dirname(filePath);
  const tmpPath = join(dir, `.openclaw-tmp-${process.pid}-${Date.now()}`);

  try {
    writeFileSync(tmpPath, content, { encoding: "utf-8", mode: 0o600 });
    chmodSync(tmpPath, 0o600);
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
 * Acquire an exclusive lockfile. Returns a release function.
 * Prevents TOCTOU races when multiple callers rotate concurrently.
 */
function acquireLock(configPath: string): () => void {
  const lockPath = `${configPath}.lock`;
  const fd = openSync(lockPath, "wx"); // fails if lock exists
  return () => {
    closeSync(fd);
    try { unlinkSync(lockPath); } catch { /* ignore */ }
  };
}

/**
 * Rotate the gateway auth token in the config file.
 * Uses an exclusive lockfile to prevent concurrent rotation races.
 */
export function rotateToken(configPath: string): RotationResult {
  const releaseLock = acquireLock(configPath);

  try {
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
  } finally {
    releaseLock();
  }
}
