import type { OpenClawConfig } from "../config/config.js";
import { loadConfig } from "../config/config.js";
import { loadSessionStore, resolveStorePath } from "../config/sessions.js";
import type { ExecApprovalForwardTarget } from "../config/types.approvals.js";
import { shouldForwardExecApproval } from "../infra/exec-approval-forwarder.js";
import type {
  ExecApprovalDecision,
  ExecApprovalRequest,
  ExecApprovalResolved,
} from "../infra/exec-approvals.js";
import { resolveSessionDeliveryTarget } from "../infra/outbound/targets.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { parseAgentSessionKey } from "../routing/session-key.js";
import { isDeliverableMessageChannel, normalizeMessageChannel } from "../utils/message-channel.js";
import type { TelegramInlineButtons } from "./button-types.js";
import { sendMessageTelegram } from "./send.js";

const log = createSubsystemLogger("telegram/exec-approvals");

type TelegramTarget = {
  chatId: string;
  accountId?: string;
  messageThreadId?: number;
};

type PendingApproval = {
  request: ExecApprovalRequest;
  targets: TelegramTarget[];
  timeoutId: NodeJS.Timeout | null;
};

export type TelegramExecApprovalHandler = {
  handleRequested: (request: ExecApprovalRequest) => Promise<void>;
  handleResolved: (resolved: ExecApprovalResolved) => Promise<void>;
  stop: () => void;
};

export type TelegramExecApprovalHandlerDeps = {
  getConfig?: () => OpenClawConfig;
  send?: typeof sendMessageTelegram;
  nowMs?: () => number;
};

function toTelegramTarget(target: ExecApprovalForwardTarget): TelegramTarget | null {
  const channel = normalizeMessageChannel(target.channel) ?? target.channel;
  if (channel !== "telegram") {
    return null;
  }
  return {
    chatId: target.to,
    accountId: target.accountId ?? undefined,
    messageThreadId: target.threadId != null ? Number(target.threadId) : undefined,
  };
}

function resolveSessionTelegramTarget(params: {
  cfg: OpenClawConfig;
  request: ExecApprovalRequest;
}): TelegramTarget | null {
  const sessionKey = params.request.request.sessionKey?.trim();
  if (!sessionKey) {
    return null;
  }
  const parsed = parseAgentSessionKey(sessionKey);
  const agentId = parsed?.agentId ?? params.request.request.agentId ?? "main";
  const storePath = resolveStorePath(params.cfg.session?.store, { agentId });
  const store = loadSessionStore(storePath);
  const entry = store[sessionKey];
  if (!entry) {
    return null;
  }
  const target = resolveSessionDeliveryTarget({ entry, requestedChannel: "last" });
  if (!target.channel || !target.to) {
    return null;
  }
  if (!isDeliverableMessageChannel(target.channel)) {
    return null;
  }
  return toTelegramTarget({
    channel: target.channel,
    to: target.to,
    accountId: target.accountId,
    threadId: target.threadId,
  });
}

function buildTargetKey(t: TelegramTarget): string {
  return [t.chatId, t.accountId ?? "", t.messageThreadId ?? ""].join(":");
}

function buildApprovalButtons(id: string): TelegramInlineButtons {
  return [
    [
      { text: "\u2705 Once", callback_data: `/approve ${id} allow-once` },
      { text: "\u2705 Always", callback_data: `/approve ${id} allow-always` },
      { text: "\u274c Deny", callback_data: `/approve ${id} deny` },
    ],
  ];
}

function formatCommand(command: string): string {
  if (!command.includes("\n") && !command.includes("`")) {
    return `\`${command}\``;
  }
  let fence = "```";
  while (command.includes(fence)) {
    fence += "`";
  }
  return `${fence}\n${command}\n${fence}`;
}

function buildRequestMessage(request: ExecApprovalRequest, nowMs: number): string {
  const lines: string[] = ["\ud83d\udd12 Exec approval required"];
  lines.push(`Command: ${formatCommand(request.request.command)}`);
  if (request.request.cwd) {
    lines.push(`CWD: ${request.request.cwd}`);
  }
  if (request.request.agentId) {
    lines.push(`Agent: ${request.request.agentId}`);
  }
  const expiresIn = Math.max(0, Math.round((request.expiresAtMs - nowMs) / 1000));
  lines.push(`Expires in: ${expiresIn}s`);
  lines.push(`ID: ${request.id}`);
  return lines.join("\n");
}

function decisionLabel(decision: ExecApprovalDecision): string {
  if (decision === "allow-once") {
    return "allowed once";
  }
  if (decision === "allow-always") {
    return "allowed always";
  }
  return "denied";
}

function buildResolvedMessage(resolved: ExecApprovalResolved): string {
  const base = `\u2705 Exec approval ${decisionLabel(resolved.decision)}.`;
  const by = resolved.resolvedBy ? ` by ${resolved.resolvedBy}` : "";
  return `${base}${by}\nID: ${resolved.id}`;
}

function buildExpiredMessage(request: ExecApprovalRequest): string {
  return `\u23f1\ufe0f Exec approval expired.\nID: ${request.id}`;
}

export function createTelegramExecApprovalHandler(
  deps: TelegramExecApprovalHandlerDeps = {},
): TelegramExecApprovalHandler {
  const getConfig = deps.getConfig ?? loadConfig;
  const send = deps.send ?? sendMessageTelegram;
  const nowMs = deps.nowMs ?? Date.now;
  const pending = new Map<string, PendingApproval>();

  const sendToTarget = async (
    target: TelegramTarget,
    text: string,
    buttons?: TelegramInlineButtons,
  ) => {
    try {
      await send(target.chatId, text, {
        verbose: false,
        textMode: "markdown",
        buttons,
        accountId: target.accountId,
        messageThreadId: target.messageThreadId,
      });
    } catch (err) {
      log.error(`send failed: ${String(err)}`);
    }
  };

  const sendToTargets = async (
    targets: TelegramTarget[],
    text: string,
    buttons?: TelegramInlineButtons,
  ) => {
    await Promise.allSettled(targets.map((t) => sendToTarget(t, text, buttons)));
  };

  const handleRequested = async (request: ExecApprovalRequest) => {
    const cfg = getConfig();
    const config = cfg.approvals?.exec;
    if (!shouldForwardExecApproval({ config, request })) {
      return;
    }

    const mode = config?.mode ?? "session";
    const targets: TelegramTarget[] = [];
    const seen = new Set<string>();

    if (mode === "session" || mode === "both") {
      const sessionTarget = resolveSessionTelegramTarget({ cfg, request });
      if (sessionTarget) {
        const key = buildTargetKey(sessionTarget);
        if (!seen.has(key)) {
          seen.add(key);
          targets.push(sessionTarget);
        }
      }
    }

    if (mode === "targets" || mode === "both") {
      for (const t of config?.targets ?? []) {
        const telegramTarget = toTelegramTarget(t);
        if (!telegramTarget) {
          continue;
        }
        const key = buildTargetKey(telegramTarget);
        if (!seen.has(key)) {
          seen.add(key);
          targets.push(telegramTarget);
        }
      }
    }

    if (targets.length === 0) {
      return;
    }

    const expiresInMs = Math.max(0, request.expiresAtMs - nowMs());
    const timeoutId = setTimeout(() => {
      void (async () => {
        const entry = pending.get(request.id);
        if (!entry) {
          return;
        }
        pending.delete(request.id);
        await sendToTargets(entry.targets, buildExpiredMessage(request));
      })();
    }, expiresInMs);
    timeoutId.unref?.();

    const entry: PendingApproval = { request, targets, timeoutId };
    pending.set(request.id, entry);

    const text = buildRequestMessage(request, nowMs());
    const buttons = buildApprovalButtons(request.id);
    await sendToTargets(targets, text, buttons);
  };

  const handleResolved = async (resolved: ExecApprovalResolved) => {
    const entry = pending.get(resolved.id);
    if (!entry) {
      return;
    }
    if (entry.timeoutId) {
      clearTimeout(entry.timeoutId);
    }
    pending.delete(resolved.id);
    await sendToTargets(entry.targets, buildResolvedMessage(resolved));
  };

  const stop = () => {
    for (const entry of pending.values()) {
      if (entry.timeoutId) {
        clearTimeout(entry.timeoutId);
      }
    }
    pending.clear();
  };

  return { handleRequested, handleResolved, stop };
}
