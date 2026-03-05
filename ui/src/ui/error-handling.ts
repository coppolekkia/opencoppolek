/**
 * Enhanced error handling and messaging for OpenClaw Control UI
 * 
 * Provides actionable error messages with:
 * - Fix suggestions
 * - Error codes for debugging
 * - Documentation links
 * - Copy to clipboard functionality
 */

export type ErrorContext = {
  code?: string;
  raw?: string;
  details?: unknown;
};

export type EnhancedError = {
  message: string;
  suggestion?: string;
  docsUrl?: string;
  code?: string;
  raw?: string;
};

const ERROR_PATTERNS: Array<{
  pattern: RegExp;
  message: string;
  suggestion: string;
  docsUrl?: string;
  code?: string;
}> = [
  // Discord token errors
  {
    pattern: /invalid.*discord.*token/i,
    message: "Invalid Discord token format",
    suggestion:
      "Discord bot tokens should be in format: MTxxxxxxxx.yyyyyy.zzzzzzzzz. Check your Discord Developer Portal for the correct token.",
    docsUrl: "https://docs.openclaw.ai/channels/discord#authentication",
    code: "DISCORD_INVALID_TOKEN",
  },
  {
    pattern: /401.*unauthorized|authentication.*failed/i,
    message: "Authentication failed",
    suggestion:
      "Check that your token is correct and hasn't expired. Try regenerating a new token from the provider's dashboard.",
    code: "AUTH_FAILED",
  },

  // Network errors
  {
    pattern: /ECONNREFUSED|connection refused/i,
    message: "Connection refused",
    suggestion:
      "The gateway may not be running or is not accessible at the configured address. Verify the gateway URL and port in settings.",
    code: "CONN_REFUSED",
  },
  {
    pattern: /ETIMEDOUT|timeout/i,
    message: "Request timed out",
    suggestion:
      "The server took too long to respond. Check your network connection, gateway status, or increase timeout settings if processing complex operations.",
    code: "TIMEOUT",
  },
  {
    pattern: /ENOTFOUND|getaddrinfo ENOTFOUND/i,
    message: "Host not found",
    suggestion:
      "Could not resolve the hostname. Check the gateway URL for typos and ensure DNS resolution is working.",
    code: "HOST_NOT_FOUND",
  },

  // Configuration errors
  {
    pattern: /invalid.*json|unexpected token|json parse/i,
    message: "Invalid JSON syntax",
    suggestion:
      "The configuration contains malformed JSON. Check for missing commas, brackets, or quotes. Use a JSON validator to identify the exact location.",
    code: "JSON_SYNTAX",
  },
  {
    pattern: /required.*property|missing.*field/i,
    message: "Missing required field",
    suggestion:
      "A required configuration field is missing. Review the schema documentation to identify which fields are mandatory for your setup.",
    docsUrl: "https://docs.openclaw.ai/config/schema",
    code: "MISSING_FIELD",
  },

  // Rate limiting
  {
    pattern: /rate limit|429|too many requests/i,
    message: "Rate limit exceeded",
    suggestion:
      "Too many requests sent in a short time. Wait a few minutes before retrying, or adjust rate limit settings if available.",
    code: "RATE_LIMIT",
  },

  // Permission errors
  {
    pattern: /permission denied|EACCES/i,
    message: "Permission denied",
    suggestion:
      "Insufficient permissions to access the resource. Check file permissions or API access rights.",
    code: "PERMISSION_DENIED",
  },

  // Model errors
  {
    pattern: /model.*not.*found|invalid model/i,
    message: "Model not found or invalid",
    suggestion:
      "The specified model ID is not recognized. Check available models in your provider dashboard and ensure the ID is correct.",
    docsUrl: "https://docs.openclaw.ai/agents/models",
    code: "MODEL_INVALID",
  },

  // Cron errors
  {
    pattern: /invalid cron expression/i,
    message: "Invalid cron expression",
    suggestion:
      'Cron expressions should follow the format: "minute hour day month weekday". Use a cron validator or try common patterns like "0 * * * *" (hourly).',
    docsUrl: "https://crontab.guru/",
    code: "CRON_INVALID",
  },
];

/**
 * Enhance an error message with suggestions and context
 */
export function enhanceError(error: string | Error, context?: ErrorContext): EnhancedError {
  const rawMessage = typeof error === "string" ? error : error.message;
  const rawError = typeof error === "string" ? error : error.stack || error.message;

  // Try to match against known patterns
  for (const pattern of ERROR_PATTERNS) {
    if (pattern.pattern.test(rawMessage)) {
      return {
        message: pattern.message,
        suggestion: pattern.suggestion,
        docsUrl: pattern.docsUrl,
        code: pattern.code || context?.code,
        raw: context?.raw || rawError,
      };
    }
  }

  // No match - return enhanced generic error
  return {
    message: rawMessage,
    suggestion: "An unexpected error occurred. Check the raw error message below for details.",
    code: context?.code,
    raw: context?.raw || rawError,
  };
}

/**
 * Format enhanced error for display
 */
export function formatEnhancedError(enhanced: EnhancedError): string {
  let output = `${enhanced.message}\n`;

  if (enhanced.suggestion) {
    output += `\n→ ${enhanced.suggestion}\n`;
  }

  if (enhanced.docsUrl) {
    output += `\n📖 Learn more: ${enhanced.docsUrl}\n`;
  }

  if (enhanced.code) {
    output += `\nError code: ${enhanced.code}`;
  }

  return output;
}

/**
 * Copy error to clipboard
 */
export async function copyErrorToClipboard(enhanced: EnhancedError): Promise<boolean> {
  try {
    const text = formatEnhancedError(enhanced);
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
