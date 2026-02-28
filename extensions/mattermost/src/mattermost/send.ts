import { loadOutboundMediaFromUrl, type OpenClawConfig } from "openclaw/plugin-sdk/mattermost";
import { getMattermostRuntime } from "../runtime.js";
import { resolveMattermostAccount } from "./accounts.js";
import {
  createMattermostClient,
  createMattermostDirectChannel,
  createMattermostPost,
  fetchMattermostMe,
  fetchMattermostUser,
  fetchMattermostUserByUsername,
  normalizeMattermostBaseUrl,
  uploadMattermostFile,
  type MattermostUser,
} from "./client.js";

export type MattermostSendOpts = {
  cfg?: OpenClawConfig;
  botToken?: string;
  baseUrl?: string;
  accountId?: string;
  mediaUrl?: string;
  mediaLocalRoots?: readonly string[];
  replyToId?: string;
};

export type MattermostSendResult = {
  messageId: string;
  channelId: string;
};

type MattermostTarget =
  | { kind: "channel"; id: string }
  | { kind: "user"; id?: string; username?: string };

const botUserCache = new Map<string, MattermostUser>();
const userByNameCache = new Map<string, MattermostUser>();

// Cache for ambiguous, unprefixed IDs:
// - whether an opaque id resolved as a user
// - DM channel ids per user
const userIdResolutionCache = new Map<string, boolean>();
const dmChannelCache = new Map<string, string>();

const getCore = () => getMattermostRuntime();

function cacheKey(baseUrl: string, token: string): string {
  return `${baseUrl}::${token}`;
}

function normalizeMessage(text: string, mediaUrl?: string): string {
  const trimmed = text.trim();
  const media = mediaUrl?.trim();
  return [trimmed, media].filter(Boolean).join("\n");
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isExplicitMattermostTarget(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) {
    return false;
  }
  if (/^(channel|user|mattermost):/i.test(trimmed)) {
    return true;
  }
  if (trimmed.startsWith("@")) {
    return true;
  }
  return false;
}

function looksLikeOpaqueMattermostId(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) {
    return false;
  }
  // Mattermost ids are opaque; we use a conservative heuristic.
  return /^[a-z0-9]{8,}$/i.test(trimmed);
}

function parseMattermostApiStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") {
    return undefined;
  }
  const msg = "message" in err ? String((err as any).message ?? "") : "";
  const m = /Mattermost API (\d{3})\b/.exec(msg);
  if (!m) {
    return undefined;
  }
  const code = Number(m[1]);
  return Number.isFinite(code) ? code : undefined;
}

function parseMattermostTarget(raw: string): MattermostTarget {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Recipient is required for Mattermost sends");
  }
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("channel:")) {
    const id = trimmed.slice("channel:".length).trim();
    if (!id) {
      throw new Error("Channel id is required for Mattermost sends");
    }
    return { kind: "channel", id };
  }
  if (lower.startsWith("user:")) {
    const id = trimmed.slice("user:".length).trim();
    if (!id) {
      throw new Error("User id is required for Mattermost sends");
    }
    return { kind: "user", id };
  }
  if (lower.startsWith("mattermost:")) {
    const id = trimmed.slice("mattermost:".length).trim();
    if (!id) {
      throw new Error("User id is required for Mattermost sends");
    }
    return { kind: "user", id };
  }
  if (trimmed.startsWith("@")) {
    const username = trimmed.slice(1).trim();
    if (!username) {
      throw new Error("Username is required for Mattermost sends");
    }
    return { kind: "user", username };
  }
  return { kind: "channel", id: trimmed };
}

async function resolveBotUser(baseUrl: string, token: string): Promise<MattermostUser> {
  const key = cacheKey(baseUrl, token);
  const cached = botUserCache.get(key);
  if (cached) {
    return cached;
  }
  const client = createMattermostClient({ baseUrl, botToken: token });
  const user = await fetchMattermostMe(client);
  botUserCache.set(key, user);
  return user;
}

async function resolveUserIdByUsername(params: {
  baseUrl: string;
  token: string;
  username: string;
}): Promise<string> {
  const { baseUrl, token, username } = params;
  const key = `${cacheKey(baseUrl, token)}::${username.toLowerCase()}`;
  const cached = userByNameCache.get(key);
  if (cached?.id) {
    return cached.id;
  }
  const client = createMattermostClient({ baseUrl, botToken: token });
  const user = await fetchMattermostUserByUsername(client, username);
  userByNameCache.set(key, user);
  return user.id;
}

async function resolveTargetChannelId(params: {
  target: MattermostTarget;
  baseUrl: string;
  token: string;
}): Promise<string> {
  if (params.target.kind === "channel") {
    return params.target.id;
  }
  const userId = params.target.id
    ? params.target.id
    : await resolveUserIdByUsername({
        baseUrl: params.baseUrl,
        token: params.token,
        username: params.target.username ?? "",
      });

  const dmKey = `${cacheKey(params.baseUrl, params.token)}::dm::${userId}`;
  const cached = dmChannelCache.get(dmKey);
  if (cached) {
    return cached;
  }

  const botUser = await resolveBotUser(params.baseUrl, params.token);
  const client = createMattermostClient({
    baseUrl: params.baseUrl,
    botToken: params.token,
  });
  const channel = await createMattermostDirectChannel(client, [botUser.id, userId]);
  dmChannelCache.set(dmKey, channel.id);
  return channel.id;
}

export async function sendMessageMattermost(
  to: string,
  text: string,
  opts: MattermostSendOpts = {},
): Promise<MattermostSendResult> {
  const core = getCore();
  const logger = core.logging.getChildLogger({ module: "mattermost" });
  const cfg = opts.cfg ?? core.config.loadConfig();
  const account = resolveMattermostAccount({
    cfg,
    accountId: opts.accountId,
  });
  const token = opts.botToken?.trim() || account.botToken?.trim();
  if (!token) {
    throw new Error(
      `Mattermost bot token missing for account "${account.accountId}" (set channels.mattermost.accounts.${account.accountId}.botToken or MATTERMOST_BOT_TOKEN for default).`,
    );
  }
  const baseUrl = normalizeMattermostBaseUrl(opts.baseUrl ?? account.baseUrl);
  if (!baseUrl) {
    throw new Error(
      `Mattermost baseUrl missing for account "${account.accountId}" (set channels.mattermost.accounts.${account.accountId}.baseUrl or MATTERMOST_URL for default).`,
    );
  }

  const trimmedTo = to?.trim() ?? "";

  // Option A: User-first resolution for ambiguous, unprefixed opaque IDs.
  // If `to` looks like an id and has no explicit prefix, try resolving it as a user first.
  // If it exists as a user, we send via a direct channel (DM) resolved via `/channels/direct`.
  let target: MattermostTarget;
  if (!isExplicitMattermostTarget(trimmedTo) && looksLikeOpaqueMattermostId(trimmedTo)) {
    const key = `${cacheKey(baseUrl, token)}::isUser::${trimmedTo}`;
    const cached = userIdResolutionCache.get(key);
    if (cached === true) {
      target = { kind: "user", id: trimmedTo };
    } else if (cached === false) {
      target = { kind: "channel", id: trimmedTo };
    } else {
      const client = createMattermostClient({ baseUrl, botToken: token });
      try {
        await fetchMattermostUser(client, trimmedTo);
        userIdResolutionCache.set(key, true);
        target = { kind: "user", id: trimmedTo };
      } catch (err) {
        const status = parseMattermostApiStatus(err);

        // Only cache negative resolution for confirmed not-found.
        // For transient errors (429/5xx/network), avoid poisoning the cache.
        if (status === 404) {
          userIdResolutionCache.set(key, false);
        } else {
          if (core.logging.shouldLogVerbose()) {
            logger.debug?.(
              `mattermost send: could not resolve ambiguous id as user (status=${status ?? "unknown"}); falling back to channel id`,
            );
          }
        }

        target = { kind: "channel", id: trimmedTo };
      }
    }
  } else {
    target = parseMattermostTarget(trimmedTo);
  }

  const channelId = await resolveTargetChannelId({
    target,
    baseUrl,
    token,
  });

  const client = createMattermostClient({ baseUrl, botToken: token });
  let message = text?.trim() ?? "";
  let fileIds: string[] | undefined;
  let uploadError: Error | undefined;
  const mediaUrl = opts.mediaUrl?.trim();
  if (mediaUrl) {
    try {
      const media = await loadOutboundMediaFromUrl(mediaUrl, {
        mediaLocalRoots: opts.mediaLocalRoots,
      });
      const fileInfo = await uploadMattermostFile(client, {
        channelId,
        buffer: media.buffer,
        fileName: media.fileName ?? "upload",
        contentType: media.contentType ?? undefined,
      });
      fileIds = [fileInfo.id];
    } catch (err) {
      uploadError = err instanceof Error ? err : new Error(String(err));
      if (core.logging.shouldLogVerbose()) {
        logger.debug?.(
          `mattermost send: media upload failed, falling back to URL text: ${String(err)}`,
        );
      }
      message = normalizeMessage(message, isHttpUrl(mediaUrl) ? mediaUrl : "");
    }
  }

  if (message) {
    const tableMode = core.channel.text.resolveMarkdownTableMode({
      cfg,
      channel: "mattermost",
      accountId: account.accountId,
    });
    message = core.channel.text.convertMarkdownTables(message, tableMode);
  }

  if (!message && (!fileIds || fileIds.length === 0)) {
    if (uploadError) {
      throw new Error(`Mattermost media upload failed: ${uploadError.message}`);
    }
    throw new Error("Mattermost message is empty");
  }

  const post = await createMattermostPost(client, {
    channelId,
    message,
    rootId: opts.replyToId,
    fileIds,
  });

  core.channel.activity.record({
    channel: "mattermost",
    accountId: account.accountId,
    direction: "outbound",
  });

  return {
    messageId: post.id ?? "unknown",
    channelId,
  };
}
