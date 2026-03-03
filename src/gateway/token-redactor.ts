/**
 * Redacts sensitive tokens from config output, logs, and error messages.
 * T-ACCESS-003 residual risk: tokens visible in plaintext.
 *
 * Standalone module — call installLogRedaction() from the gateway
 * entrypoint to activate. Integration is a follow-up PR.
 */

import { inspect } from "util";

// Matches known-sensitive JSON field names with optional prefix
// (e.g. authToken, botToken) but NO trailing suffix — avoids
// false positives on tokenizer, secretaryEmail, apiKeywords, etc.
const SENSITIVE_FIELD_PATTERN =
  /("(?:\w*(?:token|password|secret|api_key|apiKey))"\s*:\s*")([^"]+)(")/gi;

// Same scoping for util.inspect format (unquoted keys, single quotes)
const INSPECT_FIELD_PATTERN =
  /((?:\w*(?:token|password|secret|api_key|apiKey)):\s*')([^']+)(')/gi;

// Match any non-whitespace after "Bearer" — covers all opaque formats
const BEARER_PATTERN = /(bearer\s+)(\S+)/gi;

export function mask(token: string): string {
  if (token.length <= 16) return "****";
  return token.slice(0, 4) + "****";
}

export function redactTokens(input: string): string {
  return input
    .replace(SENSITIVE_FIELD_PATTERN, (_m, pre, token, post) => {
      return `${pre}${mask(token)}${post}`;
    })
    .replace(INSPECT_FIELD_PATTERN, (_m, pre, token, post) => {
      return `${pre}${mask(token)}${post}`;
    })
    .replace(BEARER_PATTERN, (_m, pre, token) => {
      return `${pre}${mask(token)}`;
    });
}

function stringify(arg: any): any {
  if (typeof arg === "string") return redactTokens(arg);

  if (arg instanceof Error) {
    const clone: Error = Object.create(Object.getPrototypeOf(arg));
    for (const key of Object.keys(arg)) {
      const val = (arg as any)[key];
      if (typeof val === "string") {
        (clone as any)[key] = redactTokens(val);
      } else if (typeof val === "object" && val !== null) {
        try {
          (clone as any)[key] = JSON.parse(
            redactTokens(JSON.stringify(val)),
          );
        } catch {
          (clone as any)[key] = redactTokens(
            inspect(val, { depth: 3, maxStringLength: 200, breakLength: Infinity }),
          );
        }
      } else {
        (clone as any)[key] = val;
      }
    }
    clone.message = redactTokens(arg.message);
    if (arg.stack) clone.stack = redactTokens(arg.stack);
    return clone;
  }

  if (typeof arg === "object" && arg !== null) {
    try {
      return JSON.parse(redactTokens(JSON.stringify(arg)));
    } catch {
      return redactTokens(
        inspect(arg, { depth: 3, maxStringLength: 200, breakLength: Infinity }),
      );
    }
  }

  return arg;
}

let installed = false;
let savedOriginals: Record<string, (...args: any[]) => void> = {};

export function installLogRedaction(): void {
  if (installed) return;

  const methods = [
    "log", "info", "debug", "warn", "error", "trace", "dir", "table",
  ] as const;

  for (const level of methods) {
    if (typeof console[level] !== "function") continue;
    savedOriginals[level] = console[level];
    (console as any)[level] = (...args: any[]) => {
      const redacted = args.map(stringify);
      savedOriginals[level].apply(console, redacted);
    };
  }

  installed = true;
}

export function uninstallLogRedaction(): void {
  if (!installed) return;
  for (const [level, fn] of Object.entries(savedOriginals)) {
    (console as any)[level] = fn;
  }
  savedOriginals = {};
  installed = false;
}
