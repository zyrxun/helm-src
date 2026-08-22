#!/usr/bin/env python3
"""
calculate_window.py
Converts a human-readable time window label from Agent 3 into a cron-compatible datetime.
Returns the next upcoming occurrence. Falls back to platform defaults on parse failure.
"""

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

MARKETING_DIR = Path(__file__).parent.parent

# Default peak windows per platform if engagement-matrix.json is missing or parse fails
PLATFORM_DEFAULTS = {
    "X":         {"day": 1, "hour": 9},   # Tuesday 09:00 UTC
    "Instagram": {"day": 1, "hour": 11},  # Tuesday 11:00 UTC
    "Meta":      {"day": 2, "hour": 12},  # Wednesday 12:00 UTC
}

DAY_MAP = {
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
    "friday": 4, "saturday": 5, "sunday": 6,
}


def parse_window(window_string: str) -> datetime:
    """Parse 'Tuesday 09:00–10:00 UTC' into the next upcoming datetime."""
    parts = window_string.lower().split()
    day_name = parts[0].rstrip(",")
    time_part = parts[1].split("–")[0].split("-")[0]  # take start of range
    hour, minute = (int(x) for x in time_part.split(":"))

    target_weekday = DAY_MAP[day_name]
    now = datetime.now(timezone.utc)
    days_ahead = (target_weekday - now.weekday()) % 7
    if days_ahead == 0 and now.hour >= hour:
        days_ahead = 7  # already past this window today, take next week

    target = now.replace(hour=hour, minute=minute, second=0, microsecond=0) + timedelta(days=days_ahead)
    return target


def get_default_window(platform: str) -> datetime:
    """Return the next occurrence of the platform's default peak window."""
    matrix_path = MARKETING_DIR / "engagement-matrix.json"
    if matrix_path.exists():
        try:
            matrix = json.loads(matrix_path.read_text())
            entry = matrix.get(platform, {})
            if "default_day" in entry and "default_hour" in entry:
                fake_window = f"{entry['default_day']} {entry['default_hour']:02d}:00 UTC"
                return parse_window(fake_window)
        except Exception:
            pass

    defaults = PLATFORM_DEFAULTS.get(platform, PLATFORM_DEFAULTS["X"])
    days_ahead = (defaults["day"] - datetime.now(timezone.utc).weekday()) % 7 or 7
    now = datetime.now(timezone.utc)
    return now.replace(hour=defaults["hour"], minute=0, second=0, microsecond=0) + timedelta(days=days_ahead)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--window", help="Human-readable window string from Agent 3")
    parser.add_argument("--platform", default="X", help="Target platform for fallback defaults")
    parser.add_argument("--offset-hours", type=int, help="Return now + N hours (for scheduling reviews)")
    args = parser.parse_args()

    if args.offset_hours is not None:
        result = datetime.now(timezone.utc) + timedelta(hours=args.offset_hours)
        print(result.strftime("%Y-%m-%d %H:%M:%S UTC"))
        return

    try:
        timestamp = parse_window(args.window)
    except Exception as e:
        print(f"WARNING: Could not parse window '{args.window}': {e}", file=sys.stderr)
        timestamp = get_default_window(args.platform)
        print(f"WARNING: Falling back to default window for {args.platform}.", file=sys.stderr)

    print(timestamp.strftime("%Y-%m-%d %H:%M:%S UTC"))


if __name__ == "__main__":
    main()
