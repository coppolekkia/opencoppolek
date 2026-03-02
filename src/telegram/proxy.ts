import { ProxyAgent, fetch as undiciFetch } from "undici";

export function makeProxyFetch(proxyUrl: string): typeof fetch {
  const agent = new ProxyAgent(proxyUrl);
  // undici's fetch is runtime-compatible with global fetch but the types diverge
  // on stream/body internals. Single cast at the boundary keeps the rest type-safe.
  // Keep proxy dispatching request-scoped. Replacing the global dispatcher breaks
  // env-driven HTTP(S)_PROXY behavior for unrelated outbound requests.
  const fetcher = ((input: RequestInfo | URL, init?: RequestInit) =>
    undiciFetch(input as string | URL, {
      ...(init as Record<string, unknown>),
      dispatcher: agent,
    }) as unknown as Promise<Response>) as typeof fetch;
  // Return raw proxy fetch; call sites that need AbortSignal normalization
  // should opt into resolveFetch/wrapFetchWithAbortSignal once at the edge.
  return fetcher;
}

/**
 * Resolve proxy URL from standard environment variables.
 * Precedence: HTTPS_PROXY > HTTP_PROXY > ALL_PROXY (case-insensitive).
 */
export function resolveProxyUrlFromEnv(): string | undefined {
  const candidates = [
    process.env.HTTPS_PROXY,
    process.env.https_proxy,
    process.env.HTTP_PROXY,
    process.env.http_proxy,
    process.env.ALL_PROXY,
    process.env.all_proxy,
  ];
  for (const value of candidates) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return undefined;
}

function normalizeNoProxyEntry(value: string): string {
  let normalized = value.trim().toLowerCase();
  if (!normalized) {
    return "";
  }
  if (normalized === "*") {
    return normalized;
  }
  normalized = normalized.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  normalized = normalized.split("/")[0] ?? normalized;
  if (normalized.startsWith("[")) {
    const end = normalized.indexOf("]");
    if (end > 0) {
      normalized = normalized.slice(1, end);
    }
  } else {
    const match = normalized.match(/^(.*):\d+$/);
    if (match?.[1]) {
      normalized = match[1];
    }
  }
  if (normalized.startsWith("*.")) {
    normalized = normalized.slice(2);
  }
  return normalized;
}

function resolveNoProxyEntries(noProxy?: string | string[]): string[] {
  const raw =
    typeof noProxy === "undefined" ? (process.env.NO_PROXY ?? process.env.no_proxy ?? "") : noProxy;
  const list = Array.isArray(raw) ? raw : raw.split(",");
  return list.map(normalizeNoProxyEntry).filter(Boolean);
}

/**
 * Return true when proxying should be bypassed for the given URL based on NO_PROXY.
 * Supports exact host entries, leading-dot/suffix domains, and wildcard (*).
 */
export function shouldBypassProxyForUrl(url: string, noProxy?: string | string[]): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.trim().toLowerCase();
  } catch {
    return false;
  }
  if (!hostname) {
    return false;
  }

  const entries = resolveNoProxyEntries(noProxy);
  for (const entry of entries) {
    if (entry === "*") {
      return true;
    }
    if (entry.startsWith(".")) {
      const suffix = entry.slice(1);
      if (suffix && (hostname === suffix || hostname.endsWith(`.${suffix}`))) {
        return true;
      }
      continue;
    }
    if (hostname === entry || hostname.endsWith(`.${entry}`)) {
      return true;
    }
  }
  return false;
}
