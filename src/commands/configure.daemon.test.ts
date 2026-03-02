import { beforeEach, describe, expect, it, vi } from "vitest";
import { withEnvAsync } from "../test-utils/env.js";

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  readConfigFileSnapshot: vi.fn(),
  writeConfigFile: vi.fn().mockResolvedValue(undefined),
  resolveGatewayAuth: vi.fn(),
  serviceIsLoaded: vi.fn().mockResolvedValue(false),
  serviceInstall: vi.fn().mockResolvedValue(undefined),
  serviceRestart: vi.fn().mockResolvedValue(undefined),
  serviceUninstall: vi.fn().mockResolvedValue(undefined),
  buildGatewayInstallPlan: vi.fn().mockResolvedValue({
    programArguments: ["/usr/bin/node", "gateway"],
    workingDirectory: "/tmp",
    environment: {},
  }),
  note: vi.fn(),
  ensureSystemdUserLingerInteractive: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../cli/progress.js", () => ({
  withProgress: async (
    _opts: unknown,
    run: (progress: { setLabel: (label: string) => void }) => Promise<void>,
  ) => {
    await run({ setLabel: vi.fn() });
  },
}));

vi.mock("../config/config.js", () => ({
  loadConfig: mocks.loadConfig,
  readConfigFileSnapshot: mocks.readConfigFileSnapshot,
  writeConfigFile: mocks.writeConfigFile,
}));

vi.mock("../daemon/service.js", () => ({
  resolveGatewayService: () => ({
    isLoaded: mocks.serviceIsLoaded,
    install: mocks.serviceInstall,
    restart: mocks.serviceRestart,
    uninstall: mocks.serviceUninstall,
  }),
}));

vi.mock("../gateway/auth.js", () => ({
  resolveGatewayAuth: mocks.resolveGatewayAuth,
}));

vi.mock("../terminal/note.js", () => ({
  note: mocks.note,
}));

vi.mock("./daemon-install-helpers.js", () => ({
  buildGatewayInstallPlan: mocks.buildGatewayInstallPlan,
  gatewayInstallErrorHint: () => "hint",
}));

vi.mock("./systemd-linger.js", () => ({
  ensureSystemdUserLingerInteractive: mocks.ensureSystemdUserLingerInteractive,
}));

const { maybeInstallDaemon } = await import("./configure.daemon.js");

function makeRuntime() {
  return {
    log: vi.fn(),
    error: vi.fn(),
    exit: vi.fn(),
  };
}

describe("maybeInstallDaemon", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadConfig.mockReturnValue({
      gateway: {
        auth: {
          mode: "token",
        },
      },
    });
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

  it("persists env token before installing when config token is missing", async () => {
    await withEnvAsync({ OPENCLAW_GATEWAY_TOKEN: "env-token" }, async () => {
      await maybeInstallDaemon({
        runtime: makeRuntime(),
        port: 18789,
        daemonRuntime: "node",
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

  it("aborts install when config is invalid and token persistence is required", async () => {
    mocks.readConfigFileSnapshot.mockResolvedValue({
      path: "/tmp/openclaw.json",
      exists: true,
      valid: false,
      issues: [],
    });

    await withEnvAsync({ OPENCLAW_GATEWAY_TOKEN: "env-token" }, async () => {
      await maybeInstallDaemon({
        runtime: makeRuntime(),
        port: 18789,
        daemonRuntime: "node",
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
