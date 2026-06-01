#!/usr/bin/env python3
"""
Reads VS Code's per-workspace SQLite state to extract currently open editor tabs.
Uses lsof to find only workspaces VS Code actually has open right now (not stale backups).
Outputs JSON array: [{"filePath": "/abs/path/file.py", "label": "file.py"}, ...]
"""
import os, json, sqlite3, sys, subprocess, re

home = os.path.expanduser("~")
ws_root = os.path.join(home, "Library/Application Support/Code/User/workspaceStorage")

# Use lsof to find workspace hashes VS Code currently has open
# This avoids stale backupWorkspaces entries from previously closed windows
try:
    lsof_out = subprocess.run(
        ["lsof", "-c", "Code", "-F", "n"],
        capture_output=True, text=True, timeout=4
    ).stdout
    open_hashes = set(re.findall(
        r'workspaceStorage/([a-f0-9]{32})/state\.vscdb\b', lsof_out
    ))
except Exception:
    open_hashes = set()

def extract_files_from_node(node):
    """Walk the serializedGrid tree and collect open file paths in MRU order."""
    files = []
    if node.get("type") == "leaf":
        data = node.get("data", {})
        editors = data.get("editors", [])
        mru = data.get("mru", list(range(len(editors))))
        # Sort by MRU position (most recently active first)
        indexed = list(enumerate(editors))
        indexed.sort(key=lambda x: mru.index(x[0]) if x[0] in mru else len(mru))
        for _, editor in indexed:
            try:
                val = json.loads(editor.get("value", "{}"))
                resource = val.get("resourceJSON") or val.get("resource") or {}
                path = resource.get("fsPath")
                if path and path.startswith("/"):
                    files.append(path)
            except Exception:
                pass
    elif node.get("type") == "branch":
        for child in node.get("data", []):
            files.extend(extract_files_from_node(child))
    return files

results = []
seen = set()

for hash_dir in open_hashes:
    db_path = os.path.join(ws_root, hash_dir, "state.vscdb")
    if not os.path.exists(db_path):
        continue

    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        row = conn.execute(
            "SELECT value FROM ItemTable WHERE key='memento/workbench.parts.editor'"
        ).fetchone()
        conn.close()
        if not row:
            continue

        editor_state = json.loads(row[0])
        root = editor_state.get("editorpart.state", {}).get("serializedGrid", {}).get("root", {})
        for path in extract_files_from_node(root):
            if path not in seen:
                seen.add(path)
                results.append({"filePath": path, "label": os.path.basename(path)})
    except Exception:
        pass

print(json.dumps(results))
