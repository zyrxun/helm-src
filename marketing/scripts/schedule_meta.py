#!/usr/bin/env python3
"""
Helm Meta Scheduler
Schedules Facebook and Instagram posts from marketing/pipeline/posts.json
at 4am NZT on each post's date.

Usage:
    python3 marketing/scripts/schedule_meta.py                    # dry run
    python3 marketing/scripts/schedule_meta.py --publish          # schedule FB + IG
    python3 marketing/scripts/schedule_meta.py --instagram-only   # dry run, IG only
    python3 marketing/scripts/schedule_meta.py --instagram-only --publish

Required env vars (put in .env or export before running):
    META_PAGE_ACCESS_TOKEN   — long-lived Page Access Token
    META_PAGE_ID             — Facebook Page ID (numeric string)
    META_IG_ACCOUNT_ID       — Instagram Business Account ID (numeric string)
"""

import json
import os
import sys
import argparse
from datetime import datetime
from zoneinfo import ZoneInfo
import urllib.request
import urllib.parse

GRAPH_API = "https://graph.facebook.com/v21.0"
NZT = ZoneInfo("Pacific/Auckland")
POSTS_FILE = os.path.join(os.path.dirname(__file__), "../pipeline/posts.json")


def load_env():
    env_path = os.path.join(os.path.dirname(__file__), "../../.env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, _, val = line.partition("=")
                    os.environ.setdefault(key.strip(), val.strip())


def post_to_graph(endpoint, params):
    data = urllib.parse.urlencode(params).encode()
    req = urllib.request.Request(f"{GRAPH_API}/{endpoint}", data=data, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        raise Exception(f"HTTP {e.code}: {body}")


def save_posts(data):
    tmp = POSTS_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.replace(tmp, POSTS_FILE)  # atomic on POSIX


def to_nzt_4am_unix(date_str):
    dt = datetime.strptime(date_str, "%Y-%m-%d").replace(
        hour=4, minute=0, second=0, tzinfo=NZT
    )
    return int(dt.timestamp())


def schedule_facebook(page_id, token, message, scheduled_unix, image_url=None):
    if image_url:
        return post_to_graph(f"{page_id}/photos", {
            "caption": message,
            "url": image_url,
            "published": "false",
            "scheduled_publish_time": scheduled_unix,
            "access_token": token,
        })
    else:
        return post_to_graph(f"{page_id}/feed", {
            "message": message,
            "published": "false",
            "scheduled_publish_time": scheduled_unix,
            "access_token": token,
        })


def schedule_instagram(ig_id, token, post, data, scheduled_unix):
    """
    Creates a scheduled Instagram media container (publishes automatically at
    scheduled_publish_time — do NOT call media_publish separately for scheduled posts).

    Writes ig_container_id back to posts.json atomically immediately after container
    creation, before updating instagram_status, so a crash between the two writes
    does not create duplicate ghost containers on re-run.
    """
    image_url = post.get("image_url")
    if not image_url:
        return {"skipped": True, "reason": "no image_url — Instagram requires an image"}

    caption = post["instagram"]["caption"]

    # Reuse an existing container if we crashed after creation but before status update
    existing_container_id = post.get("ig_container_id")
    if existing_container_id:
        container_id = existing_container_id
        print(f"[IG] Reusing existing container {container_id}")
    else:
        container = post_to_graph(f"{ig_id}/media", {
            "image_url": image_url,
            "caption": caption,
            "media_type": "IMAGE",
            "published": "false",
            "scheduled_publish_time": scheduled_unix,
            "access_token": token,
        })
        if not container.get("id"):
            return {"error": container}
        container_id = container["id"]
        post["ig_container_id"] = container_id
        save_posts(data)  # atomic write before updating status

    post["instagram_status"] = "scheduled"
    save_posts(data)
    return {"id": container_id, "status": "scheduled"}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--publish", action="store_true", help="Actually call the Meta API")
    parser.add_argument("--instagram-only", action="store_true", help="Skip Facebook scheduling")
    args = parser.parse_args()

    load_env()

    # Load config unconditionally so both FB and IG paths have access
    token = os.environ.get("META_PAGE_ACCESS_TOKEN")
    page_id = os.environ.get("META_PAGE_ID")
    ig_id = os.environ.get("META_IG_ACCOUNT_ID")

    if args.publish and not all([token, page_id, ig_id]):
        print("ERROR: Set META_PAGE_ACCESS_TOKEN, META_PAGE_ID, and META_IG_ACCOUNT_ID before publishing.")
        sys.exit(1)

    with open(POSTS_FILE) as f:
        data = json.load(f)

    now_unix = int(datetime.now(NZT).timestamp())

    for post in data["posts"]:
        date = post["date"]
        scheduled_unix = to_nzt_4am_unix(date)
        image_url = post.get("image_url")

        scheduled_dt = datetime.fromtimestamp(scheduled_unix, tz=NZT)
        label = scheduled_dt.strftime("%a %b %-d, %I:%M%p NZT")

        fb_status = post.get("status", "pending")
        ig_status = post.get("instagram_status", "done")  # missing field = legacy post, skip

        fb_done = fb_status in ("done", "scheduled")
        ig_done = ig_status in ("done", "scheduled")

        if args.instagram_only and ig_done:
            print(f"[IG SKIP] {date} — instagram already {ig_status}")
            continue
        if not args.instagram_only and fb_done and ig_done:
            print(f"[SKIP]   {date} — fb={fb_status}, ig={ig_status}")
            continue

        if scheduled_unix <= now_unix:
            print(f"[PAST]   {date} — scheduled time has passed, skipping")
            continue

        print(f"\n{'='*60}")
        print(f"DATE:      {date}  →  {label}")
        print(f"IMAGE:     {image_url or 'NONE'}")
        if not args.instagram_only:
            print(f"FACEBOOK:  {post['facebook']['message'][:80]}...")
        print(f"INSTAGRAM: {post['instagram']['caption'][:80]}...")

        if not args.publish:
            print("[DRY RUN] Pass --publish to schedule this post.")
            continue

        # Facebook
        if not args.instagram_only and not fb_done:
            try:
                fb_result = schedule_facebook(page_id, token, post["facebook"]["message"], scheduled_unix, image_url)
                post["status"] = "scheduled"
                post["facebook_post_id"] = fb_result.get("id", "")
                save_posts(data)
                print(f"[FB OK]  {fb_result}")
            except Exception as e:
                print(f"[FB ERR] {e}")

        # Instagram
        if not ig_done:
            try:
                ig_result = schedule_instagram(ig_id, token, post, data, scheduled_unix)
                if ig_result.get("skipped"):
                    print(f"[IG SKIP] {ig_result['reason']}")
                else:
                    print(f"[IG OK]  {ig_result}")
            except Exception as e:
                post["instagram_status"] = "ig_failed"
                save_posts(data)
                print(f"[IG ERR] {e}")
                print(f"[IG ERR] Post marked ig_failed — reset instagram_status to 'pending' in posts.json to retry")

    print(f"\n{'='*60}")
    if not args.publish:
        print("Dry run complete. Run with --publish to schedule for real.")
    else:
        print("Done. Check Meta Business Suite to confirm scheduled posts.")


if __name__ == "__main__":
    main()
