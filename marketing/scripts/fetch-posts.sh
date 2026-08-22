#!/bin/bash
# fetch-posts.sh
# Pulls fresh posts from curated accounts via RSSHub (no API keys required).
# Converts to scraped-posts.json format for Agent 1 (helm-trend-scout).
# Run before every helm-marketing cycle.

set -euo pipefail

MARKETING_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PIPELINE_DIR="$MARKETING_DIR/pipeline"
ACCOUNTS_FILE="$MARKETING_DIR/scout-accounts.json"
OUTPUT_FILE="$PIPELINE_DIR/scraped-posts.json"

# Requires: jq, curl, python3
for cmd in jq curl python3; do
    if ! command -v "$cmd" &>/dev/null; then
        echo "ERROR: '$cmd' is required but not installed."
        exit 1
    fi
done

mkdir -p "$PIPELINE_DIR"

# Read fetch settings
MIN_LIKES=$(jq -r '.fetch_settings.min_likes' "$ACCOUNTS_FILE")
MIN_REPOSTS=$(jq -r '.fetch_settings.min_reposts' "$ACCOUNTS_FILE")
POSTS_PER_ACCOUNT=$(jq -r '.fetch_settings.posts_per_account' "$ACCOUNTS_FILE")
LOOKBACK_DAYS=$(jq -r '.fetch_settings.lookback_days' "$ACCOUNTS_FILE")
RSSHUB_BASE="https://rsshub.app"

RESULTS="[]"
ACCOUNT_COUNT=$(jq '.accounts | length' "$ACCOUNTS_FILE")

echo "Fetching posts from $ACCOUNT_COUNT accounts..."

for i in $(seq 0 $((ACCOUNT_COUNT - 1))); do
    HANDLE=$(jq -r ".accounts[$i].handle" "$ACCOUNTS_FILE")
    PLATFORM=$(jq -r ".accounts[$i].platform" "$ACCOUNTS_FILE")

    if [[ "$HANDLE" == "example_handle" ]]; then
        echo "  [SKIP] Placeholder account — update scout-accounts.json with real handles"
        continue
    fi

    echo "  Fetching @$HANDLE ($PLATFORM)..."

    case "$PLATFORM" in
        X)
            FEED_URL="$RSSHUB_BASE/twitter/user/$HANDLE"
            ;;
        Instagram)
            FEED_URL="$RSSHUB_BASE/instagram/user/$HANDLE"
            ;;
        *)
            echo "  [SKIP] Unsupported platform: $PLATFORM"
            continue
            ;;
    esac

    # Fetch RSS feed
    RSS_CONTENT=$(curl -s --max-time 10 "$FEED_URL" 2>/dev/null || echo "")

    if [[ -z "$RSS_CONTENT" ]] || echo "$RSS_CONTENT" | grep -q "error\|Error\|404"; then
        echo "  [WARN] Could not fetch feed for @$HANDLE — skipping"
        continue
    fi

    # Parse RSS items via python (handles XML more reliably than bash)
    POSTS=$(python3 - <<PYEOF
import sys, re, json
from datetime import datetime, timezone, timedelta
from xml.etree import ElementTree as ET

content = '''$RSS_CONTENT'''
cutoff = datetime.now(timezone.utc) - timedelta(days=$LOOKBACK_DAYS)

try:
    root = ET.fromstring(content)
except ET.ParseError:
    print("[]")
    sys.exit(0)

ns = {'atom': 'http://www.w3.org/2005/Atom'}
items = root.findall('.//item') or root.findall('.//atom:entry', ns)

results = []
for item in items[:$POSTS_PER_ACCOUNT]:
    title = item.findtext('title') or item.findtext('atom:title', namespaces=ns) or ''
    description = item.findtext('description') or item.findtext('atom:summary', namespaces=ns) or ''
    # Use description if it has more content than title
    text = description if len(description) > len(title) else title
    # Strip HTML tags
    text = re.sub(r'<[^>]+>', '', text).strip()
    if not text or len(text) < 20:
        continue
    results.append({
        "platform": "$PLATFORM",
        "handle": "@$HANDLE",
        "text": text,
        "likes": 0,
        "reposts": 0,
        "comments": 0
    })

print(json.dumps(results))
PYEOF
)

    if [[ "$POSTS" != "[]" ]] && [[ -n "$POSTS" ]]; then
        RESULTS=$(echo "$RESULTS" "$POSTS" | jq -s 'add')
        COUNT=$(echo "$POSTS" | jq 'length')
        echo "  Found $COUNT posts from @$HANDLE"
    fi

    # Polite delay between requests
    sleep 1
done

TOTAL=$(echo "$RESULTS" | jq 'length')

if [[ "$TOTAL" -eq 0 ]]; then
    echo ""
    echo "ERROR: No posts fetched. Check scout-accounts.json has real account handles."
    echo "Add accounts matching Helm's brand register — precision tech, premium hardware, serious developer tools."
    exit 1
fi

echo "$RESULTS" | jq '.' > "$OUTPUT_FILE"
echo ""
echo "Fetched $TOTAL posts → $OUTPUT_FILE"
echo "NOTE: RSS feeds don't include engagement metrics. Agent 1 will evaluate on structural quality and mood only."
echo "      Update min_likes/min_reposts filtering once you have API access."
