// SelectionReducer — final executor selection from policy evaluations
// Pure function: (intent, cost, capability, failover) → { executor, reason, fallback }

class SelectionReducer {
  select(intent, cost, capability, failoverEval) {
    // Failover override: if currently failed over, force Claude
    if (failoverEval.action === "failover" || failoverEval.action === "stay_failed_over") {
      return {
        executor: "claude",
        reason: `failover:${failoverEval.reason}`,
        fallback: null,
      };
    }

    // Capability gate: if only one executor is capable
    if (!capability.capable.ollama) {
      return { executor: "claude", reason: capability.reason, fallback: null };
    }
    if (!capability.capable.claude) {
      return { executor: "ollama", reason: capability.reason, fallback: null };
    }

    // Cost policy is primary selector
    const preferred = cost.preferred;
    const fallback = cost.fallback;

    // Capability preference can override cost when both are capable
    if (capability.preferred && capability.preferred !== preferred) {
      // Capability says different from cost — use capability for medium complexity
      if (intent.complexity >= 0.4 && intent.complexity <= 0.7) {
        return {
          executor: capability.preferred,
          reason: `capability_override:${capability.reason}`,
          fallback: capability.preferred === "ollama" ? "claude" : "ollama",
        };
      }
    }

    return {
      executor: preferred,
      reason: `cost:${cost.reason}`,
      fallback,
    };
  }
}

module.exports = { SelectionReducer };
