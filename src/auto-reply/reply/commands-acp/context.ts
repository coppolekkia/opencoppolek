import { DISCORD_THREAD_BINDING_CHANNEL } from "../../../channels/thread-bindings-policy.js";
import {
  resolveConversationIdFromTargets,
  resolveParentConversationIdFromTargets,
} from "../../../infra/outbound/conversation-id.js";
import type { HandleCommandsParams } from "../commands-types.js";

function normalizeString(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return `${value}`.trim();
  }
  return "";
}

export function resolveAcpCommandChannel(params: HandleCommandsParams): string {
  const raw =
    params.ctx.OriginatingChannel ??
    params.command.channel ??
    params.ctx.Surface ??
    params.ctx.Provider;
  return normalizeString(raw).toLowerCase();
}

export function resolveAcpCommandAccountId(params: HandleCommandsParams): string {
  const accountId = normalizeString(params.ctx.AccountId);
  return accountId || "default";
}

export function resolveAcpCommandThreadId(params: HandleCommandsParams): string | undefined {
  const threadId =
    params.ctx.MessageThreadId != null ? normalizeString(String(params.ctx.MessageThreadId)) : "";
  return threadId || undefined;
}

export function resolveAcpCommandConversationId(params: HandleCommandsParams): string | undefined {
  return resolveConversationIdFromTargets({
    threadId: params.ctx.MessageThreadId,
    targets: [params.ctx.OriginatingTo, params.command.to, params.ctx.To],
  });
}

export function resolveAcpCommandParentConversationId(
  params: HandleCommandsParams,
): string | undefined {
  const fromTargets = resolveParentConversationIdFromTargets({
    targets: [params.ctx.OriginatingTo, params.command.to, params.ctx.To],
  });
  if (fromTargets) {
    return fromTargets;
  }
  // Fallback: use the raw platform conversation ID (e.g., Slack DM channel D...).
  // This covers cases where OriginatingTo is user:<id> (DMs) and doesn't carry
  // the platform channel ID needed for thread binding lookups.
  const raw = params.ctx.OriginatingConversationId;
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

export function isAcpCommandDiscordChannel(params: HandleCommandsParams): boolean {
  return resolveAcpCommandChannel(params) === DISCORD_THREAD_BINDING_CHANNEL;
}

export function resolveAcpCommandBindingContext(params: HandleCommandsParams): {
  channel: string;
  accountId: string;
  threadId?: string;
  conversationId?: string;
  parentConversationId?: string;
} {
  return {
    channel: resolveAcpCommandChannel(params),
    accountId: resolveAcpCommandAccountId(params),
    threadId: resolveAcpCommandThreadId(params),
    conversationId: resolveAcpCommandConversationId(params),
    parentConversationId: resolveAcpCommandParentConversationId(params),
  };
}
