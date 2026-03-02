import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveIsNixMode: vi.fn(() => false),
  loadConfig: vi.fn(() => ({ gateway: { auth: { mode: "token" } } })),
  readConfigFileSnapshot: vi.fn(),
  resolveGatewayPort: vi.fn(() => 18789),
  writeConfigFile: vi.fn(),
  resolveGatewayAuth: vi.fn(() => ({
    mode: "token",
    allowTailscale: false,
    token: undefined,
  })),
  serviceIsLoaded: vi.fn().mockResolvedValue(false),
  serviceInstall: vi.fn().mockResolvedValue(undefined),
  buildGatewayInstallPlan: vi.fn().mockResolvedValue({
    programArguments: ["/usr/bin/node", "gateway"],
    workingDirectory: "/tmp",
    environment: {},
  }),
  createDaemonActionContext: vi.fn(),
  installDaemonServiceAndEmit: vi.fn(),
}));

vi.mock("../../commands/daemon-install-helpers.js", () => ({
  buildGatewayInstallPlan: mocks.buildGatewayInstallPlan,
}));

vi.mock("../../commands/onboard-helpers.js", () => ({
  randomToken: () => "generated-token",
}));

vi.mock("../../config/config.js", () => ({
  loadConfig: mocks.loadConfig,
  readConfigFileSnapshot: mocks.readConfigFileSnapshot,
  resolveGatewayPort: mocks.resolveGatewayPort,
  writeConfigFile: mocks.writeConfigFile,
}));

vi.mock("../../config/paths.js", () => ({
  resolveIsNixMode: mocks.resolveIsNixMode,
}));

vi.mock("../../daemon/service.js", () => ({
  resolveGatewayService: () => ({
    label: "systemd",
    loadedText: "enabled",
    notLoadedText: "disabled",
    isLoaded: mocks.serviceIsLoaded,
    install: mocks.serviceInstall,
  }),
}));

vi.mock("../../gateway/auth.js", () => ({
  resolveGatewayAuth: mocks.resolveGatewayAuth,
}));

vi.mock("./response.js", () => ({
  buildDaemonServiceSnapshot: vi.fn(),
  createDaemonActionContext: mocks.createDaemonActionContext,
  installDaemonServiceAndEmit: mocks.installDaemonServiceAndEmit,
}));

const { runDaemonInstall } = await import("./install.js");

describe("runDaemonInstall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveIsNixMode.mockReturnValue(false);
    mocks.loadConfig.mockReturnValue({ gateway: { auth: { mode: "token" } } });
    mocks.resolveGatewayPort.mockReturnValue(18789);
    mocks.resolveGatewayAuth.mockReturnValue({
      mode: "token",
      allowTailscale: false,
      token: undefined,
    });
    mocks.serviceIsLoaded.mockResolvedValue(false);
    mocks.buildGatewayInstallPlan.mockResolvedValue({
      programArguments: ["/usr/bin/node", "gateway"],
      workingDirectory: "/tmp",
      environment: {},
    });
    mocks.createDaemonActionContext.mockReturnValue({
      stdout: process.stdout,
      warnings: [],
      emit: vi.fn(),
      fail: (message: string) => {
        throw new Error(`FAIL:${message}`);
      },
    });
  });

  it("aborts install when config is invalid and token persistence is required", async () => {
    mocks.readConfigFileSnapshot.mockResolvedValue({
      path: "/tmp/openclaw.json",
      exists: true,
      valid: false,
      issues: [],
    });

    await expect(runDaemonInstall({ token: "explicit-token" })).rejects.toThrow(
      /cannot persist gateway token for daemon install/i,
    );
    expect(mocks.installDaemonServiceAndEmit).not.toHaveBeenCalled();
    expect(mocks.buildGatewayInstallPlan).not.toHaveBeenCalled();
  });

  it("aborts install when writing persisted token fails", async () => {
    mocks.readConfigFileSnapshot.mockResolvedValue({
      path: "/tmp/openclaw.json",
      exists: false,
      valid: true,
      issues: [],
      config: {},
    });
    mocks.writeConfigFile.mockRejectedValue(new Error("disk full"));

    await expect(runDaemonInstall({ token: "explicit-token" })).rejects.toThrow(
      /could not persist gateway token to config: error: disk full/i,
    );
    expect(mocks.installDaemonServiceAndEmit).not.toHaveBeenCalled();
    expect(mocks.buildGatewayInstallPlan).not.toHaveBeenCalled();
  });
});
