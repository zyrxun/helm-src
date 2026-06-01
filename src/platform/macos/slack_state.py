#!/usr/bin/env python3
"""
Reads Slack's LevelDB local storage to extract the active team ID and channel ID.
Outputs JSON: {"t": "<teamId>", "c": "<channelId>", "n": "<teamName>"}
No API token required — reads Slack's on-disk state directly.
"""
import subprocess, json, re, sys, os

home = os.path.expanduser("~")
ldb_path = os.path.join(home, "Library/Application Support/Slack/Local Storage/leveldb/000004.log")

try:
    raw = subprocess.run(["strings", ldb_path], capture_output=True, text=True).stdout
except Exception as e:
    print(json.dumps({"error": str(e)})); sys.exit(1)

blob = None
start = raw.find('{"teams":')
if start == -1:
    print(json.dumps({"error": "teams key not found"})); sys.exit(1)

# The blob is one long line in the log file
for line in raw[start:].splitlines():
    candidate = line if line.startswith("{") else raw[start : raw.find("\n", start + 100)]
    try:
        blob = json.loads(candidate)
        break
    except Exception:
        pass

# Fallback: scan all lines for lastActiveTeamId
if not blob:
    for line in raw.splitlines():
        if '"lastActiveTeamId"' in line:
            try:
                blob = json.loads(line)
                break
            except Exception:
                pass

if not blob:
    print(json.dumps({"error": "parse failed"})); sys.exit(1)

tid = blob.get("lastActiveTeamId")
team = blob.get("teams", {}).get(tid, {})
primary = team.get("lastViewState", {}).get("home", {}).get("primary", {})
cid = primary.get("id")
tname = team.get("name", "")

print(json.dumps({"t": tid, "c": cid, "n": tname}))
