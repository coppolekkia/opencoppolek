import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

import { splitArgsPreservingQuotes } from "./arg-split.js";
import { buildSystemdUnit, parseSystemdExecStart } from "./systemd-unit.js";
import {
  _resolvePreviousGatewayUnitNameForCleanupForTests,
  installSystemdService,
  isSystemdUserServiceAvailable,
  parseSystemdShow,
  restartSystemdService,
  resolveSystemdUserUnitPath,
  stopSystemdService,
  uninstallSystemdService,
} from "./systemd.js";

describe("systemd availability", () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });

  it("returns true when systemctl --user succeeds", async () => {
    execFileMock.mockImplementation((_cmd, _args, _opts, cb) => {
      cb(null, "", "");
    });
    await expect(isSystemdUserServiceAvailable()).resolves.toBe(true);
  });

  it("returns false when systemd user bus is unavailable", async () => {
    execFileMock.mockImplementation((_cmd, _args, _opts, cb) => {
      const err = new Error("Failed to connect to bus") as Error & {
        stderr?: string;
        code?: number;
      };
      err.stderr = "Failed to connect to bus";
      err.code = 1;
      cb(err, "", "");
    });
    await expect(isSystemdUserServiceAvailable()).resolves.toBe(false);
  });

  it("falls back to machine user scope when --user bus is unavailable", async () => {
    execFileMock
      .mockImplementationOnce((_cmd, args, _opts, cb) => {
        expect(args).toEqual(["--user", "status"]);
        const err = new Error(
          "Failed to connect to user scope bus via local transport",
        ) as Error & {
          stderr?: string;
          code?: number;
        };
        err.stderr =
          "Failed to connect to user scope bus via local transport: $DBUS_SESSION_BUS_ADDRESS and $XDG_RUNTIME_DIR not defined";
        err.code = 1;
        cb(err, "", "");
      })
      .mockImplementationOnce((_cmd, args, _opts, cb) => {
        expect(args).toEqual(["--machine", "debian@", "--user", "status"]);
        cb(null, "", "");
      });

    await expect(isSystemdUserServiceAvailable({ USER: "debian" })).resolves.toBe(true);
  });
});

describe("isSystemdServiceEnabled", () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });

  it("returns false when systemctl is not present", async () => {
    const { isSystemdServiceEnabled } = await import("./systemd.js");
    execFileMock.mockImplementation((_cmd, _args, _opts, cb) => {
      const err = new Error("spawn systemctl EACCES") as Error & { code?: string };
      err.code = "EACCES";
      cb(err, "", "");
    });
    const result = await isSystemdServiceEnabled({ env: {} });
    expect(result).toBe(false);
  });

  it("calls systemctl is-enabled when systemctl is present", async () => {
    const { isSystemdServiceEnabled } = await import("./systemd.js");
    execFileMock.mockImplementationOnce((_cmd, args, _opts, cb) => {
      expect(args).toEqual(["--user", "is-enabled", "openclaw-gateway.service"]);
      cb(null, "enabled", "");
    });
    const result = await isSystemdServiceEnabled({ env: {} });
    expect(result).toBe(true);
  });

  it("returns false when systemctl reports disabled", async () => {
    const { isSystemdServiceEnabled } = await import("./systemd.js");
    execFileMock.mockImplementationOnce((_cmd, _args, _opts, cb) => {
      const err = new Error("disabled") as Error & { code?: number };
      err.code = 1;
      cb(err, "disabled", "");
    });
    const result = await isSystemdServiceEnabled({ env: {} });
    expect(result).toBe(false);
  });

  it("throws when systemctl is-enabled fails for non-state errors", async () => {
    const { isSystemdServiceEnabled } = await import("./systemd.js");
    execFileMock
      .mockImplementationOnce((_cmd, args, _opts, cb) => {
        expect(args).toEqual(["--user", "is-enabled", "openclaw-gateway.service"]);
        const err = new Error("Failed to connect to bus") as Error & { code?: number };
        err.code = 1;
        cb(err, "", "Failed to connect to bus");
      })
      .mockImplementationOnce((_cmd, args, _opts, cb) => {
        expect(args[0]).toBe("--machine");
        expect(String(args[1])).toMatch(/^[^@]+@$/);
        expect(args.slice(2)).toEqual(["--user", "is-enabled", "openclaw-gateway.service"]);
        const err = new Error("permission denied") as Error & { code?: number };
        err.code = 1;
        cb(err, "", "permission denied");
      });
    await expect(isSystemdServiceEnabled({ env: {} })).rejects.toThrow(
      "systemctl is-enabled unavailable: permission denied",
    );
  });

  it("returns false when systemctl is-enabled exits with code 4 (not-found)", async () => {
    const { isSystemdServiceEnabled } = await import("./systemd.js");
    execFileMock.mockImplementationOnce((_cmd, _args, _opts, cb) => {
      // On Ubuntu 24.04, `systemctl --user is-enabled <unit>` exits with
      // code 4 and prints "not-found" to stdout when the unit doesn't exist.
      const err = new Error(
        "Command failed: systemctl --user is-enabled openclaw-gateway.service",
      ) as Error & { code?: number };
      err.code = 4;
      cb(err, "not-found\n", "");
    });
    const result = await isSystemdServiceEnabled({ env: {} });
    expect(result).toBe(false);
  });
});

describe("systemd runtime parsing", () => {
  it("parses active state details", () => {
    const output = [
      "ActiveState=inactive",
      "SubState=dead",
      "MainPID=0",
      "ExecMainStatus=2",
      "ExecMainCode=exited",
    ].join("\n");
    expect(parseSystemdShow(output)).toEqual({
      activeState: "inactive",
      subState: "dead",
      execMainStatus: 2,
      execMainCode: "exited",
    });
  });
});

describe("resolveSystemdUserUnitPath", () => {
  it.each([
    {
      name: "uses default service name when OPENCLAW_PROFILE is unset",
      env: { HOME: "/home/test" },
      expected: "/home/test/.config/systemd/user/openclaw-gateway.service",
    },
    {
      name: "uses profile-specific service name when OPENCLAW_PROFILE is set to a custom value",
      env: { HOME: "/home/test", OPENCLAW_PROFILE: "jbphoenix" },
      expected: "/home/test/.config/systemd/user/openclaw-gateway-jbphoenix.service",
    },
    {
      name: "prefers OPENCLAW_SYSTEMD_UNIT over OPENCLAW_PROFILE",
      env: {
        HOME: "/home/test",
        OPENCLAW_PROFILE: "jbphoenix",
        OPENCLAW_SYSTEMD_UNIT: "openclaw-gateway-custom",
      },
      expected: "/home/test/.config/systemd/user/openclaw-gateway-custom.service",
    },
    {
      name: "handles OPENCLAW_SYSTEMD_UNIT with .service suffix",
      env: {
        HOME: "/home/test",
        OPENCLAW_SYSTEMD_UNIT: "openclaw-gateway-custom.service",
      },
      expected: "/home/test/.config/systemd/user/openclaw-gateway-custom.service",
    },
    {
      name: "trims whitespace from OPENCLAW_SYSTEMD_UNIT",
      env: {
        HOME: "/home/test",
        OPENCLAW_SYSTEMD_UNIT: "  openclaw-gateway-custom  ",
      },
      expected: "/home/test/.config/systemd/user/openclaw-gateway-custom.service",
    },
    {
      name: "allows OpenClaw node override in node service context",
      env: {
        HOME: "/home/test",
        OPENCLAW_SERVICE_KIND: "node",
        OPENCLAW_SYSTEMD_UNIT: "openclaw-node-worker",
      },
      expected: "/home/test/.config/systemd/user/openclaw-node-worker.service",
    },
  ])("$name", ({ env, expected }) => {
    expect(resolveSystemdUserUnitPath(env)).toBe(expected);
  });

  it.each([
    { name: "rejects path traversal", unit: "../escape" },
    { name: "rejects absolute path", unit: "/etc/systemd/system/sshd" },
    { name: "rejects slash", unit: "custom/unit" },
    { name: "rejects backslash", unit: "custom\\\\unit" },
    { name: "rejects dot-dot token", unit: "custom..unit" },
  ])("$name", ({ unit }) => {
    expect(() =>
      resolveSystemdUserUnitPath({
        HOME: "/home/test",
        OPENCLAW_SYSTEMD_UNIT: unit,
      }),
    ).toThrow("Invalid systemd unit name");
  });

  it("rejects non-OpenClaw unit names", () => {
    expect(() =>
      resolveSystemdUserUnitPath({
        HOME: "/home/test",
        OPENCLAW_SYSTEMD_UNIT: "pipewire",
      }),
    ).toThrow("Refusing to manage non-OpenClaw");
  });
});

describe("resolvePreviousGatewayUnitNameForCleanup", () => {
  it("returns previous gateway unit when gateway unit name is overridden", () => {
    expect(
      _resolvePreviousGatewayUnitNameForCleanupForTests(
        { OPENCLAW_SYSTEMD_UNIT: "openclaw-gateway-custom" },
        "openclaw-gateway-custom",
      ),
    ).toBe("openclaw-gateway");
  });

  it("returns null when current unit matches default gateway unit", () => {
    expect(_resolvePreviousGatewayUnitNameForCleanupForTests({}, "openclaw-gateway")).toBeNull();
  });

  it("returns null for non-gateway service kinds", () => {
    expect(
      _resolvePreviousGatewayUnitNameForCleanupForTests(
        { OPENCLAW_SERVICE_KIND: "node", OPENCLAW_SYSTEMD_UNIT: "openclaw-node" },
        "openclaw-node",
      ),
    ).toBeNull();
  });

  it("returns profile-specific previous gateway unit", () => {
    expect(
      _resolvePreviousGatewayUnitNameForCleanupForTests(
        { OPENCLAW_PROFILE: "work", OPENCLAW_SYSTEMD_UNIT: "custom-work-gateway" },
        "custom-work-gateway",
      ),
    ).toBe("openclaw-gateway-work");
  });
});

describe("systemd unit file safety guards", () => {
  beforeEach(() => {
    execFileMock.mockReset();
    execFileMock.mockImplementation((_cmd, _args, _opts, cb) => cb(null, "", ""));
  });

  it("rejects installing over a symlinked unit file", async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-systemd-symlink-"));
    try {
      const unitDir = path.join(home, ".config", "systemd", "user");
      await fs.mkdir(unitDir, { recursive: true });
      const targetPath = path.join(home, "outside-target");
      await fs.writeFile(targetPath, "outside", "utf8");
      await fs.symlink(targetPath, path.join(unitDir, "openclaw-gateway.service"));

      await expect(
        installSystemdService({
          env: { HOME: home },
          stdout: { write: vi.fn() } as unknown as NodeJS.WritableStream,
          programArguments: ["/usr/bin/openclaw", "gateway", "run"],
        }),
      ).rejects.toThrow("symlinked systemd unit file");
    } finally {
      await fs.rm(home, { recursive: true, force: true });
    }
  });

  it("rejects uninstalling a hard-linked unit file", async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-systemd-hardlink-"));
    try {
      const unitDir = path.join(home, ".config", "systemd", "user");
      await fs.mkdir(unitDir, { recursive: true });
      const sensitivePath = path.join(home, "sensitive-file");
      const unitPath = path.join(unitDir, "openclaw-gateway.service");
      await fs.writeFile(sensitivePath, "do-not-delete", "utf8");
      await fs.link(sensitivePath, unitPath);

      await expect(
        uninstallSystemdService({
          env: { HOME: home },
          stdout: { write: vi.fn() } as unknown as NodeJS.WritableStream,
        }),
      ).rejects.toThrow("hard links");
    } finally {
      await fs.rm(home, { recursive: true, force: true });
    }
  });
});

describe("systemd install migration behavior", () => {
  beforeEach(() => {
    execFileMock.mockReset();
    execFileMock.mockImplementation((_cmd, _args, _opts, cb) => cb(null, "", ""));
  });

  it("disables previous gateway unit before restarting renamed unit", async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-systemd-migrate-"));
    try {
      const calls: string[][] = [];
      execFileMock.mockImplementation((_cmd, args, _opts, cb) => {
        calls.push(args);
        cb(null, "", "");
      });

      await installSystemdService({
        env: { HOME: home, OPENCLAW_SYSTEMD_UNIT: "openclaw-gateway-custom" },
        stdout: { write: vi.fn() } as unknown as NodeJS.WritableStream,
        programArguments: ["/usr/bin/openclaw", "gateway", "run"],
      });

      const render = (args: string[]) => args.join(" ");
      const disableIndex = calls.findIndex(
        (args) => render(args) === "--user disable --now openclaw-gateway.service",
      );
      const restartIndex = calls.findIndex(
        (args) => render(args) === "--user restart openclaw-gateway-custom.service",
      );
      expect(disableIndex).toBeGreaterThanOrEqual(0);
      expect(restartIndex).toBeGreaterThanOrEqual(0);
      expect(disableIndex).toBeLessThan(restartIndex);
    } finally {
      await fs.rm(home, { recursive: true, force: true });
    }
  });

  it("allows symlinked config path when resolved unit directory stays inside home", async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-systemd-configlink-"));
    try {
      const realConfig = path.join(home, "real-config");
      await fs.mkdir(realConfig, { recursive: true });
      await fs.symlink(realConfig, path.join(home, ".config"));

      await expect(
        installSystemdService({
          env: { HOME: home },
          stdout: { write: vi.fn() } as unknown as NodeJS.WritableStream,
          programArguments: ["/usr/bin/openclaw", "gateway", "run"],
        }),
      ).resolves.toEqual({
        unitPath: `${home}/.config/systemd/user/openclaw-gateway.service`,
      });

      await expect(
        fs.access(path.join(realConfig, "systemd", "user", "openclaw-gateway.service")),
      ).resolves.toBeUndefined();
    } finally {
      await fs.rm(home, { recursive: true, force: true });
    }
  });
});

describe("splitArgsPreservingQuotes", () => {
  it("splits on whitespace outside quotes", () => {
    expect(splitArgsPreservingQuotes('/usr/bin/openclaw gateway start --name "My Bot"')).toEqual([
      "/usr/bin/openclaw",
      "gateway",
      "start",
      "--name",
      "My Bot",
    ]);
  });

  it("supports systemd-style backslash escaping", () => {
    expect(
      splitArgsPreservingQuotes('openclaw --name "My \\"Bot\\"" --foo bar', {
        escapeMode: "backslash",
      }),
    ).toEqual(["openclaw", "--name", 'My "Bot"', "--foo", "bar"]);
  });

  it("supports schtasks-style escaped quotes while preserving other backslashes", () => {
    expect(
      splitArgsPreservingQuotes('openclaw --path "C:\\\\Program Files\\\\OpenClaw"', {
        escapeMode: "backslash-quote-only",
      }),
    ).toEqual(["openclaw", "--path", "C:\\\\Program Files\\\\OpenClaw"]);

    expect(
      splitArgsPreservingQuotes('openclaw --label "My \\"Quoted\\" Name"', {
        escapeMode: "backslash-quote-only",
      }),
    ).toEqual(["openclaw", "--label", 'My "Quoted" Name']);
  });
});

describe("parseSystemdExecStart", () => {
  it("preserves quoted arguments", () => {
    const execStart = '/usr/bin/openclaw gateway start --name "My Bot"';
    expect(parseSystemdExecStart(execStart)).toEqual([
      "/usr/bin/openclaw",
      "gateway",
      "start",
      "--name",
      "My Bot",
    ]);
  });
});

describe("systemd service control", () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });

  it("stops the resolved user unit", async () => {
    execFileMock
      .mockImplementationOnce((_cmd, _args, _opts, cb) => cb(null, "", ""))
      .mockImplementationOnce((_cmd, args, _opts, cb) => {
        expect(args).toEqual(["--user", "stop", "openclaw-gateway.service"]);
        cb(null, "", "");
      });
    const write = vi.fn();
    const stdout = { write } as unknown as NodeJS.WritableStream;

    await stopSystemdService({ stdout, env: {} });

    expect(write).toHaveBeenCalledTimes(1);
    expect(String(write.mock.calls[0]?.[0])).toContain("Stopped systemd service");
  });

  it("restarts a profile-specific user unit", async () => {
    execFileMock
      .mockImplementationOnce((_cmd, _args, _opts, cb) => cb(null, "", ""))
      .mockImplementationOnce((_cmd, args, _opts, cb) => {
        expect(args).toEqual(["--user", "restart", "openclaw-gateway-work.service"]);
        cb(null, "", "");
      });
    const write = vi.fn();
    const stdout = { write } as unknown as NodeJS.WritableStream;

    await restartSystemdService({ stdout, env: { OPENCLAW_PROFILE: "work" } });

    expect(write).toHaveBeenCalledTimes(1);
    expect(String(write.mock.calls[0]?.[0])).toContain("Restarted systemd service");
  });

  it("surfaces stop failures with systemctl detail", async () => {
    execFileMock
      .mockImplementationOnce((_cmd, _args, _opts, cb) => cb(null, "", ""))
      .mockImplementationOnce((_cmd, _args, _opts, cb) => {
        const err = new Error("stop failed") as Error & { code?: number };
        err.code = 1;
        cb(err, "", "permission denied");
      });

    await expect(
      stopSystemdService({
        stdout: { write: vi.fn() } as unknown as NodeJS.WritableStream,
        env: {},
      }),
    ).rejects.toThrow("systemctl stop failed: permission denied");
  });

  it("targets the sudo caller's user scope when SUDO_USER is set", async () => {
    execFileMock
      .mockImplementationOnce((_cmd, args, _opts, cb) => {
        expect(args).toEqual(["--machine", "debian@", "--user", "status"]);
        cb(null, "", "");
      })
      .mockImplementationOnce((_cmd, args, _opts, cb) => {
        expect(args).toEqual([
          "--machine",
          "debian@",
          "--user",
          "restart",
          "openclaw-gateway.service",
        ]);
        cb(null, "", "");
      });
    const write = vi.fn();
    const stdout = { write } as unknown as NodeJS.WritableStream;

    await restartSystemdService({ stdout, env: { SUDO_USER: "debian" } });

    expect(write).toHaveBeenCalledTimes(1);
    expect(String(write.mock.calls[0]?.[0])).toContain("Restarted systemd service");
  });

  it("keeps direct --user scope when SUDO_USER is root", async () => {
    execFileMock
      .mockImplementationOnce((_cmd, args, _opts, cb) => {
        expect(args).toEqual(["--user", "status"]);
        cb(null, "", "");
      })
      .mockImplementationOnce((_cmd, args, _opts, cb) => {
        expect(args).toEqual(["--user", "restart", "openclaw-gateway.service"]);
        cb(null, "", "");
      });
    const write = vi.fn();
    const stdout = { write } as unknown as NodeJS.WritableStream;

    await restartSystemdService({ stdout, env: { SUDO_USER: "root", USER: "root" } });

    expect(write).toHaveBeenCalledTimes(1);
    expect(String(write.mock.calls[0]?.[0])).toContain("Restarted systemd service");
  });

  it("falls back to machine user scope for restart when user bus env is missing", async () => {
    execFileMock
      .mockImplementationOnce((_cmd, args, _opts, cb) => {
        expect(args).toEqual(["--user", "status"]);
        const err = new Error("Failed to connect to user scope bus") as Error & {
          stderr?: string;
          code?: number;
        };
        err.stderr =
          "Failed to connect to user scope bus via local transport: $DBUS_SESSION_BUS_ADDRESS and $XDG_RUNTIME_DIR not defined";
        err.code = 1;
        cb(err, "", "");
      })
      .mockImplementationOnce((_cmd, args, _opts, cb) => {
        expect(args).toEqual(["--machine", "debian@", "--user", "status"]);
        cb(null, "", "");
      })
      .mockImplementationOnce((_cmd, args, _opts, cb) => {
        expect(args).toEqual(["--user", "restart", "openclaw-gateway.service"]);
        const err = new Error("Failed to connect to user scope bus") as Error & {
          stderr?: string;
          code?: number;
        };
        err.stderr = "Failed to connect to user scope bus";
        err.code = 1;
        cb(err, "", "");
      })
      .mockImplementationOnce((_cmd, args, _opts, cb) => {
        expect(args).toEqual([
          "--machine",
          "debian@",
          "--user",
          "restart",
          "openclaw-gateway.service",
        ]);
        cb(null, "", "");
      });
    const write = vi.fn();
    const stdout = { write } as unknown as NodeJS.WritableStream;

    await restartSystemdService({ stdout, env: { USER: "debian" } });

    expect(write).toHaveBeenCalledTimes(1);
    expect(String(write.mock.calls[0]?.[0])).toContain("Restarted systemd service");
  });
});

describe("buildSystemdUnit", () => {
  it("omits notify/watchdog directives by default", () => {
    const unit = buildSystemdUnit({
      programArguments: ["/usr/bin/openclaw", "gateway", "start"],
    });
    expect(unit).not.toContain("Type=notify");
    expect(unit).not.toContain("NotifyAccess=main");
    expect(unit).not.toContain("WatchdogSec=90");
  });

  it("includes Type=notify when watchdog is enabled", () => {
    const unit = buildSystemdUnit({
      programArguments: ["/usr/bin/openclaw", "gateway", "start"],
      watchdog: true,
    });
    expect(unit).toContain("Type=notify");
  });

  it("includes NotifyAccess=main when watchdog is enabled", () => {
    const unit = buildSystemdUnit({
      programArguments: ["/usr/bin/openclaw", "gateway", "start"],
      watchdog: true,
    });
    expect(unit).toContain("NotifyAccess=main");
  });

  it("includes WatchdogSec=90 when watchdog is enabled", () => {
    const unit = buildSystemdUnit({
      programArguments: ["/usr/bin/openclaw", "gateway", "start"],
      watchdog: true,
    });
    expect(unit).toContain("WatchdogSec=90");
  });

  it("places watchdog directives in [Service] section", () => {
    const unit = buildSystemdUnit({
      programArguments: ["/usr/bin/openclaw", "gateway", "start"],
      watchdog: true,
    });
    const serviceStart = unit.indexOf("[Service]");
    const installStart = unit.indexOf("[Install]");
    const typePos = unit.indexOf("Type=notify");
    const notifyAccessPos = unit.indexOf("NotifyAccess=main");
    const watchdogPos = unit.indexOf("WatchdogSec=90");
    expect(typePos).toBeGreaterThan(serviceStart);
    expect(typePos).toBeLessThan(installStart);
    expect(notifyAccessPos).toBeGreaterThan(serviceStart);
    expect(notifyAccessPos).toBeLessThan(installStart);
    expect(watchdogPos).toBeGreaterThan(serviceStart);
    expect(watchdogPos).toBeLessThan(installStart);
  });
});
