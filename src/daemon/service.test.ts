import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveGatewayService } from "./service.js";

describe("resolveGatewayService", () => {
  let originalPlatform: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
  });

  afterEach(() => {
    if (originalPlatform) {
      Object.defineProperty(process, "platform", originalPlatform);
    }
  });

  function setPlatform(platform: string) {
    Object.defineProperty(process, "platform", {
      value: platform,
      configurable: true,
      writable: true,
    });
  }

  it("returns a launchd service for darwin", () => {
    setPlatform("darwin");
    const service = resolveGatewayService();
    expect(service.label).toBe("LaunchAgent");
  });

  it("returns a systemd service for linux", () => {
    setPlatform("linux");
    const service = resolveGatewayService();
    expect(service.label).toBe("systemd");
  });

  it("returns a scheduled task service for win32", () => {
    setPlatform("win32");
    const service = resolveGatewayService();
    expect(service.label).toBe("Scheduled Task");
  });

  describe("unsupported platform stub", () => {
    beforeEach(() => {
      setPlatform("openbsd");
    });

    it("does not throw and returns a service stub", () => {
      expect(() => resolveGatewayService()).not.toThrow();
    });

    it("uses the platform name as label", () => {
      const service = resolveGatewayService();
      expect(service.label).toBe("openbsd");
    });

    it("isLoaded resolves to false", async () => {
      const service = resolveGatewayService();
      await expect(service.isLoaded({ env: process.env })).resolves.toBe(false);
    });

    it("readCommand resolves to null", async () => {
      const service = resolveGatewayService();
      await expect(service.readCommand(process.env)).resolves.toBeNull();
    });

    it("readRuntime resolves with unknown status", async () => {
      const service = resolveGatewayService();
      const runtime = await service.readRuntime(process.env);
      expect(runtime.status).toBe("unknown");
    });

    it("install rejects with an informative error", async () => {
      const service = resolveGatewayService();
      await expect(
        service.install({
          env: process.env,
          stdout: process.stdout,
          programArguments: [],
          workingDirectory: "/tmp",
          environment: {},
        }),
      ).rejects.toThrow(/not supported on openbsd/i);
    });

    it("restart rejects with an informative error", async () => {
      const service = resolveGatewayService();
      await expect(service.restart({ env: process.env, stdout: process.stdout })).rejects.toThrow(
        /not supported on openbsd/i,
      );
    });
  });
});
