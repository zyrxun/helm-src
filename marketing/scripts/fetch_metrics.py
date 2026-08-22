#!/usr/bin/env python3
"""
fetch_metrics.py
Pulls live platform metrics 48h after publication.
Caps top_comments and quote_tweets at 5 items, truncated to 200 chars each.
Returns stub JSON if no API credentials are set (dry-run mode).
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

PIPELINE_DIR = Path(__file__).parent.parent / "pipeline"

# Hard limits — enforced here, not by the LLM
MAX_QUALITATIVE_ITEMS = 5
MAX_COMMENT_LENGTH = 200


def truncate(text: str) -> str:
    return text[:MAX_COMMENT_LENGTH] if len(text) > MAX_COMMENT_LENGTH else text


def fetch_x_metrics(post_id: str) -> dict:
    api_key = os.environ.get("X_API_KEY")
    if not api_key:
        print("[INFO] X_API_KEY not set. Returning stub metrics.", file=sys.stderr)
        return stub_metrics(post_id)

    # [PLACEHOLDER] Implement X API v2 call here
    # GET https://api.twitter.com/2/tweets/{id}?tweet.fields=public_metrics,non_public_metrics
    raise NotImplementedError("X API not yet implemented. Set X_API_KEY and wire up the call.")


def fetch_meta_metrics(post_id: str) -> dict:
    access_token = os.environ.get("META_ACCESS_TOKEN")
    if not access_token:
        print("[INFO] META_ACCESS_TOKEN not set. Returning stub metrics.", file=sys.stderr)
        return stub_metrics(post_id)

    # [PLACEHOLDER] Implement Meta Graph API call here
    raise NotImplementedError("Meta API not yet implemented.")


def stub_metrics(post_id: str) -> dict:
    """Returns zeroed metrics so Agent 4 can run in dry-run mode."""
    return {
        "post_id": post_id,
        "platform": "unknown",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "raw_metrics": {
            "impressions": 0,
            "clicks": 0,
            "shares": 0,
            "likes": 0,
            "top_comments": [],
            "quote_tweets": [],
        },
        "dry_run": True,
    }


def cap_qualitative(metrics: dict) -> dict:
    """Enforce hard caps on comment/quote arrays before writing."""
    raw = metrics.get("raw_metrics", {})
    raw["top_comments"] = [
        truncate(c) for c in raw.get("top_comments", [])[:MAX_QUALITATIVE_ITEMS]
    ]
    raw["quote_tweets"] = [
        truncate(q) for q in raw.get("quote_tweets", [])[:MAX_QUALITATIVE_ITEMS]
    ]
    return metrics


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--post-id", required=True)
    parser.add_argument("--platform", default="X", choices=["X", "Instagram", "Meta"])
    args = parser.parse_args()

    if args.platform == "X":
        metrics = fetch_x_metrics(args.post_id)
    else:
        metrics = fetch_meta_metrics(args.post_id)

    metrics = cap_qualitative(metrics)

    output_path = PIPELINE_DIR / f"metrics-{args.post_id}.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(metrics, indent=2))

    print(json.dumps(metrics))


if __name__ == "__main__":
    main()
