import type { OpenClawConfig } from "../../config/config.js";
import { getSessionBindingService } from "../../infra/outbound/session-binding-service.js";
import {
  isAcpSessionKey,
  parseAgentSessionKey,
  isSubagentSessionKey,
  resolveAgentIdFromSessionKey,
} from "../../routing/session-key.js";
import {
  listSpawnedSessionKeys,
  resolveInternalSessionKey,
  resolveMainSessionAlias,
} from "./sessions-resolution.js";

export type SessionToolsVisibility = "self" | "tree" | "agent" | "all";

export type AgentToAgentPolicy = {
  enabled: boolean;
  matchesAllow: (agentId: string) => boolean;
  isAllowed: (requesterAgentId: string, targetAgentId: string) => boolean;
};

export type SessionAccessAction = "history" | "send" | "list";

export type SessionAccessResult =
  | { allowed: true }
  | { allowed: false; error: string; status: "forbidden" };

export function resolveSessionToolsVisibility(cfg: OpenClawConfig): SessionToolsVisibility {
  const raw = (cfg.tools as { sessions?: { visibility?: unknown } } | undefined)?.sessions
    ?.visibility;
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (value === "self" || value === "tree" || value === "agent" || value === "all") {
    return value;
  }
  return "tree";
}

export function resolveEffectiveSessionToolsVisibility(params: {
  cfg: OpenClawConfig;
  sandboxed: boolean;
}): SessionToolsVisibility {
  const visibility = resolveSessionToolsVisibility(params.cfg);
  if (!params.sandboxed) {
    return visibility;
  }
  const sandboxClamp = params.cfg.agents?.defaults?.sandbox?.sessionToolsVisibility ?? "spawned";
  if (sandboxClamp === "spawned" && visibility !== "tree") {
    return "tree";
  }
  return visibility;
}

export function resolveSandboxSessionToolsVisibility(cfg: OpenClawConfig): "spawned" | "all" {
  return cfg.agents?.defaults?.sandbox?.sessionToolsVisibility ?? "spawned";
}

export function resolveSandboxedSessionToolContext(params: {
  cfg: OpenClawConfig;
  agentSessionKey?: string;
  sandboxed?: boolean;
}): {
  mainKey: string;
  alias: string;
  visibility: "spawned" | "all";
  requesterInternalKey: string | undefined;
  effectiveRequesterKey: string;
  restrictToSpawned: boolean;
} {
  const { mainKey, alias } = resolveMainSessionAlias(params.cfg);
  const visibility = resolveSandboxSessionToolsVisibility(params.cfg);
  const requesterInternalKey =
    typeof params.agentSessionKey === "string" && params.agentSessionKey.trim()
      ? resolveInternalSessionKey({
          key: params.agentSessionKey,
          alias,
          mainKey,
        })
      : undefined;
  const effectiveRequesterKey = requesterInternalKey ?? alias;
  const restrictToSpawned =
    params.sandboxed === true &&
    visibility === "spawned" &&
    !!requesterInternalKey &&
    !isSubagentSessionKey(requesterInternalKey);
  return {
    mainKey,
    alias,
    visibility,
    requesterInternalKey,
    effectiveRequesterKey,
    restrictToSpawned,
  };
}

export function createAgentToAgentPolicy(cfg: OpenClawConfig): AgentToAgentPolicy {
  const routingA2A = cfg.tools?.agentToAgent;
  const enabled = routingA2A?.enabled === true;
  const allowPatterns = Array.isArray(routingA2A?.allow) ? routingA2A.allow : [];
  const matchesAllow = (agentId: string) => {
    if (allowPatterns.length === 0) {
      return true;
    }
    return allowPatterns.some((pattern) => {
      const raw = String(pattern ?? "").trim();
      if (!raw) {
        return false;
      }
      if (raw === "*") {
        return true;
      }
      if (!raw.includes("*")) {
        return raw === agentId;
      }
      const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`^${escaped.replaceAll("\\*", ".*")}$`, "i");
      return re.test(agentId);
    });
  };
  const isAllowed = (requesterAgentId: string, targetAgentId: string) => {
    if (requesterAgentId === targetAgentId) {
      return true;
    }
    if (!enabled) {
      return false;
    }
    return matchesAllow(requesterAgentId) && matchesAllow(targetAgentId);
  };
  return { enabled, matchesAllow, isAllowed };
}

function actionPrefix(action: SessionAccessAction): string {
  if (action === "history") {
    return "Session history";
  }
  if (action === "send") {
    return "Session send";
  }
  return "Session list";
}

function a2aDisabledMessage(action: SessionAccessAction): string {
  if (action === "history") {
    return "Agent-to-agent history is disabled. Set tools.agentToAgent.enabled=true to allow cross-agent access.";
  }
  if (action === "send") {
    return "Agent-to-agent messaging is disabled. Set tools.agentToAgent.enabled=true to allow cross-agent sends.";
  }
  return "Agent-to-agent listing is disabled. Set tools.agentToAgent.enabled=true to allow cross-agent visibility.";
}

function a2aDeniedMessage(action: SessionAccessAction): string {
  if (action === "history") {
    return "Agent-to-agent history denied by tools.agentToAgent.allow.";
  }
  if (action === "send") {
    return "Agent-to-agent messaging denied by tools.agentToAgent.allow.";
  }
  return "Agent-to-agent listing denied by tools.agentToAgent.allow.";
}

function crossVisibilityMessage(action: SessionAccessAction): string {
  if (action === "history") {
    return "Session history visibility is restricted. Set tools.sessions.visibility=all to allow cross-agent access.";
  }
  if (action === "send") {
    return "Session send visibility is restricted. Set tools.sessions.visibility=all to allow cross-agent access.";
  }
  return "Session list visibility is restricted. Set tools.sessions.visibility=all to allow cross-agent access.";
}

function selfVisibilityMessage(action: SessionAccessAction): string {
  return `${actionPrefix(action)} visibility is restricted to the current session (tools.sessions.visibility=self).`;
}

function treeVisibilityMessage(action: SessionAccessAction): string {
  return `${actionPrefix(action)} visibility is restricted to the current session tree (tools.sessions.visibility=tree).`;
}

function normalizeSessionIdentityKey(value: string): string {
  return value.trim().toLowerCase();
}

function resolveSessionIdentityAliases(value: string): Set<string> {
  const normalized = normalizeSessionIdentityKey(value);
  const aliases = new Set<string>();
  if (!normalized) {
    return aliases;
  }
  aliases.add(normalized);

  if (normalized === "main") {
    aliases.add("agent:main:main");
    return aliases;
  }

  const parsed = parseAgentSessionKey(normalized);
  if (!parsed || parsed.agentId !== "main") {
    return aliases;
  }

  // Webchat may surface either full main session keys or their aliases.
  if (parsed.rest === "main") {
    aliases.add("main");
  }
  if (!parsed.rest.includes(":")) {
    aliases.add(parsed.rest);
  }
  return aliases;
}

function areEquivalentSessionIdentities(left: string, right: string): boolean {
  const leftAliases = resolveSessionIdentityAliases(left);
  const rightAliases = resolveSessionIdentityAliases(right);
  for (const alias of leftAliases) {
    if (rightAliases.has(alias)) {
      return true;
    }
  }
  return false;
}

function hasRequesterBoundAcpSession(params: {
  requesterSessionKey: string;
  targetSessionKey: string;
}): boolean {
  if (!isAcpSessionKey(params.targetSessionKey)) {
    return false;
  }
  const requesterKey = normalizeSessionIdentityKey(params.requesterSessionKey);
  if (!requesterKey) {
    return false;
  }
  const bindings = getSessionBindingService().listBySession(params.targetSessionKey);
  return bindings.some((record) => {
    if (record.status !== "active" || record.targetKind !== "session") {
      return false;
    }
    const metadataRequesterSessionKey =
      typeof record.metadata?.requesterSessionKey === "string"
        ? normalizeSessionIdentityKey(record.metadata.requesterSessionKey)
        : "";
    if (
      metadataRequesterSessionKey &&
      areEquivalentSessionIdentities(metadataRequesterSessionKey, requesterKey)
    ) {
      return true;
    }
    const channel = record.conversation.channel.trim().toLowerCase();
    const conversationId = normalizeSessionIdentityKey(record.conversation.conversationId);
    return channel === "webchat" && areEquivalentSessionIdentities(conversationId, requesterKey);
  });
}

export async function createSessionVisibilityGuard(params: {
  action: SessionAccessAction;
  requesterSessionKey: string;
  visibility: SessionToolsVisibility;
  a2aPolicy: AgentToAgentPolicy;
}): Promise<{
  check: (targetSessionKey: string) => SessionAccessResult;
}> {
  const requesterAgentId = resolveAgentIdFromSessionKey(params.requesterSessionKey);
  const spawnedKeys =
    params.visibility === "tree"
      ? await listSpawnedSessionKeys({ requesterSessionKey: params.requesterSessionKey })
      : null;

  const check = (targetSessionKey: string): SessionAccessResult => {
    const targetAgentId = resolveAgentIdFromSessionKey(targetSessionKey);
    const isCrossAgent = targetAgentId !== requesterAgentId;
    if (isCrossAgent) {
      if (
        params.action === "send" &&
        hasRequesterBoundAcpSession({
          requesterSessionKey: params.requesterSessionKey,
          targetSessionKey,
        })
      ) {
        return { allowed: true };
      }
      if (params.visibility !== "all") {
        return {
          allowed: false,
          status: "forbidden",
          error: crossVisibilityMessage(params.action),
        };
      }
      if (!params.a2aPolicy.enabled) {
        return {
          allowed: false,
          status: "forbidden",
          error: a2aDisabledMessage(params.action),
        };
      }
      if (!params.a2aPolicy.isAllowed(requesterAgentId, targetAgentId)) {
        return {
          allowed: false,
          status: "forbidden",
          error: a2aDeniedMessage(params.action),
        };
      }
      return { allowed: true };
    }

    if (params.visibility === "self" && targetSessionKey !== params.requesterSessionKey) {
      return {
        allowed: false,
        status: "forbidden",
        error: selfVisibilityMessage(params.action),
      };
    }

    if (
      params.visibility === "tree" &&
      targetSessionKey !== params.requesterSessionKey &&
      !spawnedKeys?.has(targetSessionKey)
    ) {
      return {
        allowed: false,
        status: "forbidden",
        error: treeVisibilityMessage(params.action),
      };
    }

    return { allowed: true };
  };

  return { check };
}
