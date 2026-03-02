import { withProgress } from "../cli/progress.js";
import { loadConfig, readConfigFileSnapshot, writeConfigFile } from "../config/config.js";
import { resolveGatewayService } from "../daemon/service.js";
import { resolveGatewayAuth } from "../gateway/auth.js";
import type { RuntimeEnv } from "../runtime.js";
import { note } from "../terminal/note.js";
import { confirm, select } from "./configure.shared.js";
import { buildGatewayInstallPlan, gatewayInstallErrorHint } from "./daemon-install-helpers.js";
import {
  DEFAULT_GATEWAY_DAEMON_RUNTIME,
  GATEWAY_DAEMON_RUNTIME_OPTIONS,
  type GatewayDaemonRuntime,
} from "./daemon-runtime.js";
import { guardCancel } from "./onboard-helpers.js";
import { ensureSystemdUserLingerInteractive } from "./systemd-linger.js";

export async function maybeInstallDaemon(params: {
  runtime: RuntimeEnv;
  port: number;
  gatewayToken?: string;
  daemonRuntime?: GatewayDaemonRuntime;
}) {
  const service = resolveGatewayService();
  const loaded = await service.isLoaded({ env: process.env });
  let shouldCheckLinger = false;
  let shouldInstall = true;
  let daemonRuntime = params.daemonRuntime ?? DEFAULT_GATEWAY_DAEMON_RUNTIME;
  if (loaded) {
    const action = guardCancel(
      await select({
        message: "Gateway service already installed",
        options: [
          { value: "restart", label: "Restart" },
          { value: "reinstall", label: "Reinstall" },
          { value: "skip", label: "Skip" },
        ],
      }),
      params.runtime,
    );
    if (action === "restart") {
      await withProgress(
        { label: "Gateway service", indeterminate: true, delayMs: 0 },
        async (progress) => {
          progress.setLabel("Restarting Gateway service…");
          await service.restart({
            env: process.env,
            stdout: process.stdout,
          });
          progress.setLabel("Gateway service restarted.");
        },
      );
      shouldCheckLinger = true;
      shouldInstall = false;
    }
    if (action === "skip") {
      return;
    }
    if (action === "reinstall") {
      await withProgress(
        { label: "Gateway service", indeterminate: true, delayMs: 0 },
        async (progress) => {
          progress.setLabel("Uninstalling Gateway service…");
          await service.uninstall({ env: process.env, stdout: process.stdout });
          progress.setLabel("Gateway service uninstalled.");
        },
      );
    }
  }

  if (shouldInstall) {
    let installError: string | null = null;
    if (!params.daemonRuntime) {
      if (GATEWAY_DAEMON_RUNTIME_OPTIONS.length === 1) {
        daemonRuntime = GATEWAY_DAEMON_RUNTIME_OPTIONS[0]?.value ?? DEFAULT_GATEWAY_DAEMON_RUNTIME;
      } else {
        daemonRuntime = guardCancel(
          await select({
            message: "Gateway service runtime",
            options: GATEWAY_DAEMON_RUNTIME_OPTIONS,
            initialValue: DEFAULT_GATEWAY_DAEMON_RUNTIME,
          }),
          params.runtime,
        ) as GatewayDaemonRuntime;
      }
    }
    await withProgress(
      { label: "Gateway service", indeterminate: true, delayMs: 0 },
      async (progress) => {
        progress.setLabel("Preparing Gateway service…");

        const cfg = loadConfig();
        let cfgForInstall = cfg;
        const explicitToken = params.gatewayToken?.trim() || undefined;
        const configToken = cfg.gateway?.auth?.token?.trim() || undefined;
        const envToken =
          process.env.OPENCLAW_GATEWAY_TOKEN?.trim() || process.env.CLAWDBOT_GATEWAY_TOKEN?.trim();
        const token = explicitToken || configToken || envToken;
        const resolvedAuth = resolveGatewayAuth({
          authConfig: cfg.gateway?.auth,
          tailscaleMode: cfg.gateway?.tailscale?.mode ?? "off",
        });
        const shouldPersistToken =
          Boolean(token) &&
          (Boolean(explicitToken) || (resolvedAuth.mode === "token" && !configToken));
        if (shouldPersistToken && token) {
          try {
            const snapshot = await readConfigFileSnapshot();
            if (snapshot.exists && !snapshot.valid) {
              installError =
                "Config file exists but is invalid; cannot persist gateway token before service install. Fix config and rerun.";
              progress.setLabel("Gateway service install failed.");
              return;
            }
            const baseConfig = snapshot.exists ? snapshot.config : {};
            const nextToken = explicitToken || token;
            const baseToken = baseConfig.gateway?.auth?.token?.trim();
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
            cfgForInstall = nextConfig;
          } catch (err) {
            installError = `Could not persist gateway token to config: ${String(err)}`;
            progress.setLabel("Gateway service install failed.");
            return;
          }
        }

        const { programArguments, workingDirectory, environment } = await buildGatewayInstallPlan({
          env: process.env,
          port: params.port,
          runtime: daemonRuntime,
          warn: (message, title) => note(message, title),
          config: cfgForInstall,
        });

        progress.setLabel("Installing Gateway service…");
        try {
          await service.install({
            env: process.env,
            stdout: process.stdout,
            programArguments,
            workingDirectory,
            environment,
          });
          progress.setLabel("Gateway service installed.");
        } catch (err) {
          installError = err instanceof Error ? err.message : String(err);
          progress.setLabel("Gateway service install failed.");
        }
      },
    );
    if (installError) {
      note("Gateway service install failed: " + installError, "Gateway");
      note(gatewayInstallErrorHint(), "Gateway");
      return;
    }
    shouldCheckLinger = true;
  }

  if (shouldCheckLinger) {
    await ensureSystemdUserLingerInteractive({
      runtime: params.runtime,
      prompter: {
        confirm: async (p) => guardCancel(await confirm(p), params.runtime),
        note,
      },
      reason:
        "Linux installs use a systemd user service. Without lingering, systemd stops the user session on logout/idle and kills the Gateway.",
      requireConfirm: true,
    });
  }
}
