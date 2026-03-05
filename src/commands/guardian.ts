/**
 * guardian.ts — OpenClaw 容灾备份与恢复
 *
 * CLI 用法：
 *   openclaw guardian snapshot [--tag <tag>]
 *   openclaw guardian restore [<id|tag>]
 *   openclaw guardian list
 *   openclaw guardian diff [<id|tag>]
 *   openclaw guardian prune [--keep <n>]
 *   openclaw guardian status
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { intro, outro, spinner, note, confirm, isCancel } from "@clack/prompts";
import { readConfigFileSnapshot } from "../config/config.js";
import { STATE_DIR, CONFIG_PATH } from "../config/paths.js";
import { resolveGatewayService } from "../daemon/service.js";
import { callGateway } from "../gateway/call.js";
import type { RuntimeEnv } from "../runtime.js";
import { theme } from "../terminal/theme.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type GuardianOptions = {
  tag?: string;
  keep?: number;
  yes?: boolean;
  nonInteractive?: boolean;
};

type HealthChecks = {
  configValid: boolean;
  gatewayResponsive: boolean;
};

type SnapshotMeta = {
  id: string;
  ts: string;
  tag?: string;
  healthy: boolean;
  checks: HealthChecks;
  files: string[];
  configHash: string;
};

type GuardianMeta = {
  snapshots: SnapshotMeta[];
  lastHealthyId: string | null;
};

// ─── Paths ────────────────────────────────────────────────────────────────────

const GUARDIAN_DIR = path.join(STATE_DIR, "guardian");
const SNAPSHOTS_DIR = path.join(GUARDIAN_DIR, "snapshots");
const META_PATH = path.join(GUARDIAN_DIR, "meta.json");

/** Always backed up */
const CRITICAL_FILES = ["openclaw.json", "cron/jobs.json"];
/** Backed up if present */
const OPTIONAL_FILES = ["autonomy/state.json", "autonomy/plan.json", "autonomy/watchers.json"];

// ─── Internal helpers ─────────────────────────────────────────────────────────

function ensureDirs(): void {
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
}

function loadMeta(): GuardianMeta {
  try {
    return JSON.parse(fs.readFileSync(META_PATH, "utf8")) as GuardianMeta;
  } catch {
    return { snapshots: [], lastHealthyId: null };
  }
}

function saveMeta(meta: GuardianMeta): void {
  fs.mkdirSync(path.dirname(META_PATH), { recursive: true });
  fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2), "utf8");
}

function fileHash(filePath: string): string {
  try {
    const buf = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(buf).digest("hex").slice(0, 12);
  } catch {
    return "unknown";
  }
}

function nowId(): string {
  // e.g. "20260227_103045_482" — ms suffix prevents collisions
  const d = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `_${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}` +
    `_${pad(d.getUTCMilliseconds(), 3)}`
  );
}

function resolveSnapshot(meta: GuardianMeta, query?: string): SnapshotMeta | undefined {
  if (!query) {
    return meta.snapshots.find((s) => s.id === meta.lastHealthyId);
  }
  return [...meta.snapshots].toReversed().find((s) => s.id === query || s.tag === query);
}

async function checkHealth(): Promise<{ healthy: boolean; checks: HealthChecks }> {
  const checks: HealthChecks = { configValid: false, gatewayResponsive: false };
  try {
    void readConfigFileSnapshot();
    checks.configValid = true;
  } catch {
    // invalid
  }
  try {
    await callGateway({ method: "health", params: {}, timeoutMs: 8_000 });
    checks.gatewayResponsive = true;
  } catch {
    // not reachable
  }
  return { healthy: checks.configValid && checks.gatewayResponsive, checks };
}

function copyFiles(snapDir: string): string[] {
  const saved: string[] = [];
  for (const rel of [...CRITICAL_FILES, ...OPTIONAL_FILES]) {
    const src = path.join(STATE_DIR, rel);
    if (!fs.existsSync(src)) {
      continue;
    }
    const dst = path.join(snapDir, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    saved.push(rel);
  }
  return saved;
}

function restoreFiles(snapDir: string): string[] {
  const restored: string[] = [];
  for (const rel of CRITICAL_FILES) {
    const src = path.join(snapDir, rel);
    if (!fs.existsSync(src)) {
      continue;
    }
    const dst = path.join(STATE_DIR, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    restored.push(rel);
  }
  return restored;
}

async function restartGateway(runtime: RuntimeEnv): Promise<void> {
  try {
    const service = resolveGatewayService();
    await service.restart({ env: process.env, stdout: process.stdout });
  } catch (err) {
    runtime.log(`Gateway restart failed: ${String(err)}`);
    runtime.log("Run manually: openclaw gateway restart");
  }
}

// ─── snapshot ─────────────────────────────────────────────────────────────────

export async function guardianSnapshot(
  runtime: RuntimeEnv,
  opts: Pick<GuardianOptions, "tag">,
): Promise<void> {
  ensureDirs();
  intro(theme.heading("Guardian — Snapshot"));

  const s = spinner();
  s.start("Checking gateway health…");
  const { healthy, checks } = await checkHealth();
  s.stop(healthy ? "Gateway healthy ✓" : "Gateway unhealthy ⚠");

  const id = nowId();
  const snapDir = path.join(SNAPSHOTS_DIR, id);
  fs.mkdirSync(snapDir, { recursive: true });
  const files = copyFiles(snapDir);
  const configHash = fileHash(CONFIG_PATH);

  const snap: SnapshotMeta = {
    id,
    ts: new Date().toISOString(),
    tag: opts.tag,
    healthy,
    checks,
    files,
    configHash,
  };

  const meta = loadMeta();
  meta.snapshots.push(snap);
  if (healthy) {
    meta.lastHealthyId = id;
  }
  saveMeta(meta);

  const tagStr = opts.tag ? ` (tag: ${opts.tag})` : "";
  note(
    [
      `ID:     ${id}${tagStr}`,
      `Status: ${healthy ? "✅ healthy" : "⚠️  unhealthy (saved anyway)"}`,
      `Files:  ${files.join(", ")}`,
      `Hash:   ${configHash}`,
    ].join("\n"),
    "Snapshot saved",
  );

  outro(healthy ? "Done." : "Saved (gateway was unhealthy — not marked as recovery target).");
}

// ─── restore ──────────────────────────────────────────────────────────────────

export async function guardianRestore(
  runtime: RuntimeEnv,
  opts: GuardianOptions & { target?: string },
): Promise<void> {
  intro(theme.heading("Guardian — Restore"));

  const meta = loadMeta();
  if (meta.snapshots.length === 0) {
    runtime.error("No snapshots found. Run: openclaw guardian snapshot");
    runtime.exit(1);
    return;
  }

  const snap = resolveSnapshot(meta, opts.target);
  if (!snap) {
    runtime.error(
      opts.target
        ? `No snapshot matching "${opts.target}". Run: openclaw guardian list`
        : "No healthy snapshot available. Run: openclaw guardian snapshot",
    );
    runtime.exit(1);
    return;
  }

  const snapDir = path.join(SNAPSHOTS_DIR, snap.id);
  if (!fs.existsSync(snapDir)) {
    runtime.error(`Snapshot directory missing: ${snapDir}`);
    runtime.exit(1);
    return;
  }

  note(
    [
      `Target:  ${snap.id}${snap.tag ? ` (${snap.tag})` : ""}`,
      `Created: ${new Date(snap.ts).toLocaleString()}`,
      `Status:  ${snap.healthy ? "✅ healthy" : "⚠️  unhealthy"}`,
      `Hash:    ${snap.configHash}`,
    ].join("\n"),
    "Restoring snapshot",
  );

  const interactive = !opts.nonInteractive && !opts.yes;
  if (interactive) {
    const ok = await confirm({
      message: "Restore this snapshot? (current config will be saved first)",
    });
    if (isCancel(ok) || !ok) {
      outro("Cancelled.");
      return;
    }
  }

  // Save current state as emergency backup before overwriting
  const emergencyId = `pre-restore_${nowId()}`;
  const emergencyDir = path.join(SNAPSHOTS_DIR, emergencyId);
  fs.mkdirSync(emergencyDir, { recursive: true });
  const emergencyFiles = copyFiles(emergencyDir);
  const emergencyMeta: SnapshotMeta = {
    id: emergencyId,
    ts: new Date().toISOString(),
    tag: "pre-restore",
    healthy: false,
    checks: { configValid: false, gatewayResponsive: false },
    files: emergencyFiles,
    configHash: fileHash(CONFIG_PATH),
  };
  meta.snapshots.push(emergencyMeta);
  saveMeta(meta);

  // Restore files
  const restored = restoreFiles(snapDir);
  note(`Restored: ${restored.join(", ")}`, "Files restored");

  // Restart gateway
  const s = spinner();
  s.start("Restarting gateway…");
  await restartGateway(runtime);
  s.stop("Gateway restarted ✓");

  outro(`Restored to snapshot ${snap.id}. Emergency backup saved as ${emergencyId}.`);
}

// ─── list ─────────────────────────────────────────────────────────────────────

export function guardianList(_runtime: RuntimeEnv): void {
  const meta = loadMeta();
  if (meta.snapshots.length === 0) {
    console.log("No snapshots found.");
    return;
  }

  const col = (s: string, w: number) => s.slice(0, w).padEnd(w);
  console.log(`\n${col("ID", 20)} ${col("Tag", 14)} ${col("Status", 6)} ${col("Hash", 14)} Files`);
  console.log("─".repeat(70));

  for (const s of meta.snapshots) {
    const tag = s.tag ?? "-";
    const status = s.healthy ? "✅" : "⚠️";
    const marker = s.id === meta.lastHealthyId ? " ← latest healthy" : "";
    console.log(
      `${col(s.id, 20)} ${col(tag, 14)} ${status.padEnd(6)} ${col(s.configHash, 14)} ${s.files.length}${marker}`,
    );
  }

  console.log(
    `\nTotal: ${meta.snapshots.length}  |  Latest healthy: ${meta.lastHealthyId ?? "none"}\n`,
  );
}

// ─── diff ─────────────────────────────────────────────────────────────────────

export function guardianDiff(runtime: RuntimeEnv, opts: { target?: string }): void {
  const meta = loadMeta();
  const snap = resolveSnapshot(meta, opts.target);
  if (!snap) {
    runtime.error("No snapshot to diff against. Specify an id/tag or create a snapshot first.");
    runtime.exit(1);
    return;
  }

  const snapDir = path.join(SNAPSHOTS_DIR, snap.id);
  const currentHash = fileHash(CONFIG_PATH);

  if (currentHash === snap.configHash) {
    console.log(`\n✅ Config is identical to snapshot ${snap.id} (hash: ${currentHash})\n`);
    return;
  }

  console.log(`\nDiff: current vs snapshot ${snap.id}${snap.tag ? ` (${snap.tag})` : ""}`);
  console.log(`  Current hash:  ${currentHash}`);
  console.log(`  Snapshot hash: ${snap.configHash}`);

  // Show JSON diff of openclaw.json
  try {
    const current = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    const saved = JSON.parse(fs.readFileSync(path.join(snapDir, "openclaw.json"), "utf8"));
    const diffLines = jsonDiff(saved, current);
    if (diffLines.length > 0) {
      console.log("\nKey differences (snapshot → current):");
      for (const line of diffLines.slice(0, 40)) {
        console.log(`  ${line}`);
      }
      if (diffLines.length > 40) {
        console.log(`  … and ${diffLines.length - 40} more changes`);
      }
    }
  } catch {
    console.log("  (Could not parse JSON for detailed diff)");
  }
  console.log();
}

/** Minimal flat JSON diff — returns human-readable change lines */
function jsonDiff(a: unknown, b: unknown, prefix = ""): string[] {
  const lines: string[] = [];
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      lines.push(`${prefix}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
    }
    return lines;
  }
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);
  for (const k of keys) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (!(k in aObj)) {
      lines.push(`+ ${p}: ${JSON.stringify(bObj[k])?.slice(0, 80)}`);
    } else if (!(k in bObj)) {
      lines.push(`- ${p}`);
    } else {
      lines.push(...jsonDiff(aObj[k], bObj[k], p));
    }
  }
  return lines;
}

// ─── prune ────────────────────────────────────────────────────────────────────

export async function guardianPrune(
  runtime: RuntimeEnv,
  opts: Pick<GuardianOptions, "keep" | "yes" | "nonInteractive">,
): Promise<void> {
  const keep = Math.max(1, opts.keep ?? 10);
  const meta = loadMeta();

  if (meta.snapshots.length <= keep) {
    console.log(`Nothing to prune (${meta.snapshots.length} snapshots, keep=${keep}).`);
    return;
  }

  // Always keep the latest healthy snapshot
  const toRemove = meta.snapshots
    .slice(0, meta.snapshots.length - keep)
    .filter((s) => s.id !== meta.lastHealthyId);

  if (toRemove.length === 0) {
    console.log("Nothing to prune (all candidates are protected).");
    return;
  }

  const interactive = !opts.nonInteractive && !opts.yes;
  if (interactive) {
    const ok = await confirm({ message: `Delete ${toRemove.length} old snapshot(s)?` });
    if (isCancel(ok) || !ok) {
      console.log("Cancelled.");
      return;
    }
  }

  for (const s of toRemove) {
    const snapDir = path.join(SNAPSHOTS_DIR, s.id);
    try {
      fs.rmSync(snapDir, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  }

  meta.snapshots = meta.snapshots.filter((s) => !toRemove.find((r) => r.id === s.id));
  saveMeta(meta);

  console.log(`Pruned ${toRemove.length} snapshot(s). Remaining: ${meta.snapshots.length}.`);
}

// ─── status ───────────────────────────────────────────────────────────────────

export async function guardianStatus(_runtime: RuntimeEnv): Promise<void> {
  const { healthy, checks } = await checkHealth();
  const meta = loadMeta();
  const latest = meta.snapshots.at(-1);
  const latestHealthy = meta.snapshots.find((s) => s.id === meta.lastHealthyId);

  console.log("\nGateway health:");
  console.log(`  Config valid:       ${checks.configValid ? "✅" : "❌"}`);
  console.log(`  Gateway responsive: ${checks.gatewayResponsive ? "✅" : "❌"}`);
  console.log(`  Overall:            ${healthy ? "✅ healthy" : "❌ unhealthy"}`);

  console.log("\nSnapshots:");
  console.log(`  Total:              ${meta.snapshots.length}`);
  console.log(
    `  Latest healthy:     ${latestHealthy?.id ?? "none"}${latestHealthy?.tag ? ` (${latestHealthy.tag})` : ""}`,
  );
  console.log(
    `  Most recent:        ${latest?.id ?? "none"}${latest?.healthy ? " ✅" : latest ? " ⚠️" : ""}`,
  );

  const currentHash = fileHash(CONFIG_PATH);
  console.log(`  Current cfg hash:   ${currentHash}`);
  if (latestHealthy) {
    const match = currentHash === latestHealthy.configHash;
    console.log(
      `  Matches snapshot:   ${match ? "✅ yes" : "⚠️  no (config changed since last snapshot)"}`,
    );
  }
  console.log();
}
