import type { OpenClawConfig } from "../config/config.js";
import type { SessionEntry } from "../config/sessions.js";
import {
  ensureAuthProfileStore,
  resolveAuthProfileDisplayLabel,
  resolveAuthProfileOrder,
} from "./auth-profiles.js";
import { getCustomProviderApiKey, resolveEnvApiKey } from "./model-auth.js";
import { normalizeProviderId } from "./model-selection.js";

function formatCredentialSource(params: {
  value: string | undefined;
  ref: { source: string; id: string } | undefined;
}): string | undefined {
  if (params.ref) {
    return `ref(${params.ref.source}:${params.ref.id})`;
  }
  return undefined;
}

export function resolveModelAuthLabel(params: {
  provider?: string;
  cfg?: OpenClawConfig;
  sessionEntry?: SessionEntry;
  agentDir?: string;
}): string | undefined {
  const resolvedProvider = params.provider?.trim();
  if (!resolvedProvider) {
    return undefined;
  }

  const providerKey = normalizeProviderId(resolvedProvider);
  const store = ensureAuthProfileStore(params.agentDir, {
    allowKeychainPrompt: false,
  });
  const profileOverride = params.sessionEntry?.authProfileOverride?.trim();
  const order = resolveAuthProfileOrder({
    cfg: params.cfg,
    store,
    provider: providerKey,
    preferredProfile: profileOverride,
  });
  const candidates = [profileOverride, ...order].filter(Boolean) as string[];

  for (const profileId of candidates) {
    const profile = store.profiles[profileId];
    if (!profile || normalizeProviderId(profile.provider) !== providerKey) {
      continue;
    }
    const label = resolveAuthProfileDisplayLabel({
      cfg: params.cfg,
      store,
      profileId,
    });
    if (profile.type === "oauth") {
      return `oauth${label ? ` (${label})` : ""}`;
    }
    if (profile.type === "token") {
      const refHint = formatCredentialSource({ value: profile.token, ref: profile.tokenRef });
      const suffix = [refHint, label].filter(Boolean).join(", ");
      return `token${suffix ? ` (${suffix})` : ""}`;
    }
    const refHint = formatCredentialSource({ value: profile.key, ref: profile.keyRef });
    const suffix = [refHint, label].filter(Boolean).join(", ");
    return `api-key${suffix ? ` (${suffix})` : ""}`;
  }

  const envKey = resolveEnvApiKey(providerKey);
  if (envKey?.apiKey) {
    if (envKey.source.includes("OAUTH_TOKEN")) {
      return `oauth (${envKey.source})`;
    }
    return `api-key (env: ${envKey.source})`;
  }

  const customKey = getCustomProviderApiKey(params.cfg, providerKey);
  if (customKey) {
    return `api-key (models.json)`;
  }

  return "unknown";
}
