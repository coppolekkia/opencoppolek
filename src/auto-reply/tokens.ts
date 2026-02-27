import { escapeRegExp } from "../utils.js";

export const HEARTBEAT_TOKEN = "HEARTBEAT_OK";
export const SILENT_REPLY_TOKEN = "NO_REPLY";

export function isSilentReplyText(
  text: string | undefined,
  token: string = SILENT_REPLY_TOKEN,
): boolean {
  if (!text) {
    return false;
  }
  const escaped = escapeRegExp(token);
  // Match the silent token at the start (with optional leading whitespace) followed by
  // either end-of-string or a newline. This suppresses the entire message when the model
  // outputs e.g. "NO_REPLY\n\nsome trailing text" (#28874) while still allowing
  // substantive replies that end with NO_REPLY to pass through (#19537).
  return new RegExp(`^\\s*${escaped}\\s*$|^\\s*${escaped}\\s*\\n`).test(text);
}

export function isSilentReplyPrefixText(
  text: string | undefined,
  token: string = SILENT_REPLY_TOKEN,
): boolean {
  if (!text) {
    return false;
  }
  const normalized = text.trimStart().toUpperCase();
  if (!normalized) {
    return false;
  }
  if (!normalized.includes("_")) {
    return false;
  }
  if (/[^A-Z_]/.test(normalized)) {
    return false;
  }
  return token.toUpperCase().startsWith(normalized);
}
