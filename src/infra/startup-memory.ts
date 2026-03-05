import fs from "node:fs/promises";
import os from "node:os";

const GIB = 1024 ** 3;

const CGROUP_UNLIMITED_SENTINEL_MIN = 1n << 60n;
const CGROUP_LIMIT_PATHS = [
  "/sys/fs/cgroup/memory.max",
  "/sys/fs/cgroup/memory/memory.limit_in_bytes",
] as const;

export const GATEWAY_MIN_MEMORY_BYTES = 1 * GIB;
export const GATEWAY_RECOMMENDED_MEMORY_BYTES = 2 * GIB;

export type GatewayMemoryAssessment = {
  status: "ok" | "warn" | "error";
  effectiveMemoryBytes: number;
  source: "host" | "cgroup";
};

function formatGiB(bytes: number): string {
  return `${(bytes / GIB).toFixed(1)} GiB`;
}

function parseCgroupLimitBytes(raw: string): number | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || trimmed === "max") {
    return null;
  }
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const parsed = BigInt(trimmed);
  if (parsed <= 0n || parsed >= CGROUP_UNLIMITED_SENTINEL_MIN) {
    return null;
  }
  return Number(parsed);
}

async function readFirstCgroupMemoryLimitBytes(): Promise<number | null> {
  for (const path of CGROUP_LIMIT_PATHS) {
    try {
      const raw = await fs.readFile(path, "utf8");
      const parsed = parseCgroupLimitBytes(raw);
      if (parsed !== null) {
        return parsed;
      }
    } catch {
      // Ignore unreadable/missing cgroup files and continue probing.
    }
  }
  return null;
}

export async function assessGatewayStartupMemory(params?: {
  hostMemoryBytes?: number;
  cgroupMemoryBytes?: number | null;
}): Promise<GatewayMemoryAssessment> {
  const hostMemoryBytes = params?.hostMemoryBytes ?? os.totalmem();
  const cgroupMemoryBytes =
    params?.cgroupMemoryBytes === undefined
      ? await readFirstCgroupMemoryLimitBytes()
      : params.cgroupMemoryBytes;
  const effectiveMemoryBytes =
    cgroupMemoryBytes !== null ? Math.min(hostMemoryBytes, cgroupMemoryBytes) : hostMemoryBytes;
  const source =
    cgroupMemoryBytes !== null && cgroupMemoryBytes <= hostMemoryBytes ? "cgroup" : "host";

  if (effectiveMemoryBytes < GATEWAY_MIN_MEMORY_BYTES) {
    return { status: "error", effectiveMemoryBytes, source };
  }
  if (effectiveMemoryBytes < GATEWAY_RECOMMENDED_MEMORY_BYTES) {
    return { status: "warn", effectiveMemoryBytes, source };
  }
  return { status: "ok", effectiveMemoryBytes, source };
}

export function formatGatewayMemoryError(assessment: GatewayMemoryAssessment): string {
  return [
    "Insufficient memory to start gateway safely.",
    `Detected limit: ${formatGiB(assessment.effectiveMemoryBytes)} (${assessment.source}).`,
    `Minimum required: ${formatGiB(GATEWAY_MIN_MEMORY_BYTES)}.`,
    `Recommended: ${formatGiB(GATEWAY_RECOMMENDED_MEMORY_BYTES)}.`,
    "Increase available RAM or container memory limit, then retry.",
  ].join("\n");
}

export function formatGatewayMemoryWarning(assessment: GatewayMemoryAssessment): string {
  return [
    "Gateway startup memory is below the recommended level.",
    `Detected limit: ${formatGiB(assessment.effectiveMemoryBytes)} (${assessment.source}).`,
    `Recommended: ${formatGiB(GATEWAY_RECOMMENDED_MEMORY_BYTES)} (minimum ${formatGiB(GATEWAY_MIN_MEMORY_BYTES)}).`,
    "The gateway may be killed by the OS under load.",
  ].join("\n");
}
