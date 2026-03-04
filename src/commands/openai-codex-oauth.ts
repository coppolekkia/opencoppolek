import type { OAuthCredentials } from "@mariozechner/pi-ai";
import { loginOpenAICodex } from "@mariozechner/pi-ai";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { createVpsAwareOAuthHandlers } from "./oauth-flow.js";
import {
  formatOpenAIOAuthTlsPreflightFix,
  runOpenAIOAuthTlsPreflight,
} from "./oauth-tls-preflight.js";

const OPENAI_CODEX_REQUIRED_OAUTH_SCOPES = ["model.request", "api.responses.write"] as const;

function ensureOpenAICodexOAuthScopes(urlText: string): string {
  let url: URL;
  try {
    url = new URL(urlText);
  } catch {
    return urlText;
  }

  const rawScope = url.searchParams.get("scope");
  if (!rawScope) {
    return urlText;
  }

  const scopes = rawScope
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
  let changed = false;
  for (const requiredScope of OPENAI_CODEX_REQUIRED_OAUTH_SCOPES) {
    if (!scopes.includes(requiredScope)) {
      scopes.push(requiredScope);
      changed = true;
    }
  }

  if (!changed) {
    return urlText;
  }
  url.searchParams.set("scope", scopes.join(" "));
  return url.toString();
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
    const handlers = createVpsAwareOAuthHandlers({
      isRemote,
      prompter,
      runtime,
      spin,
      openUrl,
      localBrowserMessage: localBrowserMessage ?? "Complete sign-in in browser…",
    });

    const creds = await loginOpenAICodex({
      onAuth: async (event) => {
        await handlers.onAuth({ ...event, url: ensureOpenAICodexOAuthScopes(event.url) });
      },
      onPrompt: handlers.onPrompt,
      onProgress: (msg) => spin.update(msg),
    });
    spin.stop("OpenAI OAuth complete");
    return creds ?? null;
  } catch (err) {
    spin.stop("OpenAI OAuth failed");
    runtime.error(String(err));
    await prompter.note("Trouble with OAuth? See https://docs.openclaw.ai/start/faq", "OAuth help");
    throw err;
  }
}
