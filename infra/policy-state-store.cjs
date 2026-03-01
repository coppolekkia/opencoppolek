// PolicyStateStore — centralized mutable state for all policies
// Policies are pure functions; all mutable counters live here.

class PolicyStateStore {
  constructor() {
    // Failover state
    this.failover = {
      consecutiveSuccess: 0,
      consecutiveFailures: 0,
      lastFailureTs: 0,
      lastRecoveryTs: 0,
      p95Latencies: [], // rolling window of last 20 latencies
      isFailedOver: false,
      failoverSince: 0,
    };

    // Cost tracking
    this.cost = {
      ollamaRequests: 0,
      claudeRequests: 0,
      totalRequests: 0,
    };

    // Executor availability
    this.availability = {
      ollama: true,
      claude: true,
    };
  }

  // --- Failover state ---

  recordSuccess(executor, latencyMs) {
    if (executor === "ollama") {
      this.failover.consecutiveSuccess++;
      this.failover.consecutiveFailures = 0;
      this._pushLatency(latencyMs);
    }
    this.cost.totalRequests++;
    this.cost[executor === "ollama" ? "ollamaRequests" : "claudeRequests"]++;
  }

  recordFailure(executor) {
    if (executor === "ollama") {
      this.failover.consecutiveFailures++;
      this.failover.consecutiveSuccess = 0;
      this.failover.lastFailureTs = Date.now();
    }
    this.cost.totalRequests++;
  }

  markFailover() {
    this.failover.isFailedOver = true;
    this.failover.failoverSince = Date.now();
    this.failover.consecutiveSuccess = 0;
  }

  markRecovered() {
    this.failover.isFailedOver = false;
    this.failover.lastRecoveryTs = Date.now();
    this.failover.consecutiveFailures = 0;
  }

  getP95Latency() {
    const arr = this.failover.p95Latencies;
    if (arr.length === 0) {
      return 0;
    }
    const sorted = [...arr].toSorted((a, b) => a - b);
    const idx = Math.floor(sorted.length * 0.95);
    return sorted[Math.min(idx, sorted.length - 1)];
  }

  _pushLatency(ms) {
    this.failover.p95Latencies.push(ms);
    if (this.failover.p95Latencies.length > 20) {
      this.failover.p95Latencies.shift();
    }
  }

  // --- Cost ratio ---

  getOllamaRatio() {
    if (this.cost.totalRequests === 0) {
      return 0;
    }
    return this.cost.ollamaRequests / this.cost.totalRequests;
  }

  getSnapshot() {
    return {
      failover: { ...this.failover, p95: this.getP95Latency() },
      cost: { ...this.cost, ollamaRatio: this.getOllamaRatio() },
      availability: { ...this.availability },
    };
  }
}

module.exports = { PolicyStateStore };
