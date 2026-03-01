#!/bin/bash
# Docker Cleanup Script for OpenClaw (P1.7)
# Removes unused Docker images, containers, and builder cache
# Scheduled: Weekly (Sunday 22:00 via LaunchAgent)

set -e

DOCKER="/Users/rexmacmini/.orbstack/bin/docker"
LOG_DIR="$HOME/openclaw/logs"
CLEANUP_LOG="$LOG_DIR/docker-cleanup.jsonl"

# Ensure log dir exists
mkdir -p "$LOG_DIR"

# Timestamp for logging
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

log_entry() {
  local status=$1
  local action=$2
  local detail=$3
  echo "{\"ts\":\"$TS\",\"action\":\"$action\",\"status\":\"$status\",\"detail\":\"$detail\"}" >> "$CLEANUP_LOG"
}

echo "[docker-cleanup] Starting cleanup at $TS"

# 1. Remove unused containers (stopped, exited)
echo "[docker-cleanup] Pruning stopped containers..."
if $DOCKER container prune -f --filter "until=168h" > /dev/null 2>&1; then
  log_entry "ok" "prune_containers" "Removed stopped containers older than 7 days"
  echo "[docker-cleanup] ✓ Containers pruned"
else
  log_entry "error" "prune_containers" "Failed to prune containers"
  echo "[docker-cleanup] ✗ Container pruning failed"
fi

# 2. Remove dangling images
echo "[docker-cleanup] Pruning dangling images..."
if $DOCKER image prune -f > /dev/null 2>&1; then
  log_entry "ok" "prune_images" "Removed dangling images"
  echo "[docker-cleanup] ✓ Images pruned"
else
  log_entry "error" "prune_images" "Failed to prune images"
  echo "[docker-cleanup] ✗ Image pruning failed"
fi

# 3. Remove unused builder cache (OrbStack-specific: critical for preventing layer bloat)
echo "[docker-cleanup] Pruning builder cache..."
if $DOCKER builder prune -f --keep-storage 10GB > /dev/null 2>&1; then
  log_entry "ok" "prune_builder" "Pruned builder cache, keeping 10GB max"
  echo "[docker-cleanup] ✓ Builder cache pruned (limit: 10GB)"
else
  log_entry "error" "prune_builder" "Failed to prune builder cache"
  echo "[docker-cleanup] ✗ Builder cache pruning failed"
fi

# 4. Report disk usage
echo "[docker-cleanup] Checking Docker disk usage..."
USAGE=$($DOCKER system df 2>/dev/null | grep "Total" | awk '{print $2}')
if [ -n "$USAGE" ]; then
  log_entry "ok" "disk_usage" "Docker disk usage: $USAGE"
  echo "[docker-cleanup] Current Docker disk usage: $USAGE"
else
  log_entry "warn" "disk_usage" "Could not determine Docker disk usage"
fi

# 5. Restart Docker daemon to ensure consistency (optional, only if needed)
# Uncomment if experiencing Docker daemon issues:
# echo "[docker-cleanup] Restarting Docker daemon..."
# launchctl stop com.orbstack.daemon && sleep 2 && launchctl start com.orbstack.daemon

log_entry "ok" "cleanup_complete" "Docker cleanup cycle completed successfully"
echo "[docker-cleanup] ✓ Cleanup completed at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
