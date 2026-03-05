import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { collectAttackSurfaceSummaryFindings, collectSmallModelRiskFindings } from "./audit-extra.sync.js";
import { safeEqualSecret } from "./secret-equal.js";

describe("collectAttackSurfaceSummaryFindings", () => {
  it("distinguishes external webhooks from internal hooks when only internal hooks are enabled", () => {
    const cfg: OpenClawConfig = {
      hooks: { internal: { enabled: true } },
    };

    const [finding] = collectAttackSurfaceSummaryFindings(cfg);
    expect(finding.checkId).toBe("summary.attack_surface");
    expect(finding.detail).toContain("hooks.webhooks: disabled");
    expect(finding.detail).toContain("hooks.internal: enabled");
  });

  it("reports both hook systems as enabled when both are configured", () => {
    const cfg: OpenClawConfig = {
      hooks: { enabled: true, internal: { enabled: true } },
    };

    const [finding] = collectAttackSurfaceSummaryFindings(cfg);
    expect(finding.detail).toContain("hooks.webhooks: enabled");
    expect(finding.detail).toContain("hooks.internal: enabled");
  });

  it("reports both hook systems as disabled when neither is configured", () => {
    const cfg: OpenClawConfig = {};

    const [finding] = collectAttackSurfaceSummaryFindings(cfg);
    expect(finding.detail).toContain("hooks.webhooks: disabled");
    expect(finding.detail).toContain("hooks.internal: disabled");
  });
});

describe("safeEqualSecret", () => {
  it("matches identical secrets", () => {
    expect(safeEqualSecret("secret-token", "secret-token")).toBe(true);
  });

  it("rejects mismatched secrets", () => {
    expect(safeEqualSecret("secret-token", "secret-tokEn")).toBe(false);
  });

  it("rejects different-length secrets", () => {
    expect(safeEqualSecret("short", "much-longer")).toBe(false);
  });

  it("rejects missing values", () => {
    expect(safeEqualSecret(undefined, "secret")).toBe(false);
    expect(safeEqualSecret("secret", undefined)).toBe(false);
    expect(safeEqualSecret(null, "secret")).toBe(false);
  });
});

describe("collectSmallModelRiskFindings", () => {
  it.each([
    {
      name: "gemini config key",
      cfgSearch: { gemini: { apiKey: "gemini-key" } },
      env: {},
    },
    {
      name: "grok config key",
      cfgSearch: { grok: { apiKey: "xai-key" } },
      env: {},
    },
    {
      name: "kimi config key",
      cfgSearch: { kimi: { apiKey: "kimi-key" } },
      env: {},
    },
    {
      name: "GEMINI_API_KEY env var",
      cfgSearch: {},
      env: { GEMINI_API_KEY: "gemini-key" },
    },
    {
      name: "XAI_API_KEY env var",
      cfgSearch: {},
      env: { XAI_API_KEY: "xai-key" },
    },
    {
      name: "KIMI_API_KEY env var",
      cfgSearch: {},
      env: { KIMI_API_KEY: "kimi-key" },
    },
    {
      name: "MOONSHOT_API_KEY env var",
      cfgSearch: {},
      env: { MOONSHOT_API_KEY: "moonshot-key" },
    },
  ])("treats web search as enabled when $name is set", ({ cfgSearch, env }) => {
    const cfg: OpenClawConfig = {
      agents: { defaults: { model: { primary: "ollama/mistral-8b" } } },
      tools: { web: { search: cfgSearch, fetch: { enabled: false } } },
      browser: { enabled: false },
    };

    const finding = collectSmallModelRiskFindings({
      cfg,
      env: env as NodeJS.ProcessEnv,
    }).find((entry) => entry.checkId === "models.small_params");

    expect(finding?.severity).toBe("critical");
    expect(finding?.detail).toContain("web_search");
  });
});
