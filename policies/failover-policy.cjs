// FailoverPolicy — decide whether to fail over or fail back
// Pure function: (stateSnapshot) → evaluation
// All mutable state in PolicyStateStore

const RECOVERY_WINDOW = 120; // seconds before considering failback
const MIN_STABLE_SUCCESS = 5; // consecutive successes needed
const MAX_P95_LATENCY = 3000; // ms — fast success required
const FAILURE_THRESHOLD = 3; // consecutive failures to trigger failover

class FailoverPolicy {
  shouldFailover(stateSnapshot) {
    const { consecutiveFailures } = stateSnapshot.failover;
    return consecutiveFailures >= FAILURE_THRESHOLD;
  }

  canFailback(stateSnapshot) {
    const { consecutiveSuccess, lastRecoveryTs, isFailedOver } = stateSnapshot.failover;
    if (!isFailedOver) {
      return false;
    }

    const p95 = stateSnapshot.failover.p95 || 0;
    const timeSinceRecovery = (Date.now() - lastRecoveryTs) / 1000;

    return (
      consecutiveSuccess >= MIN_STABLE_SUCCESS &&
      p95 < MAX_P95_LATENCY &&
      timeSinceRecovery > RECOVERY_WINDOW
    );
  }

  evaluate(stateSnapshot) {
    if (stateSnapshot.failover.isFailedOver) {
      if (this.canFailback(stateSnapshot)) {
        return { action: "failback", reason: "stable_recovery" };
      }
      return { action: "stay_failed_over", reason: "not_ready" };
    }

    if (this.shouldFailover(stateSnapshot)) {
      return { action: "failover", reason: "consecutive_failures" };
    }

    return { action: "none", reason: "healthy" };
  }
}

module.exports = {
  FailoverPolicy,
  RECOVERY_WINDOW,
  MIN_STABLE_SUCCESS,
  MAX_P95_LATENCY,
  FAILURE_THRESHOLD,
};
