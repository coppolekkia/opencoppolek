import type { OpenClawConfig } from "../config/config.js";
import { hasConfiguredSecretInput } from "../config/types.secrets.js";

export function shouldRequireGatewayTokenForInstall(
  cfg: OpenClawConfig,
  env: NodeJS.ProcessEnv,
): boolean {
  const mode = cfg.gateway?.auth?.mode;
  if (mode === "token") {
    return true;
  }
  if (mode === "password" || mode === "none" || mode === "trusted-proxy") {
    return false;
  }
  const hasPasswordEnvCandidate = Boolean(
    env.OPENCLAW_GATEWAY_PASSWORD?.trim() || env.CLAWDBOT_GATEWAY_PASSWORD?.trim(),
  );
  if (hasPasswordEnvCandidate) {
    return false;
  }
  return !hasConfiguredSecretInput(cfg.gateway?.auth?.password, cfg.secrets?.defaults);
}
