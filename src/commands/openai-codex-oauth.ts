import type { OAuthCredentials } from "@mariozechner/pi-ai";
import { loginOpenAICodex } from "@mariozechner/pi-ai";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { createVpsAwareOAuthHandlers } from "./oauth-flow.js";
import {
  formatOpenAIOAuthTlsPreflightFix,
  runOpenAIOAuthTlsPreflight,
} from "./oauth-tls-preflight.js";

const OPENAI_PROFILE_CLAIM = "https://api.openai.com/profile";

/**
 * Extract the user's email from an OpenAI Codex JWT access token.
 *
 * Checks the OpenAI-specific profile claim first, then falls back to
 * the standard OIDC `email` claim. Returns undefined when no email
 * can be extracted (malformed token, missing claims, etc.).
 */
export function extractEmailFromCodexToken(accessToken: string): string | undefined {
  try {
    const parts = accessToken.split(".");
    if (parts.length !== 3) {
      return undefined;
    }
    const raw = parts[1] ?? "";
    // Node.js Buffer handles base64url natively (no manual padding needed).
    const payload = JSON.parse(Buffer.from(raw, "base64url").toString()) as Record<string, unknown>;

    // OpenAI-specific namespaced claim (preferred)
    const profile = payload[OPENAI_PROFILE_CLAIM];
    if (profile && typeof profile === "object") {
      const profileEmail = (profile as Record<string, unknown>).email;
      if (typeof profileEmail === "string" && profileEmail.trim()) {
        return profileEmail.trim().toLowerCase();
      }
    }

    // Standard OIDC email claim (fallback)
    const oidcEmail = payload.email;
    if (typeof oidcEmail === "string" && oidcEmail.trim()) {
      return oidcEmail.trim().toLowerCase();
    }

    return undefined;
  } catch {
    return undefined;
  }
}

export async function loginOpenAICodexOAuth(params: {
  prompter: WizardPrompter;
  runtime: RuntimeEnv;
  isRemote: boolean;
  openUrl: (url: string) => Promise<void>;
  localBrowserMessage?: string;
}): Promise<OAuthCredentials | null> {
  const { prompter, runtime, isRemote, openUrl, localBrowserMessage } = params;
  const preflight = await runOpenAIOAuthTlsPreflight();
  if (!preflight.ok && preflight.kind === "tls-cert") {
    const hint = formatOpenAIOAuthTlsPreflightFix(preflight);
    runtime.error(hint);
    await prompter.note(hint, "OAuth prerequisites");
    throw new Error(preflight.message);
  }

  await prompter.note(
    isRemote
      ? [
          "You are running in a remote/VPS environment.",
          "A URL will be shown for you to open in your LOCAL browser.",
          "After signing in, paste the redirect URL back here.",
        ].join("\n")
      : [
          "Browser will open for OpenAI authentication.",
          "If the callback doesn't auto-complete, paste the redirect URL.",
          "OpenAI OAuth uses localhost:1455 for the callback.",
        ].join("\n"),
    "OpenAI Codex OAuth",
  );

  const spin = prompter.progress("Starting OAuth flow…");
  try {
    const { onAuth, onPrompt } = createVpsAwareOAuthHandlers({
      isRemote,
      prompter,
      runtime,
      spin,
      openUrl,
      localBrowserMessage: localBrowserMessage ?? "Complete sign-in in browser…",
    });

    const creds = await loginOpenAICodex({
      onAuth,
      onPrompt,
      onProgress: (msg) => spin.update(msg),
    });
    spin.stop("OpenAI OAuth complete");

    // Enrich credentials with email from JWT when pi-ai doesn't populate it.
    // This ensures each user gets a distinct profile ID (e.g. openai-codex:user@org.com)
    // instead of all users on the same Team sharing openai-codex:default.
    if (creds && !creds.email) {
      const email = extractEmailFromCodexToken(creds.access);
      if (email) {
        creds.email = email;
      }
    }

    return creds ?? null;
  } catch (err) {
    spin.stop("OpenAI OAuth failed");
    runtime.error(String(err));
    await prompter.note("Trouble with OAuth? See https://docs.openclaw.ai/start/faq", "OAuth help");
    throw err;
  }
}
