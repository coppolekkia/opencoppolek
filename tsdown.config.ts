import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "tsdown";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const pkgVersion = (() => {
  try {
    const raw = fs.readFileSync(path.join(rootDir, "package.json"), "utf8");
    return (JSON.parse(raw) as { version?: string }).version ?? "";
  } catch {
    return "";
  }
})();

const env = {
  NODE_ENV: "production",
};

// Bake the version string into the bundle so openclaw --version works reliably
// in Homebrew and other installs where package.json may not resolve at runtime.
const define = pkgVersion ? { __OPENCLAW_VERSION__: JSON.stringify(pkgVersion) } : {};

const pluginSdkEntrypoints = [
  "index",
  "core",
  "compat",
  "telegram",
  "discord",
  "slack",
  "signal",
  "imessage",
  "whatsapp",
  "line",
  "msteams",
  "acpx",
  "bluebubbles",
  "copilot-proxy",
  "device-pair",
  "diagnostics-otel",
  "diffs",
  "feishu",
  "google-gemini-cli-auth",
  "googlechat",
  "irc",
  "llm-task",
  "lobster",
  "matrix",
  "mattermost",
  "memory-core",
  "memory-lancedb",
  "minimax-portal-auth",
  "nextcloud-talk",
  "nostr",
  "open-prose",
  "phone-control",
  "qwen-portal-auth",
  "synology-chat",
  "talk-voice",
  "test-utils",
  "thread-ownership",
  "tlon",
  "twitch",
  "voice-call",
  "zalo",
  "zalouser",
  "account-id",
  "keyed-async-queue",
] as const;

export default defineConfig([
  {
    entry: "src/index.ts",
    env,
    define,
    fixedExtension: false,
    platform: "node",
  },
  {
    entry: "src/entry.ts",
    env,
    define,
    fixedExtension: false,
    platform: "node",
  },
  {
    // Ensure this module is bundled as an entry so legacy CLI shims can resolve its exports.
    entry: "src/cli/daemon-cli.ts",
    env,
    define,
    fixedExtension: false,
    platform: "node",
  },
  {
    entry: "src/infra/warning-filter.ts",
    env,
    fixedExtension: false,
    platform: "node",
  },
  {
    // Keep sync lazy-runtime channel modules as concrete dist files.
    entry: {
      "channels/plugins/agent-tools/whatsapp-login":
        "src/channels/plugins/agent-tools/whatsapp-login.ts",
      "channels/plugins/actions/discord": "src/channels/plugins/actions/discord.ts",
      "channels/plugins/actions/signal": "src/channels/plugins/actions/signal.ts",
      "channels/plugins/actions/telegram": "src/channels/plugins/actions/telegram.ts",
      "telegram/audit": "src/telegram/audit.ts",
      "telegram/token": "src/telegram/token.ts",
      "line/accounts": "src/line/accounts.ts",
      "line/send": "src/line/send.ts",
      "line/template-messages": "src/line/template-messages.ts",
    },
    env,
    define,
    fixedExtension: false,
    platform: "node",
  },
  ...pluginSdkEntrypoints.map((entry) => ({
    entry: `src/plugin-sdk/${entry}.ts`,
    outDir: "dist/plugin-sdk",
    env,
    fixedExtension: false,
    platform: "node" as const,
  })),
  {
    entry: "src/extensionAPI.ts",
    env,
    define,
    fixedExtension: false,
    platform: "node",
  },
  {
    entry: ["src/hooks/bundled/*/handler.ts", "src/hooks/llm-slug-generator.ts"],
    env,
    fixedExtension: false,
    platform: "node",
  },
]);
