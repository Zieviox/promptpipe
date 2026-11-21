#!/usr/bin/env python3
"""Fill the APK's built-in plugins from the promptpipe-plugins checkout next to this one (one
source, P4): every plugin its catalogue marks "built_in". PP_PLUGINS=<folder> for another one.
app/src/main/assets/plugins/ is made fresh each time and isn't in git."""
import json, os, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.environ.get("PP_PLUGINS") or os.path.join(os.path.dirname(ROOT), "promptpipe-plugins")
OUT = os.path.join(ROOT, "app", "src", "main", "assets", "plugins")

catalogue = os.path.join(REPO, "catalogue.json")
if not os.path.isfile(catalogue):
    sys.exit(f"No catalogue.json in {REPO}: clone promptpipe-plugins next to this repo, or set PP_PLUGINS.")
entries = [e for e in json.load(open(catalogue))["entries"] if e.get("built_in")]
shutil.rmtree(OUT, ignore_errors=True)
for e in entries:
    shutil.copytree(os.path.join(REPO, e["path"]), os.path.join(OUT, e["id"]))
print(f"built-in plugins: {len(entries)}")
