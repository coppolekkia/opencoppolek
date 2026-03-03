import { normalizeAccountId } from "../../routing/session-key.js";
import {
  registerSessionBindingAdapter,
  unregisterSessionBindingAdapter,
  type SessionBindingAdapter,
  type SessionBindingRecord,
  type SessionBindingUnbindInput,
} from "./session-binding-service.js";

type WebchatAdapterState = {
  byConversation: Map<string, SessionBindingRecord>;
};

const REGISTERED_WEBCHAT_ACCOUNTS = new Set<string>();
const WEBCHAT_STATE_BY_ACCOUNT = new Map<string, WebchatAdapterState>();

function normalizeConversationId(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function toBindingId(accountId: string, conversationId: string): string {
  return `webchat:${accountId}:${conversationId}`;
}

function resolveWebchatState(accountId: string): WebchatAdapterState {
  const existing = WEBCHAT_STATE_BY_ACCOUNT.get(accountId);
  if (existing) {
    return existing;
  }
  const created: WebchatAdapterState = {
    byConversation: new Map<string, SessionBindingRecord>(),
  };
  WEBCHAT_STATE_BY_ACCOUNT.set(accountId, created);
  return created;
}

function cloneWithEndedStatus(record: SessionBindingRecord): SessionBindingRecord {
  return {
    ...record,
    status: "ended",
  };
}

function unbindFromState(params: {
  state: WebchatAdapterState;
  input: SessionBindingUnbindInput;
}): SessionBindingRecord[] {
  const removed: SessionBindingRecord[] = [];
  const bindingId = params.input.bindingId?.trim();
  const targetSessionKey = params.input.targetSessionKey?.trim();

  for (const [conversationId, record] of params.state.byConversation.entries()) {
    if (bindingId && record.bindingId !== bindingId) {
      continue;
    }
    if (targetSessionKey && record.targetSessionKey !== targetSessionKey) {
      continue;
    }
    if (!bindingId && !targetSessionKey) {
      continue;
    }
    params.state.byConversation.delete(conversationId);
    removed.push(cloneWithEndedStatus(record));
  }

  return removed;
}

function createWebchatAdapter(accountId: string): SessionBindingAdapter {
  const state = resolveWebchatState(accountId);
  return {
    channel: "webchat",
    accountId,
    capabilities: {
      placements: ["current", "child"],
      bindSupported: true,
      unbindSupported: true,
    },
    bind: async (input) => {
      if (input.conversation.channel !== "webchat") {
        return null;
      }
      const conversationId = normalizeConversationId(input.conversation.conversationId);
      if (!conversationId) {
        return null;
      }

      const existing = state.byConversation.get(conversationId);
      const now = Date.now();
      const bindingId = existing?.bindingId ?? toBindingId(accountId, conversationId);
      const expiresAt =
        typeof input.ttlMs === "number" && Number.isFinite(input.ttlMs) && input.ttlMs > 0
          ? now + Math.floor(input.ttlMs)
          : undefined;
      const next: SessionBindingRecord = {
        bindingId,
        targetSessionKey: input.targetSessionKey,
        targetKind: input.targetKind,
        conversation: {
          channel: "webchat",
          accountId,
          conversationId,
        },
        status: "active",
        boundAt: now,
        ...(expiresAt ? { expiresAt } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      state.byConversation.set(conversationId, next);
      return next;
    },
    listBySession: (targetSessionKey) => {
      const key = targetSessionKey.trim();
      if (!key) {
        return [];
      }
      return [...state.byConversation.values()].filter((record) => record.targetSessionKey === key);
    },
    resolveByConversation: (ref) => {
      if (ref.channel !== "webchat") {
        return null;
      }
      const conversationId = normalizeConversationId(ref.conversationId);
      if (!conversationId) {
        return null;
      }
      return state.byConversation.get(conversationId) ?? null;
    },
    touch: () => {
      // Webchat bindings are in-memory and renewed on each bind event.
    },
    unbind: async (input) => unbindFromState({ state, input }),
  };
}

export function ensureWebchatSessionBindingAdapterRegistered(accountIdRaw?: string): string {
  const accountId = normalizeAccountId(accountIdRaw);
  if (REGISTERED_WEBCHAT_ACCOUNTS.has(accountId)) {
    return accountId;
  }
  registerSessionBindingAdapter(createWebchatAdapter(accountId));
  REGISTERED_WEBCHAT_ACCOUNTS.add(accountId);
  return accountId;
}

export const __testing = {
  resetWebchatSessionBindingAdaptersForTests() {
    for (const accountId of REGISTERED_WEBCHAT_ACCOUNTS) {
      unregisterSessionBindingAdapter({
        channel: "webchat",
        accountId,
      });
    }
    REGISTERED_WEBCHAT_ACCOUNTS.clear();
    WEBCHAT_STATE_BY_ACCOUNT.clear();
  },
};
