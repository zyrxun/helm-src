#!/usr/bin/env python3
"""
compute_coefficient.py
Divides post performance against account baseline to produce a performance coefficient.
Defaults to 1.0 baseline on day 1 to prevent division-by-zero during bootstrap.
"""

import argparse
import json
import sys
from pathlib import Path

MARKETING_DIR = Path(__file__).parent.parent
BASELINE_FILE = MARKETING_DIR / "account-baseline.json"

# Day-1 bootstrap default: no history = treat performance as average
BASELINE_DEFAULT = 1.0
BASELINE_IMPRESSIONS_DEFAULT = 100
BASELINE_CLICKS_DEFAULT = 5


def load_baseline() -> dict:
    if not BASELINE_FILE.exists():
        print("[INFO] No account-baseline.json found. Using day-1 defaults (coefficient will be 1.0).", file=sys.stderr)
        return {
            "avg_impressions": BASELINE_IMPRESSIONS_DEFAULT,
            "avg_clicks": BASELINE_CLICKS_DEFAULT,
            "avg_shares": 1,
            "avg_likes": 10,
            "post_count": 0,
        }
    return json.loads(BASELINE_FILE.read_text())


def update_baseline(baseline: dict, metrics: dict) -> dict:
    """Rolling average update after each post."""
    n = baseline["post_count"]
    raw = metrics.get("raw_metrics", {})

    def rolling(old, new):
        return round((old * n + new) / (n + 1), 2)

    baseline["avg_impressions"] = rolling(baseline["avg_impressions"], raw.get("impressions", 0))
    baseline["avg_clicks"] = rolling(baseline["avg_clicks"], raw.get("clicks", 0))
    baseline["avg_shares"] = rolling(baseline["avg_shares"], raw.get("shares", 0))
    baseline["avg_likes"] = rolling(baseline["avg_likes"], raw.get("likes", 0))
    baseline["post_count"] = n + 1
    return baseline


def compute(metrics: dict, baseline: dict) -> float:
    raw = metrics.get("raw_metrics", {})
    impressions = raw.get("impressions", 0)

    if metrics.get("dry_run") or impressions == 0:
        print("[INFO] Dry run or zero impressions. Returning default coefficient 1.0.", file=sys.stderr)
        return BASELINE_DEFAULT

    avg = baseline.get("avg_impressions", BASELINE_IMPRESSIONS_DEFAULT)
    if avg == 0:
        return BASELINE_DEFAULT

    return round(impressions / avg, 4)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--metrics", required=True, help="Path to metrics JSON file")
    args = parser.parse_args()

    metrics = json.loads(Path(args.metrics).read_text())
    baseline = load_baseline()

    coefficient = compute(metrics, baseline)

    # Update rolling baseline for next cycle
    updated_baseline = update_baseline(baseline, metrics)
    BASELINE_FILE.write_text(json.dumps(updated_baseline, indent=2))

    result = {
        "post_id": metrics.get("post_id"),
        "performance_coefficient": coefficient,
        "baseline_impressions": baseline.get("avg_impressions"),
        "post_impressions": metrics.get("raw_metrics", {}).get("impressions", 0),
        "baseline_post_count": baseline.get("post_count"),
    }

    print(json.dumps(result))


if __name__ == "__main__":
    main()
