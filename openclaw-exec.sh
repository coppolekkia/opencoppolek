#!/bin/bash
# OpenClaw System Executor — deterministic, safe, auditable
# Called by tool-wrapper-proxy for system operations
# Usage: openclaw-exec.sh <action> [args...]

set -euo pipefail
LOG="/Users/rexmacmini/openclaw/logs/exec.log"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] exec: $*" >> "$LOG"

ACTION="${1:-help}"
shift 2>/dev/null || true

case "$ACTION" in
  # Docker
  docker-ps)
    docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
    ;;
  docker-restart)
    [ -z "${1:-}" ] && echo "ERROR: container name required" && exit 1
    docker restart "$1" && echo "Restarted: $1" && sleep 2 && docker ps --filter "name=$1" --format '{{.Names}}\t{{.Status}}'
    ;;
  docker-stop)
    [ -z "${1:-}" ] && echo "ERROR: container name required" && exit 1
    docker stop "$1" && echo "Stopped: $1"
    ;;
  docker-logs)
    docker logs --tail 50 "${1:-openclaw-openclaw-gateway-1}" 2>&1
    ;;
  docker-compose-up)
    cd "${1:-/Users/rexmacmini/openclaw}" && docker compose up -d 2>&1
    ;;

  # Service management
  restart-service)
    [ -z "${1:-}" ] && echo "ERROR: service name required" && exit 1
    launchctl kickstart -k "gui/501/$1" && echo "Restarted: $1"
    ;;
  service-list)
    launchctl list | grep -E 'openclaw|session-bridge|orchestrator|wrapper|agentd' || echo "(none found)"
    ;;

  # Git
  git-status)
    cd "${1:-/Users/rexmacmini/openclaw}" && git status -s
    ;;
  git-log)
    cd "${1:-/Users/rexmacmini/openclaw}" && git log --oneline -5
    ;;
  git-pull)
    cd "${1:-/Users/rexmacmini/openclaw}" && git pull 2>&1
    ;;

  # System
  system-info)
    echo "Hostname: $(hostname)"
    echo "Uptime: $(uptime)"
    echo "Disk: $(df -h / | tail -1 | awk '{print $4 " free of " $2}')"
    echo "Memory: $(vm_stat | head -5)"
    ;;
  process-list)
    ps aux | grep -E "${1:-openclaw|session-bridge|orchestrator|wrapper|ollama}" | grep -v grep
    ;;

  # Deploy
  deploy-openclaw)
    cd /Users/rexmacmini/openclaw && git pull && docker compose up -d 2>&1
    ;;
  deploy-taiwan-stock)
    cd /Users/rexmacmini/Project/active_projects/taiwan-stock-mvp && git pull && docker compose up -d 2>&1
    ;;

  # Logs
  logs)
    tail -50 "${1:-/Users/rexmacmini/openclaw/logs/tool-wrapper-proxy.log}" 2>&1
    ;;

  # Health
  health)
    echo "=== Docker ==="
    docker ps --format '{{.Names}}: {{.Status}}'
    echo ""
    echo "=== Services ==="
    launchctl list | grep -E 'openclaw|session-bridge|orchestrator|wrapper' | awk '{print $3 ": exit=" $2}'
    echo ""
    echo "=== Disk ==="
    df -h / | tail -1 | awk '{print $4 " free"}'
    ;;

  # Raw command (fallback, with safety)
  raw)
    CMD="$*"
    # Block dangerous patterns
    if echo "$CMD" | grep -qiE 'rm\s+-rf\s+/[^t]|mkfs|dd\s+if=|chmod\s+777\s+/'; then
      echo "ERROR: blocked dangerous command"
      exit 1
    fi
    eval "$CMD" 2>&1
    ;;

  help|*)
    echo "OpenClaw Executor v1"
    echo "Actions: docker-ps, docker-restart <name>, docker-stop <name>, docker-logs [name]"
    echo "         docker-compose-up [dir], restart-service <plist>, service-list"
    echo "         git-status [dir], git-log [dir], git-pull [dir]"
    echo "         system-info, process-list [pattern], health"
    echo "         deploy-openclaw, deploy-taiwan-stock"
    echo "         logs [file], raw <command>"
    ;;
esac
