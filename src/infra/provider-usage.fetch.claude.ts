import { loadConfig } from "../config/config.js";
import { collectConfigRuntimeEnvVars } from "../config/env-vars.js";
import { buildUsageHttpErrorSnapshot, fetchJson } from "./provider-usage.fetch.shared.js";
import { clampPercent, PROVIDER_LABELS } from "./provider-usage.shared.js";
import type { ProviderUsageSnapshot, UsageWindow } from "./provider-usage.types.js";

type ClaudeUsageResponse = {
  five_hour?: { utilization?: number; resets_at?: string };
  seven_day?: { utilization?: number; resets_at?: string };
  seven_day_sonnet?: { utilization?: number };
  seven_day_opus?: { utilization?: number };
};

type ClaudeWebOrganizationsResponse = Array<{
  uuid?: string;
  name?: string;
}>;

type ClaudeWebUsageResponse = ClaudeUsageResponse;

function resolveClaudeRuntimeEnvVar(name: string): string | undefined {
  const direct = process.env[name]?.trim();
  if (direct) {
    return direct;
  }
  const fromConfig = collectConfigRuntimeEnvVars(loadConfig())[name]?.trim();
  if (fromConfig) {
    return fromConfig;
  }
  return undefined;
}

function getClaudeWebCookieJar(): string | undefined {
  const cookieHeader = resolveClaudeRuntimeEnvVar("CLAUDE_WEB_COOKIE");
  if (!cookieHeader) {
    return undefined;
  }
  const cookieJar = cookieHeader.replace(/^cookie:\s*/i, "").trim();
  if (!cookieJar) {
    return undefined;
  }
  if (!/^[\x20-\x7E]+$/.test(cookieJar)) {
    return undefined;
  }
  return cookieJar;
}

function readCookieValue(cookieJar: string | undefined, key: string): string | undefined {
  if (!cookieJar) {
    return undefined;
  }
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = cookieJar.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;\\s]+)`, "i"));
  return match?.[1]?.trim();
}

function mergeSessionKeyIntoCookieJar(cookieJar: string | undefined, sessionKey: string): string {
  if (!cookieJar) {
    return `sessionKey=${sessionKey}`;
  }
  if (/(?:^|;\s*)sessionKey=/.test(cookieJar)) {
    return cookieJar.replace(/((?:^|;\s*)sessionKey=)[^;\s]*/i, `$1${sessionKey}`);
  }
  return `${cookieJar}; sessionKey=${sessionKey}`;
}

function buildClaudeUsageWindows(data: ClaudeUsageResponse): UsageWindow[] {
  const windows: UsageWindow[] = [];

  if (data.five_hour?.utilization !== undefined) {
    windows.push({
      label: "5h",
      usedPercent: clampPercent(data.five_hour.utilization),
      resetAt: data.five_hour.resets_at ? new Date(data.five_hour.resets_at).getTime() : undefined,
    });
  }

  if (data.seven_day?.utilization !== undefined) {
    windows.push({
      label: "Week",
      usedPercent: clampPercent(data.seven_day.utilization),
      resetAt: data.seven_day.resets_at ? new Date(data.seven_day.resets_at).getTime() : undefined,
    });
  }

  const modelWindow = data.seven_day_sonnet || data.seven_day_opus;
  if (modelWindow?.utilization !== undefined) {
    windows.push({
      label: data.seven_day_sonnet ? "Sonnet" : "Opus",
      usedPercent: clampPercent(modelWindow.utilization),
    });
  }

  return windows;
}

function resolveClaudeWebSessionKeyFromEnv(): string | undefined {
  const direct =
    resolveClaudeRuntimeEnvVar("CLAUDE_AI_SESSION_KEY") ??
    resolveClaudeRuntimeEnvVar("CLAUDE_WEB_SESSION_KEY");
  if (direct?.startsWith("sk-ant-")) {
    return direct;
  }

  const value = readCookieValue(getClaudeWebCookieJar(), "sessionKey");
  return value?.startsWith("sk-ant-") ? value : undefined;
}

function resolveClaudeWebSessionKeys(token?: string): string[] {
  const values = new Set<string>();

  const envSessionKey = resolveClaudeWebSessionKeyFromEnv();
  if (envSessionKey) {
    values.add(envSessionKey);
  }

  const tokenSessionKey = token?.trim();
  if (tokenSessionKey?.startsWith("sk-ant-")) {
    values.add(tokenSessionKey);
  }

  return [...values];
}

async function fetchClaudeWebUsage(
  sessionKey: string,
  timeoutMs: number,
  fetchFn: typeof fetch,
  orgIdOverride?: string,
): Promise<ProviderUsageSnapshot | null> {
  const cookieJar = getClaudeWebCookieJar();
  const cookie = mergeSessionKeyIntoCookieJar(cookieJar, sessionKey);
  const deviceId = readCookieValue(cookieJar, "anthropic-device-id");
  const anonymousId = readCookieValue(cookieJar, "ajs_anonymous_id");

  const headers: Record<string, string> = {
    Cookie: cookie,
    Accept: "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "Content-Type": "application/json",
    Origin: "https://claude.ai",
    Referer: "https://claude.ai/settings/usage",
    "User-Agent":
      resolveClaudeRuntimeEnvVar("CLAUDE_WEB_USER_AGENT") ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
    "Anthropic-Client-Platform": "web_claude_ai",
    "Anthropic-Client-Version": "1.0.0",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
  };
  if (deviceId) {
    headers["Anthropic-Device-Id"] = deviceId;
  }
  if (anonymousId) {
    headers["Anthropic-Anonymous-Id"] = anonymousId;
  }

  let orgId = orgIdOverride?.trim();
  if (!orgId) {
    const orgRes = await fetchJson(
      "https://claude.ai/api/organizations",
      { headers },
      timeoutMs,
      fetchFn,
    );
    if (!orgRes.ok) {
      return null;
    }

    const orgs = (await orgRes.json()) as ClaudeWebOrganizationsResponse;
    orgId = orgs?.[0]?.uuid?.trim();
  }
  if (!orgId) {
    return null;
  }

  const usageRes = await fetchJson(
    `https://claude.ai/api/organizations/${orgId}/usage`,
    { headers },
    timeoutMs,
    fetchFn,
  );
  if (!usageRes.ok) {
    return null;
  }

  const data = (await usageRes.json()) as ClaudeWebUsageResponse;
  const windows = buildClaudeUsageWindows(data);

  if (windows.length === 0) {
    return null;
  }
  return {
    provider: "anthropic",
    displayName: PROVIDER_LABELS.anthropic,
    windows,
  };
}

export async function fetchClaudeUsage(
  token: string,
  timeoutMs: number,
  fetchFn: typeof fetch,
): Promise<ProviderUsageSnapshot> {
  const res = await fetchJson(
    "https://api.anthropic.com/api/oauth/usage",
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "openclaw",
        Accept: "application/json",
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "oauth-2025-04-20",
      },
    },
    timeoutMs,
    fetchFn,
  );

  if (!res.ok) {
    let message: string | undefined;
    try {
      const data = (await res.json()) as {
        error?: { message?: unknown } | null;
      };
      const raw = data?.error?.message;
      if (typeof raw === "string" && raw.trim()) {
        message = raw.trim();
      }
    } catch {
      // ignore parse errors
    }

    // Claude Code CLI setup-token yields tokens that can be used for inference, but may not
    // include user:profile scope required by the OAuth usage endpoint. When a claude.ai
    // browser sessionKey is available, fall back to the web API.
    const missingUserProfileScope =
      typeof message === "string" &&
      message.toLowerCase().includes("user:profile") &&
      message.toLowerCase().includes("scope");
    if (
      (res.status === 403 || res.status === 401 || res.status === 400) &&
      missingUserProfileScope
    ) {
      const sessionKeys = resolveClaudeWebSessionKeys(token);
      for (const sessionKey of sessionKeys) {
        const web = await fetchClaudeWebUsage(
          sessionKey,
          timeoutMs,
          fetchFn,
          resolveClaudeRuntimeEnvVar("CLAUDE_ORGANIZATION_ID"),
        );
        if (web) {
          return web;
        }
      }
    }

    return buildUsageHttpErrorSnapshot({
      provider: "anthropic",
      status: res.status,
      message,
    });
  }

  const data = (await res.json()) as ClaudeUsageResponse;
  const windows = buildClaudeUsageWindows(data);

  return {
    provider: "anthropic",
    displayName: PROVIDER_LABELS.anthropic,
    windows,
  };
}
