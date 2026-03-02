import { buildGatewayInstallPlan } from "../../commands/daemon-install-helpers.js";
import {
  DEFAULT_GATEWAY_DAEMON_RUNTIME,
  isGatewayDaemonRuntime,
} from "../../commands/daemon-runtime.js";
import { randomToken } from "../../commands/onboard-helpers.js";
import {
  loadConfig,
  readConfigFileSnapshot,
  resolveGatewayPort,
  writeConfigFile,
} from "../../config/config.js";
import { resolveIsNixMode } from "../../config/paths.js";
import { resolveGatewayService } from "../../daemon/service.js";
import { resolveGatewayAuth } from "../../gateway/auth.js";
import { defaultRuntime } from "../../runtime.js";
import { formatCliCommand } from "../command-format.js";
import {
  buildDaemonServiceSnapshot,
  createDaemonActionContext,
  installDaemonServiceAndEmit,
} from "./response.js";
import { parsePort } from "./shared.js";
import type { DaemonInstallOptions } from "./types.js";

export async function runDaemonInstall(opts: DaemonInstallOptions) {
  const json = Boolean(opts.json);
  const { stdout, warnings, emit, fail } = createDaemonActionContext({ action: "install", json });

  if (resolveIsNixMode(process.env)) {
    fail("Nix mode detected; service install is disabled.");
    return;
  }

  let cfg = loadConfig();
  const portOverride = parsePort(opts.port);
  if (opts.port !== undefined && portOverride === null) {
    fail("Invalid port");
    return;
  }
  const port = portOverride ?? resolveGatewayPort(cfg);
  if (!Number.isFinite(port) || port <= 0) {
    fail("Invalid port");
    return;
  }
  const runtimeRaw = opts.runtime ? String(opts.runtime) : DEFAULT_GATEWAY_DAEMON_RUNTIME;
  if (!isGatewayDaemonRuntime(runtimeRaw)) {
    fail('Invalid --runtime (use "node" or "bun")');
    return;
  }

  const service = resolveGatewayService();
  let loaded = false;
  try {
    loaded = await service.isLoaded({ env: process.env });
  } catch (err) {
    fail(`Gateway service check failed: ${String(err)}`);
    return;
  }
  if (loaded) {
    if (!opts.force) {
      emit({
        ok: true,
        result: "already-installed",
        message: `Gateway service already ${service.loadedText}.`,
        service: buildDaemonServiceSnapshot(service, loaded),
      });
      if (!json) {
        defaultRuntime.log(`Gateway service already ${service.loadedText}.`);
        defaultRuntime.log(
          `Reinstall with: ${formatCliCommand("openclaw gateway install --force")}`,
        );
      }
      return;
    }
  }

  // Resolve effective auth mode to determine if token auto-generation is needed.
  // Password-mode and Tailscale-only installs do not need a token.
  const resolvedAuth = resolveGatewayAuth({
    authConfig: cfg.gateway?.auth,
    tailscaleMode: cfg.gateway?.tailscale?.mode ?? "off",
  });
  const needsToken =
    resolvedAuth.mode === "token" && !resolvedAuth.token && !resolvedAuth.allowTailscale;

  const explicitToken = opts.token?.trim() || undefined;
  const configToken = cfg.gateway?.auth?.token?.trim() || undefined;
  const envToken =
    process.env.OPENCLAW_GATEWAY_TOKEN?.trim() || process.env.CLAWDBOT_GATEWAY_TOKEN?.trim();
  let token: string | undefined = explicitToken || configToken || envToken;

  if (!token && needsToken) {
    token = randomToken();
    const warnMsg = "No gateway token found. Auto-generated one and saving to config.";
    if (json) {
      warnings.push(warnMsg);
    } else {
      defaultRuntime.log(warnMsg);
    }
  }

  // Persist token to config for token-auth service installs.
  // This keeps daemon runtime auth aligned with CLI/config auth without relying on embedded env vars.
  const shouldPersistToken =
    Boolean(token) && (Boolean(explicitToken) || (resolvedAuth.mode === "token" && !configToken));
  if (shouldPersistToken && token) {
    try {
      const snapshot = await readConfigFileSnapshot();
      if (snapshot.exists && !snapshot.valid) {
        fail(
          "Config file exists but is invalid; cannot persist gateway token for daemon install. Fix config and rerun.",
        );
        return;
      } else {
        const baseConfig = snapshot.exists ? snapshot.config : {};
        const baseToken = baseConfig.gateway?.auth?.token?.trim();
        const nextToken = explicitToken || token;
        const nextConfig = {
          ...baseConfig,
          gateway: {
            ...baseConfig.gateway,
            auth: {
              ...baseConfig.gateway?.auth,
              mode: "token" as const,
              token: nextToken,
            },
          },
        };
        if (baseToken !== nextToken || baseConfig.gateway?.auth?.mode !== "token") {
          await writeConfigFile(nextConfig);
        }
        cfg = nextConfig;
        token = nextToken;
      }
    } catch (err) {
      fail(`Could not persist gateway token to config: ${String(err)}`);
      return;
    }
  }

  const { programArguments, workingDirectory, environment } = await buildGatewayInstallPlan({
    env: process.env,
    port,
    runtime: runtimeRaw,
    warn: (message) => {
      if (json) {
        warnings.push(message);
      } else {
        defaultRuntime.log(message);
      }
    },
    config: cfg,
  });

  await installDaemonServiceAndEmit({
    serviceNoun: "Gateway",
    service,
    warnings,
    emit,
    fail,
    install: async () => {
      await service.install({
        env: process.env,
        stdout,
        programArguments,
        workingDirectory,
        environment,
      });
    },
  });
}
