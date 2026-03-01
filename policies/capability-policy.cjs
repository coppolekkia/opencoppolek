// CapabilityPolicy — match intent to executor capabilities
// Pure function: (intent) → { capable: { ollama, claude }, reason }

// Intents that require Claude (Ollama can't handle well)
const CLAUDE_ONLY = new Set(["deploy", "system_status"]);

// Intents where Ollama excels
const OLLAMA_PREFERRED = new Set(["chat", "code", "summarize", "web_search"]);

class CapabilityPolicy {
  match(intent) {
    const intentName = intent.intent || "chat";

    if (CLAUDE_ONLY.has(intentName)) {
      return {
        capable: { ollama: false, claude: true },
        reason: `${intentName}_requires_claude`,
      };
    }

    if (OLLAMA_PREFERRED.has(intentName) && intent.complexity < 0.7) {
      return {
        capable: { ollama: true, claude: true },
        preferred: "ollama",
        reason: `${intentName}_ollama_preferred`,
      };
    }

    // Both capable, no preference
    return {
      capable: { ollama: true, claude: true },
      preferred: null,
      reason: "both_capable",
    };
  }
}

module.exports = { CapabilityPolicy };
