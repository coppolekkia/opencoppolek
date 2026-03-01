// CostPolicy — determine preferred executor based on cost optimization
// Pure function: (intent, stateSnapshot) → { preferred, fallback, reason }

class CostPolicy {
  evaluate(intent, stateSnapshot) {
    const { complexity, estimatedTokens } = intent;
    const ollamaRatio = stateSnapshot?.cost?.ollamaRatio || 0;
    const ollamaAvailable = stateSnapshot?.availability?.ollama !== false;

    // High complexity → always Claude
    if (complexity > 0.8) {
      return { preferred: "claude", fallback: null, reason: "high_complexity" };
    }

    // Ollama unavailable → Claude
    if (!ollamaAvailable) {
      return { preferred: "claude", fallback: null, reason: "ollama_unavailable" };
    }

    // Low complexity + small tokens → Ollama
    if (complexity < 0.45 && estimatedTokens < 1200) {
      return { preferred: "ollama", fallback: "claude", reason: "low_complexity" };
    }

    // Medium → prefer Ollama if ratio below target (85%)
    if (ollamaRatio < 0.85) {
      return { preferred: "ollama", fallback: "claude", reason: "cost_target" };
    }

    // Default: Ollama with Claude fallback
    return { preferred: "ollama", fallback: "claude", reason: "default" };
  }
}

module.exports = { CostPolicy };
