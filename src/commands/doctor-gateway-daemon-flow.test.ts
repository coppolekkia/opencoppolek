import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { withEnvAsync } from "../test-utils/env.js";

const mocks = vi.hoisted(() => ({
  resolveGatewayPort: vi.fn(() => 18789),
  readConfigFileSnapshot: vi.fn(),
  writeConfigFile: vi.fn().mockResolvedValue(undefined),
  resolveGatewayAuth: vi.fn(),
  serviceIsLoaded: vi.fn().mockResolvedValue(false),
  serviceReadRuntime: vi.fn(),
  serviceInstall: vi.fn().mockResolvedValue(undefined),
  serviceRestart: vi.fn().mockResolvedValue(undefined),
  inspectPortUsage: vi.fn(async () => ({ status: "free" })),
  isSystemdUserServiceAvailable: vi.fn(async () => true),
  isWSL: vi.fn(async () => false),
  buildGatewayInstallPlan: vi.fn().mockResolvedValue({
    programArguments: ["/usr/bin/node", "gateway"],
    workingDirectory: "/tmp",
    environment: {},
  }),
  note: vi.fn(),
}));

vi.mock("../config/config.js", () => ({
  resolveGatewayPort: mocks.resolveGatewayPort,
  readConfigFileSnapshot: mocks.readConfigFileSnapshot,
  writeConfigFile: mocks.writeConfigFile,
}));

vi.mock("../gateway/auth.js", () => ({
  resolveGatewayAuth: mocks.resolveGatewayAuth,
}));

vi.mock("../daemon/service.js", () => ({
  resolveGatewayService: () => ({
    isLoaded: mocks.serviceIsLoaded,
    readRuntime: mocks.serviceReadRuntime,
    install: mocks.serviceInstall,
    restart: mocks.serviceRestart,
  }),
}));

vi.mock("../infra/ports.js", () => ({
  inspectPortUsage: mocks.inspectPortUsage,
  formatPortDiagnostics: () => ["busy"],
}));

vi.mock("../daemon/systemd.js", () => ({
  isSystemdUserServiceAvailable: mocks.isSystemdUserServiceAvailable,
}));

vi.mock("../infra/wsl.js", () => ({
  isWSL: mocks.isWSL,
}));

vi.mock("../terminal/note.js", () => ({
  note: mocks.note,
}));

vi.mock("../daemon/launchd.js", () => ({
  isLaunchAgentListed: vi.fn(async () => false),
  isLaunchAgentLoaded: vi.fn(async () => false),
  launchAgentPlistExists: vi.fn(async () => false),
  repairLaunchAgentBootstrap: vi.fn(async () => ({ ok: true })),
}));

vi.mock("./daemon-install-helpers.js", () => ({
  buildGatewayInstallPlan: mocks.buildGatewayInstallPlan,
  gatewayInstallErrorHint: () => "hint",
}));

vi.mock("./doctor-format.js", () => ({
  buildGatewayRuntimeHints: () => [],
  formatGatewayRuntimeSummary: () => "",
}));

vi.mock("./health.js", () => ({
  healthCommand: vi.fn(),
}));

vi.mock("./health-format.js", () => ({
  formatHealthCheckFailure: (err: unknown) => String(err),
}));

const { maybeRepairGatewayDaemon } = await import("./doctor-gateway-daemon-flow.js");

function makeRuntime() {
  return {
    log: vi.fn(),
    error: vi.fn(),
    exit: vi.fn(),
  };
}

function makePrompter() {
  return {
    confirm: vi.fn().mockResolvedValue(true),
    confirmRepair: vi.fn().mockResolvedValue(true),
    confirmAggressive: vi.fn().mockResolvedValue(true),
    confirmSkipInNonInteractive: vi.fn().mockResolvedValue(true),
    select: vi.fn().mockResolvedValue("node"),
    shouldRepair: false,
    shouldForce: false,
  };
}

function makeCfg(): OpenClawConfig {
  return {
    gateway: {
      mode: "local",
      auth: {
        mode: "token",
      },
    },
  };
}

describe("maybeRepairGatewayDaemon", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveGatewayAuth.mockReturnValue({
      mode: "token",
      allowTailscale: false,
      token: undefined,
    });
    mocks.readConfigFileSnapshot.mockResolvedValue({
      path: "/tmp/openclaw.json",
      exists: false,
      valid: true,
      issues: [],
      config: {},
    });
  });

  it("persists env token before doctor-triggered service install", async () => {
    await withEnvAsync({ OPENCLAW_GATEWAY_TOKEN: "env-token" }, async () => {
      await maybeRepairGatewayDaemon({
        cfg: makeCfg(),
        runtime: makeRuntime(),
        prompter: makePrompter(),
        options: {},
        gatewayDetailsMessage: "",
        healthOk: false,
      });

      expect(mocks.writeConfigFile).toHaveBeenCalledWith(
        expect.objectContaining({
          gateway: expect.objectContaining({
            auth: expect.objectContaining({
              mode: "token",
              token: "env-token",
            }),
          }),
        }),
      );
      expect(mocks.buildGatewayInstallPlan).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            gateway: expect.objectContaining({
              auth: expect.objectContaining({
                token: "env-token",
              }),
            }),
          }),
        }),
      );
      expect(mocks.serviceInstall).toHaveBeenCalledTimes(1);
    });
  });

  it("aborts doctor install when config is invalid and token persistence is required", async () => {
    mocks.readConfigFileSnapshot.mockResolvedValue({
      path: "/tmp/openclaw.json",
      exists: true,
      valid: false,
      issues: [],
    });

    await withEnvAsync({ OPENCLAW_GATEWAY_TOKEN: "env-token" }, async () => {
      await maybeRepairGatewayDaemon({
        cfg: makeCfg(),
        runtime: makeRuntime(),
        prompter: makePrompter(),
        options: {},
        gatewayDetailsMessage: "",
        healthOk: false,
      });
    });

    expect(mocks.buildGatewayInstallPlan).not.toHaveBeenCalled();
    expect(mocks.serviceInstall).not.toHaveBeenCalled();
    expect(mocks.note).toHaveBeenCalledWith(
      expect.stringMatching(/cannot persist gateway token/i),
      "Gateway",
    );
  });
});
