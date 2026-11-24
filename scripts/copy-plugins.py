#!/usr/bin/env python3
"""Fill the APK's built-in plugins from the plugins repo. Every plugin lives in promptpipe-plugins
(one source); the ones its index.json marks "builtin": true ship with the app. Run before every
APK build (build-local.sh and plugin-bundle.sh do it):

    python3 scripts/copy-plugins.py          PP_PLUGINS=<folder> for another checkout

app/src/main/assets/plugins/ is made fresh each time and is not in git: never edit it, edit the
plugins repo. app/src/main/assets/plugins-revision.txt says which commit of it the APK carries.
"""
import json, os, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.environ.get("PP_PLUGINS") or os.path.join(os.path.dirname(ROOT), "promptpipe-plugins")
OUT = os.path.join(ROOT, "app", "src", "main", "assets", "plugins")

def main():
    index = os.path.join(REPO, "index.json")
    if not os.path.isfile(index):
        sys.exit(f"No plugins repo at {REPO} (index.json not found). Clone promptpipe-plugins next to this repo, or set PP_PLUGINS.")
    entries = [e for e in json.load(open(index))["plugins"] if e.get("builtin")]
    if not entries:
        sys.exit("The plugins repo marks no plugin as builtin.")
    shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(OUT)
    for e in entries:
        src = os.path.join(REPO, e["path"].rstrip("/"))
        if not os.path.isfile(os.path.join(src, "plugin.json")):
            sys.exit(f"{e['id']}: no plugin.json in {src}")
        shutil.copytree(src, os.path.join(OUT, e["id"]))
    try:
        rev = subprocess.run(["git", "-C", REPO, "rev-parse", "--short", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
        dirty = subprocess.run(["git", "-C", REPO, "status", "--porcelain"], capture_output=True, text=True).stdout.strip()
        rev += " (with uncommitted changes)" if dirty else ""
    except Exception:
        rev = "unknown"
    open(os.path.join(ROOT, "app", "src", "main", "assets", "plugins-revision.txt"), "w").write(rev + "\n")
    print(f"built-in plugins: {len(entries)} from promptpipe-plugins {rev}")

main()
