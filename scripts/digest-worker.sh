#!/bin/bash
set -e

# Configuration from environment or defaults
CLAWFEED_BASE_URL="${CLAWFEED_BASE_URL:-http://localhost:8767}"
CLAWFEED_API_KEY="${CLAWFEED_API_KEY}"
OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://localhost:11434}"
OLLAMA_MODEL="${OLLAMA_MODEL:-llama3.2:3b}"
LOG_DIR="${LOG_DIR:-$HOME/openclaw/logs}"
LOG_FILE="$LOG_DIR/digest-worker.log"

# Validate API key
if [ -z "$CLAWFEED_API_KEY" ]; then
    echo "ERROR: CLAWFEED_API_KEY not set" >&2
    exit 1
fi

# Create log directory
mkdir -p "$LOG_DIR"

# Log helper
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')]" "$@" | tee -a "$LOG_FILE"
}

log "=== Digest Worker Started ==="

# Check if ClawFeed is running
if ! curl -sf "$CLAWFEED_BASE_URL/health" > /dev/null 2>&1; then
    log "ERROR: ClawFeed not responding at $CLAWFEED_BASE_URL"
    exit 1
fi
log "✓ ClawFeed is healthy"

# Check if Ollama is running
if ! curl -sf "$OLLAMA_BASE_URL/api/tags" > /dev/null 2>&1; then
    log "ERROR: Ollama not responding at $OLLAMA_BASE_URL"
    exit 1
fi
log "✓ Ollama is healthy"

# Ensure model is available
log "Pulling Ollama model: $OLLAMA_MODEL"
curl -s -X POST "$OLLAMA_BASE_URL/api/pull" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$OLLAMA_MODEL\",\"stream\":false}" > /dev/null 2>&1 || true

# Get all sources
log "Fetching sources..."
SOURCES=$(curl -s "$CLAWFEED_BASE_URL/api/sources")
SOURCE_COUNT=$(echo "$SOURCES" | jq 'length')
log "Found $SOURCE_COUNT sources"

if [ "$SOURCE_COUNT" -eq 0 ]; then
    log "No sources configured, exiting"
    exit 0
fi

# Process each source
TOTAL_ITEMS=0
PROCESSED=0

echo "$SOURCES" | jq -c '.[]' | while read -r SOURCE; do
    SOURCE_ID=$(echo "$SOURCE" | jq -r '.id')
    SOURCE_NAME=$(echo "$SOURCE" | jq -r '.name')
    SOURCE_TYPE=$(echo "$SOURCE" | jq -r '.type')

    log "Processing source: $SOURCE_NAME ($SOURCE_TYPE) [ID: $SOURCE_ID]"

    # Get latest items for this source
    ITEMS=$(curl -s "$CLAWFEED_BASE_URL/api/items?source=$SOURCE_ID&limit=5")
    ITEM_COUNT=$(echo "$ITEMS" | jq 'length')

    if [ "$ITEM_COUNT" -eq 0 ]; then
        log "  No new items for $SOURCE_NAME"
        continue
    fi

    log "  Found $ITEM_COUNT items"

    # Prepare content for summarization
    CONTENT=""
    echo "$ITEMS" | jq -c '.[]' | while read -r ITEM; do
        ITEM_TITLE=$(echo "$ITEM" | jq -r '.title // empty')
        ITEM_DESC=$(echo "$ITEM" | jq -r '.description // empty')

        if [ -n "$ITEM_TITLE" ]; then
            CONTENT="$CONTENT- $ITEM_TITLE"
            [ -n "$ITEM_DESC" ] && CONTENT="$CONTENT: $ITEM_DESC"
            CONTENT="$CONTENT"$'\n'
        fi
    done

    if [ -z "$CONTENT" ]; then
        log "  No valid content to summarize"
        continue
    fi

    # Call Ollama to generate summary
    log "  Generating summary with $OLLAMA_MODEL..."

    PROMPT="Summarize the following news items in 2-3 sentences, focusing on key insights:

$CONTENT

Keep it concise and informative."

    # Extract response safely, handling JSON parsing issues
    OLLAMA_RESP=$(curl -s -X POST "$OLLAMA_BASE_URL/api/generate" \
      -H "Content-Type: application/json" \
      -d "{
        \"model\":\"$OLLAMA_MODEL\",
        \"prompt\":\"$PROMPT\",
        \"stream\":false,
        \"options\":{\"temperature\":0.7,\"num_predict\":100}
      }")

    SUMMARY=$(echo "$OLLAMA_RESP" | jq -r '.response // empty' 2>/dev/null || echo "")

    if [ -z "$SUMMARY" ]; then
        log "  ERROR: Failed to generate summary"
        continue
    fi

    log "  Summary: ${SUMMARY:0:80}..."

    # Properly escape JSON content
    SUMMARY_JSON=$(printf '%s\n' "$SUMMARY" | jq -Rs .)
    METADATA_JSON=$(printf '%s\n' "{\"item_count\": $ITEM_COUNT, \"model\": \"$OLLAMA_MODEL\", \"generated_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" | jq -c .)

    # Post digest to ClawFeed
    DIGEST_PAYLOAD=$(cat <<JSONEOF
{
  "type": "daily",
  "content": $SUMMARY_JSON,
  "metadata": "$METADATA_JSON"
}
JSONEOF
)

    DIGEST_RESPONSE=$(curl -s -X POST "$CLAWFEED_BASE_URL/api/digests" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $CLAWFEED_API_KEY" \
      -d "$DIGEST_PAYLOAD")

    DIGEST_ID=$(echo "$DIGEST_RESPONSE" | jq -r '.id // empty' 2>/dev/null || echo "")

    if [ -n "$DIGEST_ID" ]; then
        log "  ✓ Digest created: $DIGEST_ID"
        PROCESSED=$((PROCESSED + 1))
    else
        log "  ERROR: Failed to create digest"
        log "  Response: $DIGEST_RESPONSE"
    fi
done

log "=== Digest Worker Completed ==="
log "Processed: $PROCESSED digests from $TOTAL_ITEMS items"
