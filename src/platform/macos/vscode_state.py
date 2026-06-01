#!/usr/bin/env python3
"""
Reads VS Code's per-workspace SQLite state to extract currently open editor tabs.
Outputs JSON array: [{"filePath": "/abs/path/file.py", "label": "file.py"}, ...]
"""
import os, json, sqlite3, sys

home = os.path.expanduser("~")
storage_json = os.path.join(home, "Library/Application Support/Code/User/globalStorage/storage.json")
ws_root = os.path.join(home, "Library/Application Support/Code/User/workspaceStorage")

try:
    with open(storage_json) as f:
        global_state = json.load(f)
except Exception as e:
    print(json.dumps({"error": str(e)})); sys.exit(1)

bw = global_state.get("backupWorkspaces", {})
open_folders = [e["folderUri"] for e in bw.get("folders", []) if "folderUri" in e]

# Build folder URI → workspace hash map
uri_to_hash = {}
try:
    for entry in os.listdir(ws_root):
        ws_json = os.path.join(ws_root, entry, "workspace.json")
        if not os.path.exists(ws_json):
            continue
        try:
            with open(ws_json) as f:
                d = json.load(f)
            uri = d.get("folder") or d.get("workspace")
            if uri:
                uri_to_hash[uri] = entry
        except Exception:
            pass
except Exception:
    pass

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

for folder_uri in open_folders:
    hash_dir = uri_to_hash.get(folder_uri)
    if not hash_dir:
        continue

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
