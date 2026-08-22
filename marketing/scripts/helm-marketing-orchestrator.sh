#!/bin/bash
# helm-marketing-orchestrator.sh
# Handles all pipeline logic the LLM must not touch:
# timestamp math, jitter, forbidden word retry loop, API queuing, directive trimming.

set -euo pipefail

MARKETING_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PIPELINE_DIR="$MARKETING_DIR/pipeline"
SCRIPTS_DIR="$MARKETING_DIR/scripts"

FORBIDDEN="easily|simply|seamlessly|powerful|revolutionary|supercharge|effortlessly|intuitive|streamline"
MAX_RETRIES=2

# ─── PHASE 0: FETCH FRESH POSTS ───────────────────────────────────────────────

echo "[0/4] Fetching fresh posts from scout accounts..."
bash "$SCRIPTS_DIR/fetch-posts.sh"

# ─── PHASE 1: TREND SCOUT ─────────────────────────────────────────────────────

echo "[1/4] Running Trend Scout..."

SCOUT_PROMPT="You are the Trend Scout Agent. Analyze the posts in the provided JSON. Apply the mood/personality filter first — accept only posts with precision, authority, calm command, or high-performance discipline. Reject consumer hype and low-effort meme formats. For accepted posts, apply the Extraction Matrix and output a JSON array. Output raw JSON only. Do not wrap in markdown code blocks or include conversational text."

SCOUT_OUTPUT=$(claude --print -p "$SCOUT_PROMPT" < "$PIPELINE_DIR/scraped-posts.json" | jq '.')

if ! echo "$SCOUT_OUTPUT" | jq -e '.' > /dev/null 2>&1; then
    echo "ERROR: Agent 1 output is not valid JSON. Aborting."
    exit 1
fi

echo "$SCOUT_OUTPUT" > "$PIPELINE_DIR/scout-output.json"

REJECTION_COUNT=$(echo "$SCOUT_OUTPUT" | jq '[.[] | select(.status == "REJECTED")] | length')
ACCEPTED_COUNT=$(echo "$SCOUT_OUTPUT" | jq '[.[] | select(.status == "ACCEPTED")] | length')
echo "Scout: $ACCEPTED_COUNT accepted, $REJECTION_COUNT rejected."

if [[ "$ACCEPTED_COUNT" -eq 0 ]]; then
    echo "ERROR: All posts rejected by Trend Scout. Provide better source material. Aborting."
    exit 1
fi

# ─── PHASE 2: HELM COPYWRITER ─────────────────────────────────────────────────

echo "[2/4] Running Helm Copywriter..."

# Load current directives (capped at 10, maintained by this script)
DIRECTIVES_FILE="$MARKETING_DIR/current-directives.json"
if [[ -f "$DIRECTIVES_FILE" ]]; then
    DIRECTIVES=$(jq -r '.active_directives[]' "$DIRECTIVES_FILE" | head -10 | awk '{print NR". "$0}')
else
    DIRECTIVES="None yet. This is the first cycle."
fi

COPY_PROMPT="You are the Helm Copywriter Agent. Translate the structural blueprints in the provided JSON into Helm promotional copy. Read HELM_BRAND.md before writing. Active strategic directives from previous cycles: $DIRECTIVES. Output raw JSON only. Do not wrap in markdown code blocks or include conversational text."

AGENT2_JSON=$(claude --print -p "$COPY_PROMPT" < "$PIPELINE_DIR/scout-output.json" | jq '.')

if ! echo "$AGENT2_JSON" | jq -e '.' > /dev/null 2>&1; then
    echo "ERROR: Agent 2 output is not valid JSON. Aborting."
    exit 1
fi

# Forbidden word check with retry loop
GENERATED_TEXT=$(echo "$AGENT2_JSON" | jq -r '[.[] | .generated_copy] | join(" ")' 2>/dev/null || echo "$AGENT2_JSON" | jq -r '.generated_copy')
RETRY_COUNT=0

while echo "$GENERATED_TEXT" | grep -qiE "$FORBIDDEN" && [[ $RETRY_COUNT -lt $MAX_RETRIES ]]; do
    OFFENDING=$(echo "$GENERATED_TEXT" | grep -oiE "$FORBIDDEN" | head -1)
    echo "WARNING: Forbidden word '$OFFENDING' detected. Retry $((RETRY_COUNT + 1))/$MAX_RETRIES..."

    PENALTY_PROMPT="PENALTY: Your previous output contained the banned word '$OFFENDING'. Rewrite generated_copy without any of these words: $FORBIDDEN. Output raw JSON only. Do not wrap in markdown code blocks or prepend conversational apologies."
    AGENT2_JSON=$(claude --print -p "$PENALTY_PROMPT" < "$PIPELINE_DIR/scout-output.json" | jq '.')
    GENERATED_TEXT=$(echo "$AGENT2_JSON" | jq -r '[.[] | .generated_copy] | join(" ")' 2>/dev/null || echo "$AGENT2_JSON" | jq -r '.generated_copy')
    ((RETRY_COUNT++))
done

if echo "$GENERATED_TEXT" | grep -qiE "$FORBIDDEN"; then
    echo "HARD FAILURE: Forbidden word persisted after $MAX_RETRIES retries. Aborting."
    exit 1
fi

echo "$AGENT2_JSON" > "$PIPELINE_DIR/copywriter-output.json"
echo "Copywriter: copy approved."

# ─── PHASE 3: DISPATCHER ──────────────────────────────────────────────────────

echo "[3/4] Running Dispatcher..."

DISPATCH_PROMPT="You are the Dispatcher Agent. Validate the copy in the provided JSON against platform character limits. Select the optimal publishing time window from historical engagement data. Output raw JSON only. Do not wrap in markdown code blocks or include conversational text."

DISPATCH_JSON=$(claude --print -p "$DISPATCH_PROMPT" < "$PIPELINE_DIR/copywriter-output.json" | jq '.')

if ! echo "$DISPATCH_JSON" | jq -e '.' > /dev/null 2>&1; then
    echo "ERROR: Agent 3 output is not valid JSON. Aborting."
    exit 1
fi

STATUS=$(echo "$DISPATCH_JSON" | jq -r '.status')
if [[ "$STATUS" == "TRUNCATION_REQUIRED" ]]; then
    CHAR_COUNT=$(echo "$DISPATCH_JSON" | jq -r '.character_count')
    CHAR_LIMIT=$(echo "$DISPATCH_JSON" | jq -r '.character_limit')
    echo "HALT: Copy is $CHAR_COUNT chars, exceeds platform limit of $CHAR_LIMIT. Fix manually and rerun."
    exit 1
fi

echo "$DISPATCH_JSON" > "$PIPELINE_DIR/dispatch-package.json"

TARGET_NETWORK=$(echo "$DISPATCH_JSON" | jq -r '.target_network')
TARGET_WINDOW=$(echo "$DISPATCH_JSON" | jq -r '.recommended_target_window')
VALIDATED_PAYLOAD=$(echo "$DISPATCH_JSON" | jq -r '.validated_payload')

# Timestamp math done by script, not LLM
CALCULATED_TIME=$(python3 "$SCRIPTS_DIR/calculate_window.py" --window "$TARGET_WINDOW" --platform "$TARGET_NETWORK")

# Anti-spam jitter: 120–420 seconds (2–7 minutes). $RANDOM is the machine's entropy, not LLM-generated.
JITTER=$(( RANDOM % 300 + 120 ))
echo "Dispatcher: scheduled for $TARGET_NETWORK at $CALCULATED_TIME +${JITTER}s jitter"

# Queue publish via platform script
case "$TARGET_NETWORK" in
    X)
        # [PLACEHOLDER] Set X_API_KEY and X_API_SECRET, then implement x_post.sh
        echo "[PLACEHOLDER] X publishing not yet implemented. Wire up $SCRIPTS_DIR/x_post.sh"
        POST_ID="placeholder-$(date +%s)"
        ;;
    Instagram)
        # [PLACEHOLDER] Set META_ACCESS_TOKEN, then implement instagram_post.sh
        echo "[PLACEHOLDER] Instagram publishing not yet implemented. Wire up $SCRIPTS_DIR/instagram_post.sh"
        POST_ID="placeholder-$(date +%s)"
        ;;
    Meta)
        # [PLACEHOLDER] Set META_ACCESS_TOKEN, then implement meta_post.sh
        echo "[PLACEHOLDER] Meta publishing not yet implemented. Wire up $SCRIPTS_DIR/meta_post.sh"
        POST_ID="placeholder-$(date +%s)"
        ;;
    *)
        echo "ERROR: Unknown target network '$TARGET_NETWORK'"
        exit 1
        ;;
esac

# ─── SCHEDULE GROWTH REVIEW (48h cron) ───────────────────────────────────────

REVIEW_TIME=$(python3 "$SCRIPTS_DIR/calculate_window.py" --offset-hours 48)
echo "Growth review scheduled for post $POST_ID at $REVIEW_TIME"
echo "python3 $SCRIPTS_DIR/fetch_metrics.py --post-id $POST_ID && python3 $SCRIPTS_DIR/compute_coefficient.py --metrics $PIPELINE_DIR/metrics-$POST_ID.json" | at "$REVIEW_TIME" 2>/dev/null || echo "[INFO] 'at' command not available. Schedule the growth review manually."

echo ""
echo "Pipeline complete."
echo "  Network:   $TARGET_NETWORK"
echo "  Post ID:   $POST_ID"
echo "  Window:    $TARGET_WINDOW"
echo "  Review at: $REVIEW_TIME"
