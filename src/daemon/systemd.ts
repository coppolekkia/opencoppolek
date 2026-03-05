import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  GATEWAY_SERVICE_KIND,
  LEGACY_GATEWAY_SYSTEMD_SERVICE_NAMES,
  resolveGatewayServiceDescription,
  resolveGatewaySystemdServiceName,
} from "./constants.js";
import { execFileUtf8 } from "./exec-file.js";
import { formatLine, toPosixPath, writeFormattedLines } from "./output.js";
import { resolveHomeDir } from "./paths.js";
import { parseKeyValueOutput } from "./runtime-parse.js";
import type { GatewayServiceRuntime } from "./service-runtime.js";
import type {
  GatewayServiceCommandConfig,
  GatewayServiceControlArgs,
  GatewayServiceEnv,
  GatewayServiceEnvArgs,
  GatewayServiceInstallArgs,
  GatewayServiceManageArgs,
} from "./service-types.js";
import {
  enableSystemdUserLinger,
  readSystemdUserLingerStatus,
  type SystemdUserLingerStatus,
} from "./systemd-linger.js";
import {
  buildSystemdUnit,
  parseSystemdEnvAssignment,
  parseSystemdExecStart,
} from "./systemd-unit.js";

const SYSTEMD_SERVICE_NAME_PATTERN = /^[A-Za-z0-9@:_.-]+$/;
const OPENCLAW_GATEWAY_SYSTEMD_PREFIX = "openclaw-gateway";
const OPENCLAW_NODE_SYSTEMD_PREFIX = "openclaw-node";
const SYSTEMD_NOFOLLOW_OPEN_FLAGS =
  fsConstants.O_WRONLY | fsConstants.O_CREAT | (fsConstants.O_NOFOLLOW ?? 0);

function normalizeSystemdServiceName(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.endsWith(".service") ? trimmed.slice(0, -".service".length) : trimmed;
}

function assertValidSystemdServiceName(name: string): void {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Invalid systemd unit name: empty value.");
  }
  if (
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    trimmed.includes("..") ||
    !SYSTEMD_SERVICE_NAME_PATTERN.test(trimmed)
  ) {
    throw new Error(`Invalid systemd unit name: ${name}`);
  }
}

function isGatewayServiceContext(env: GatewayServiceEnv): boolean {
  const serviceKind = env.OPENCLAW_SERVICE_KIND?.trim().toLowerCase();
  return !serviceKind || serviceKind === GATEWAY_SERVICE_KIND;
}

function assertAllowedOpenClawSystemdServiceName(name: string, env: GatewayServiceEnv): void {
  if (isGatewayServiceContext(env)) {
    if (
      name === resolveGatewaySystemdServiceName(env.OPENCLAW_PROFILE) ||
      name.startsWith(`${OPENCLAW_GATEWAY_SYSTEMD_PREFIX}-`)
    ) {
      return;
    }
    throw new Error(`Refusing to manage non-OpenClaw gateway systemd unit: ${name}`);
  }

  if (
    name === OPENCLAW_NODE_SYSTEMD_PREFIX ||
    name.startsWith(`${OPENCLAW_NODE_SYSTEMD_PREFIX}-`)
  ) {
    return;
  }
  throw new Error(`Refusing to manage non-OpenClaw node systemd unit: ${name}`);
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}

async function assertDirectoryResolvesWithoutSymlink(
  env: GatewayServiceEnv,
  directoryPath: string,
  label: string,
): Promise<void> {
  const expected = path.posix.resolve(directoryPath);
  const declaredHome = path.posix.resolve(toPosixPath(resolveHomeDir(env)));
  let resolvedHome = declaredHome;
  try {
    resolvedHome = path.posix.resolve(await fs.realpath(declaredHome));
  } catch (error) {
    if (!(isErrnoException(error) && error.code === "ENOENT")) {
      throw error;
    }
  }
  let resolved: string;
  try {
    resolved = path.posix.resolve(await fs.realpath(expected));
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  const insideHome = resolved === resolvedHome || resolved.startsWith(`${resolvedHome}/`);
  if (!insideHome) {
    throw new Error(
      `${label} resolves outside the configured home boundary and is unsafe: ${expected} -> ${resolved}`,
    );
  }
}

async function readSafeSystemdUnitFileForBackup(
  env: GatewayServiceEnv,
  unitPath: string,
): Promise<string | null> {
  await assertDirectoryResolvesWithoutSymlink(
    env,
    path.dirname(unitPath),
    "Systemd unit directory",
  );
  let stats: Awaited<ReturnType<typeof fs.lstat>>;
  try {
    stats = await fs.lstat(unitPath);
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
  if (stats.isSymbolicLink()) {
    throw new Error(`Refusing to manage symlinked systemd unit file: ${unitPath}`);
  }
  if (!stats.isFile()) {
    throw new Error(`Refusing to manage non-regular systemd unit file: ${unitPath}`);
  }
  if (stats.nlink > 1) {
    throw new Error(`Refusing to manage systemd unit file with hard links: ${unitPath}`);
  }
  return await fs.readFile(unitPath, "utf8");
}

async function writeSystemdUnitFileSafely(
  env: GatewayServiceEnv,
  unitPath: string,
  content: string,
): Promise<void> {
  await assertDirectoryResolvesWithoutSymlink(
    env,
    path.dirname(unitPath),
    "Systemd unit directory",
  );
  const handle = await fs.open(unitPath, SYSTEMD_NOFOLLOW_OPEN_FLAGS, 0o600);
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) {
      throw new Error(`Refusing to write non-regular systemd unit file: ${unitPath}`);
    }
    if (stats.nlink > 1) {
      throw new Error(`Refusing to write systemd unit file with hard links: ${unitPath}`);
    }
    await handle.truncate(0);
    await handle.writeFile(content, "utf8");
  } finally {
    await handle.close();
  }
}

async function unlinkSystemdUnitFileSafely(
  env: GatewayServiceEnv,
  unitPath: string,
): Promise<boolean> {
  await assertDirectoryResolvesWithoutSymlink(
    env,
    path.dirname(unitPath),
    "Systemd unit directory",
  );
  let stats: Awaited<ReturnType<typeof fs.lstat>>;
  try {
    stats = await fs.lstat(unitPath);
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
  if (stats.isSymbolicLink()) {
    throw new Error(`Refusing to remove symlinked systemd unit file: ${unitPath}`);
  }
  if (!stats.isFile()) {
    throw new Error(`Refusing to remove non-regular systemd unit file: ${unitPath}`);
  }
  if (stats.nlink > 1) {
    throw new Error(`Refusing to remove systemd unit file with hard links: ${unitPath}`);
  }
  await fs.unlink(unitPath);
  return true;
}

function resolveSystemdUnitPathForName(env: GatewayServiceEnv, name: string): string {
  assertValidSystemdServiceName(name);
  const home = toPosixPath(resolveHomeDir(env));
  const baseDir = path.posix.join(home, ".config", "systemd", "user");
  const resolved = path.posix.resolve(baseDir, `${name}.service`);
  if (!resolved.startsWith(`${baseDir}/`)) {
    throw new Error("Resolved unit path escapes systemd user directory.");
  }
  return resolved;
}

function resolveSystemdServiceName(env: GatewayServiceEnv): string {
  const override = env.OPENCLAW_SYSTEMD_UNIT?.trim();
  const candidate = override
    ? normalizeSystemdServiceName(override)
    : resolveGatewaySystemdServiceName(env.OPENCLAW_PROFILE);
  assertValidSystemdServiceName(candidate);
  assertAllowedOpenClawSystemdServiceName(candidate, env);
  return candidate;
}

function resolveSystemdUnitPath(env: GatewayServiceEnv): string {
  return resolveSystemdUnitPathForName(env, resolveSystemdServiceName(env));
}

function resolvePreviousGatewayUnitNameForCleanup(
  env: GatewayServiceEnv,
  serviceName: string,
): string | null {
  if (!isGatewayServiceContext(env)) {
    return null;
  }
  const defaultName = resolveGatewaySystemdServiceName(env.OPENCLAW_PROFILE);
  if (serviceName === defaultName) {
    return null;
  }
  return defaultName;
}

/** @internal Exported for testing only. */
export function _resolvePreviousGatewayUnitNameForCleanupForTests(
  env: GatewayServiceEnv,
  serviceName: string,
): string | null {
  return resolvePreviousGatewayUnitNameForCleanup(env, serviceName);
}

export function resolveSystemdUserUnitPath(env: GatewayServiceEnv): string {
  return resolveSystemdUnitPath(env);
}

export { enableSystemdUserLinger, readSystemdUserLingerStatus };
export type { SystemdUserLingerStatus };

// Unit file parsing/rendering: see systemd-unit.ts

export async function readSystemdServiceExecStart(
  env: GatewayServiceEnv,
): Promise<GatewayServiceCommandConfig | null> {
  const serviceName = resolveSystemdServiceName(env);
  const unitPath = resolveSystemdUnitPathForName(env, serviceName);
  try {
    const content = await fs.readFile(unitPath, "utf8");
    let execStart = "";
    let workingDirectory = "";
    const environment: Record<string, string> = {};
    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }
      if (line.startsWith("ExecStart=")) {
        execStart = line.slice("ExecStart=".length).trim();
      } else if (line.startsWith("WorkingDirectory=")) {
        workingDirectory = line.slice("WorkingDirectory=".length).trim();
      } else if (line.startsWith("Environment=")) {
        const raw = line.slice("Environment=".length).trim();
        const parsed = parseSystemdEnvAssignment(raw);
        if (parsed) {
          environment[parsed.key] = parsed.value;
        }
      }
    }
    if (!execStart) {
      return null;
    }
    const programArguments = parseSystemdExecStart(execStart);
    return {
      programArguments,
      ...(workingDirectory ? { workingDirectory } : {}),
      ...(Object.keys(environment).length > 0 ? { environment } : {}),
      sourcePath: unitPath,
    };
  } catch {
    return null;
  }
}

export type SystemdServiceInfo = {
  activeState?: string;
  subState?: string;
  mainPid?: number;
  execMainStatus?: number;
  execMainCode?: string;
};

export function parseSystemdShow(output: string): SystemdServiceInfo {
  const entries = parseKeyValueOutput(output, "=");
  const info: SystemdServiceInfo = {};
  const activeState = entries.activestate;
  if (activeState) {
    info.activeState = activeState;
  }
  const subState = entries.substate;
  if (subState) {
    info.subState = subState;
  }
  const mainPidValue = entries.mainpid;
  if (mainPidValue) {
    const pid = Number.parseInt(mainPidValue, 10);
    if (Number.isFinite(pid) && pid > 0) {
      info.mainPid = pid;
    }
  }
  const execMainStatusValue = entries.execmainstatus;
  if (execMainStatusValue) {
    const status = Number.parseInt(execMainStatusValue, 10);
    if (Number.isFinite(status)) {
      info.execMainStatus = status;
    }
  }
  const execMainCode = entries.execmaincode;
  if (execMainCode) {
    info.execMainCode = execMainCode;
  }
  return info;
}

async function execSystemctl(
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number }> {
  return await execFileUtf8("systemctl", args);
}

function readSystemctlDetail(result: { stdout: string; stderr: string }): string {
  // Concatenate both streams so pattern matchers (isSystemdUnitNotEnabled,
  // isSystemctlMissing) can see the unit status from stdout even when
  // execFileUtf8 populates stderr with the Node error message fallback.
  return `${result.stderr} ${result.stdout}`.trim();
}

function isSystemctlMissing(detail: string): boolean {
  if (!detail) {
    return false;
  }
  const normalized = detail.toLowerCase();
  return (
    normalized.includes("not found") ||
    normalized.includes("no such file or directory") ||
    normalized.includes("spawn systemctl enoent") ||
    normalized.includes("spawn systemctl eacces")
  );
}

function isSystemdUnitNotEnabled(detail: string): boolean {
  if (!detail) {
    return false;
  }
  const normalized = detail.toLowerCase();
  return (
    normalized.includes("disabled") ||
    normalized.includes("static") ||
    normalized.includes("indirect") ||
    normalized.includes("masked") ||
    normalized.includes("not-found") ||
    normalized.includes("could not be found") ||
    normalized.includes("failed to get unit file state")
  );
}

function resolveSystemctlDirectUserScopeArgs(): string[] {
  return ["--user"];
}

function resolveSystemctlMachineScopeUser(env: GatewayServiceEnv): string | null {
  const sudoUser = env.SUDO_USER?.trim();
  if (sudoUser && sudoUser !== "root") {
    return sudoUser;
  }
  const fromEnv = env.USER?.trim() || env.LOGNAME?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  try {
    return os.userInfo().username;
  } catch {
    return null;
  }
}

function resolveSystemctlMachineUserScopeArgs(user: string): string[] {
  const trimmedUser = user.trim();
  if (!trimmedUser) {
    return [];
  }
  return ["--machine", `${trimmedUser}@`, "--user"];
}

function shouldFallbackToMachineUserScope(detail: string): boolean {
  const normalized = detail.toLowerCase();
  return (
    normalized.includes("failed to connect to bus") ||
    normalized.includes("failed to connect to user scope bus") ||
    normalized.includes("dbus_session_bus_address") ||
    normalized.includes("xdg_runtime_dir")
  );
}

async function execSystemctlUser(
  env: GatewayServiceEnv,
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number }> {
  const machineUser = resolveSystemctlMachineScopeUser(env);
  const sudoUser = env.SUDO_USER?.trim();

  // Under sudo, prefer the invoking non-root user's scope directly.
  if (sudoUser && sudoUser !== "root" && machineUser) {
    const machineScopeArgs = resolveSystemctlMachineUserScopeArgs(machineUser);
    if (machineScopeArgs.length > 0) {
      return await execSystemctl([...machineScopeArgs, ...args]);
    }
  }

  const directResult = await execSystemctl([...resolveSystemctlDirectUserScopeArgs(), ...args]);
  if (directResult.code === 0) {
    return directResult;
  }

  const detail = `${directResult.stderr} ${directResult.stdout}`.trim();
  if (!machineUser || !shouldFallbackToMachineUserScope(detail)) {
    return directResult;
  }

  const machineScopeArgs = resolveSystemctlMachineUserScopeArgs(machineUser);
  if (machineScopeArgs.length === 0) {
    return directResult;
  }
  return await execSystemctl([...machineScopeArgs, ...args]);
}

export async function isSystemdUserServiceAvailable(
  env: GatewayServiceEnv = process.env as GatewayServiceEnv,
): Promise<boolean> {
  const res = await execSystemctlUser(env, ["status"]);
  if (res.code === 0) {
    return true;
  }
  const detail = `${res.stderr} ${res.stdout}`.toLowerCase();
  if (!detail) {
    return false;
  }
  if (detail.includes("not found")) {
    return false;
  }
  if (detail.includes("failed to connect")) {
    return false;
  }
  if (detail.includes("not been booted")) {
    return false;
  }
  if (detail.includes("no such file or directory")) {
    return false;
  }
  if (detail.includes("not supported")) {
    return false;
  }
  return false;
}

async function assertSystemdAvailable(env: GatewayServiceEnv = process.env as GatewayServiceEnv) {
  const res = await execSystemctlUser(env, ["status"]);
  if (res.code === 0) {
    return;
  }
  const detail = readSystemctlDetail(res);
  if (isSystemctlMissing(detail)) {
    throw new Error("systemctl not available; systemd user services are required on Linux.");
  }
  throw new Error(`systemctl --user unavailable: ${detail || "unknown error"}`.trim());
}

export async function installSystemdService({
  env,
  stdout,
  programArguments,
  workingDirectory,
  environment,
  description,
  watchdog,
}: GatewayServiceInstallArgs): Promise<{ unitPath: string }> {
  await assertSystemdAvailable(env);

  // Derive the service name first so unitPath, enable, and restart all
  // operate on the same resolved name (respects OPENCLAW_SYSTEMD_UNIT).
  const serviceName = resolveSystemdServiceName(env);
  const unitName = `${serviceName}.service`;
  const unitPath = resolveSystemdUnitPathForName(env, serviceName);
  await fs.mkdir(path.dirname(unitPath), { recursive: true });
  await assertDirectoryResolvesWithoutSymlink(
    env,
    path.dirname(unitPath),
    "Systemd unit directory",
  );

  // Preserve user customizations: back up existing unit file before overwriting.
  let backedUp = false;
  const existingUnit = await readSafeSystemdUnitFileForBackup(env, unitPath);
  if (existingUnit !== null) {
    const backupPath = `${unitPath}.bak`;
    await writeSystemdUnitFileSafely(env, backupPath, existingUnit);
    backedUp = true;
  }

  const serviceDescription = resolveGatewayServiceDescription({ env, environment, description });
  const unit = buildSystemdUnit({
    description: serviceDescription,
    programArguments,
    workingDirectory,
    environment,
    watchdog,
  });
  await writeSystemdUnitFileSafely(env, unitPath, unit);

  // Stop any previous default gateway unit before restart to avoid
  // lock/port conflicts during OPENCLAW_SYSTEMD_UNIT rename migrations.
  const previousGatewayUnit = resolvePreviousGatewayUnitNameForCleanup(env, serviceName);
  if (previousGatewayUnit) {
    const prevUnit = `${previousGatewayUnit}.service`;
    await execSystemctlUser(env, ["disable", "--now", prevUnit]);
  }

  const reload = await execSystemctlUser(env, ["daemon-reload"]);
  if (reload.code !== 0) {
    throw new Error(`systemctl daemon-reload failed: ${reload.stderr || reload.stdout}`.trim());
  }

  const enable = await execSystemctlUser(env, ["enable", unitName]);
  if (enable.code !== 0) {
    throw new Error(`systemctl enable failed: ${enable.stderr || enable.stdout}`.trim());
  }

  const restart = await execSystemctlUser(env, ["restart", unitName]);
  if (restart.code !== 0) {
    throw new Error(`systemctl restart failed: ${restart.stderr || restart.stdout}`.trim());
  }

  // When OPENCLAW_SYSTEMD_UNIT overrides the name, remove the previous
  // profile-based unit file after the new unit is active.
  if (previousGatewayUnit) {
    const prevPath = resolveSystemdUnitPathForName(env, previousGatewayUnit);
    await unlinkSystemdUnitFileSafely(env, prevPath);
  }

  // Ensure we don't end up writing to a clack spinner line (wizards show progress without a newline).
  writeFormattedLines(
    stdout,
    [
      {
        label: "Installed systemd service",
        value: unitPath,
      },
      ...(backedUp
        ? [
            {
              label: "Previous unit backed up to",
              value: `${unitPath}.bak`,
            },
          ]
        : []),
    ],
    { leadingBlankLine: true },
  );
  return { unitPath };
}

export async function uninstallSystemdService({
  env,
  stdout,
}: GatewayServiceManageArgs): Promise<void> {
  await assertSystemdAvailable(env);
  const serviceName = resolveSystemdServiceName(env);
  const unitName = `${serviceName}.service`;
  await execSystemctlUser(env, ["disable", "--now", unitName]);

  const unitPath = resolveSystemdUnitPathForName(env, serviceName);
  const removedCurrent = await unlinkSystemdUnitFileSafely(env, unitPath);
  if (removedCurrent) {
    stdout.write(`${formatLine("Removed systemd service", unitPath)}\n`);
  } else {
    stdout.write(`Systemd service not found at ${unitPath}\n`);
  }

  // When OPENCLAW_SYSTEMD_UNIT overrides the name, also disable the previous
  // profile-based unit so it doesn't remain enabled as a dangling service.
  const previousGatewayUnit = resolvePreviousGatewayUnitNameForCleanup(env, serviceName);
  if (previousGatewayUnit) {
    const prevUnit = `${previousGatewayUnit}.service`;
    await execSystemctlUser(env, ["disable", "--now", prevUnit]);
    const prevPath = resolveSystemdUnitPathForName(env, previousGatewayUnit);
    const removedPrevious = await unlinkSystemdUnitFileSafely(env, prevPath);
    if (removedPrevious) {
      stdout.write(`${formatLine("Removed previous systemd service", prevPath)}\n`);
    }
  }
}

async function runSystemdServiceAction(params: {
  stdout: NodeJS.WritableStream;
  env?: GatewayServiceEnv;
  action: "stop" | "restart";
  label: string;
}) {
  const env = params.env ?? process.env;
  await assertSystemdAvailable(env);
  const serviceName = resolveSystemdServiceName(env);
  const unitName = `${serviceName}.service`;
  const res = await execSystemctlUser(env, [params.action, unitName]);
  if (res.code !== 0) {
    throw new Error(`systemctl ${params.action} failed: ${res.stderr || res.stdout}`.trim());
  }
  params.stdout.write(`${formatLine(params.label, unitName)}\n`);
}

export async function stopSystemdService({
  stdout,
  env,
}: GatewayServiceControlArgs): Promise<void> {
  await runSystemdServiceAction({
    stdout,
    env,
    action: "stop",
    label: "Stopped systemd service",
  });
}

export async function restartSystemdService({
  stdout,
  env,
}: GatewayServiceControlArgs): Promise<void> {
  await runSystemdServiceAction({
    stdout,
    env,
    action: "restart",
    label: "Restarted systemd service",
  });
}

export async function isSystemdServiceEnabled(args: GatewayServiceEnvArgs): Promise<boolean> {
  const env = args.env ?? process.env;
  const serviceName = resolveSystemdServiceName(args.env ?? {});
  const unitName = `${serviceName}.service`;
  const res = await execSystemctlUser(env, ["is-enabled", unitName]);
  if (res.code === 0) {
    return true;
  }
  const detail = readSystemctlDetail(res);
  if (isSystemctlMissing(detail) || isSystemdUnitNotEnabled(detail)) {
    return false;
  }
  throw new Error(`systemctl is-enabled unavailable: ${detail || "unknown error"}`.trim());
}

export async function readSystemdServiceRuntime(
  env: GatewayServiceEnv = process.env as GatewayServiceEnv,
): Promise<GatewayServiceRuntime> {
  try {
    await assertSystemdAvailable(env);
  } catch (err) {
    return {
      status: "unknown",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
  const serviceName = resolveSystemdServiceName(env);
  const unitName = `${serviceName}.service`;
  const res = await execSystemctlUser(env, [
    "show",
    unitName,
    "--no-page",
    "--property",
    "ActiveState,SubState,MainPID,ExecMainStatus,ExecMainCode",
  ]);
  if (res.code !== 0) {
    const detail = (res.stderr || res.stdout).trim();
    const missing = detail.toLowerCase().includes("not found");
    return {
      status: missing ? "stopped" : "unknown",
      detail: detail || undefined,
      missingUnit: missing,
    };
  }
  const parsed = parseSystemdShow(res.stdout || "");
  const activeState = parsed.activeState?.toLowerCase();
  const status = activeState === "active" ? "running" : activeState ? "stopped" : "unknown";
  return {
    status,
    state: parsed.activeState,
    subState: parsed.subState,
    pid: parsed.mainPid,
    lastExitStatus: parsed.execMainStatus,
    lastExitReason: parsed.execMainCode,
  };
}
export type LegacySystemdUnit = {
  name: string;
  unitPath: string;
  enabled: boolean;
  exists: boolean;
};

async function isSystemctlAvailable(env: GatewayServiceEnv): Promise<boolean> {
  const res = await execSystemctlUser(env, ["status"]);
  if (res.code === 0) {
    return true;
  }
  return !isSystemctlMissing(readSystemctlDetail(res));
}

export async function findLegacySystemdUnits(env: GatewayServiceEnv): Promise<LegacySystemdUnit[]> {
  const results: LegacySystemdUnit[] = [];
  const systemctlAvailable = await isSystemctlAvailable(env);
  for (const name of LEGACY_GATEWAY_SYSTEMD_SERVICE_NAMES) {
    const unitPath = resolveSystemdUnitPathForName(env, name);
    let exists = false;
    try {
      await fs.access(unitPath);
      exists = true;
    } catch {
      // ignore
    }
    let enabled = false;
    if (systemctlAvailable) {
      const res = await execSystemctlUser(env, ["is-enabled", `${name}.service`]);
      enabled = res.code === 0;
    }
    if (exists || enabled) {
      results.push({ name, unitPath, enabled, exists });
    }
  }
  return results;
}

export async function uninstallLegacySystemdUnits({
  env,
  stdout,
}: GatewayServiceManageArgs): Promise<LegacySystemdUnit[]> {
  const units = await findLegacySystemdUnits(env);
  if (units.length === 0) {
    return units;
  }

  const systemctlAvailable = await isSystemctlAvailable(env);
  for (const unit of units) {
    if (systemctlAvailable) {
      await execSystemctlUser(env, ["disable", "--now", `${unit.name}.service`]);
    } else {
      stdout.write(`systemctl unavailable; removed legacy unit file only: ${unit.name}.service\n`);
    }

    try {
      await fs.unlink(unit.unitPath);
      stdout.write(`${formatLine("Removed legacy systemd service", unit.unitPath)}\n`);
    } catch {
      stdout.write(`Legacy systemd unit not found at ${unit.unitPath}\n`);
    }
  }

  return units;
}
