#!/usr/bin/env python3
"""Write "sha256" for every plugin in index.json. Run it before you commit a plugin change:

    cd /root/promptpipe-plugins && python3 tools/hash.py

The app checks the hash when it installs a plugin and refuses files that don't match.
A plugin's hash covers plugin.json and every file it lists (main, siteScript, css, scripts, files):
sha256 of "<path>\\n<sha256 of the file>\\n" for each file, sorted by path. It matches the core's check.
"""
import hashlib, json, os, sys

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def sha(b):
    return hashlib.sha256(b).hexdigest()

def listed(m):
    names = []
    for k in ("main", "siteScript", "css"):
        v = m.get(k)
        if isinstance(v, str) and v:
            names.append(v)
    for k in ("css", "scripts", "files"):
        v = m.get(k)
        if isinstance(v, list):
            names += [x for x in v if isinstance(x, str)]
    return names

def folder_hash(path):
    base = os.path.join(root, path)
    raw = open(os.path.join(base, "plugin.json"), "rb").read()
    files = {"plugin.json": raw}
    for n in listed(json.loads(raw)):
        if n.startswith("/") or ".." in n.split("/"):
            continue
        files[n] = open(os.path.join(base, n), "rb").read()
    text = "".join(f"{p}\n{sha(files[p])}\n" for p in sorted(files))
    return sha(text.encode())

def main():
    ip = os.path.join(root, "index.json")
    idx = json.load(open(ip))
    changed = 0
    for e in idx["plugins"]:
        h = folder_hash(e["path"].rstrip("/"))
        if e.get("sha256") != h:
            e["sha256"] = h
            changed += 1
        # the version in index.json must match the plugin's own
        v = json.load(open(os.path.join(root, e["path"], "plugin.json"))).get("version")
        if v != e.get("version"):
            print(f"warning: {e['id']} is {v} in plugin.json but {e.get('version')} in index.json")
    json.dump(idx, open(ip, "w"), indent=2, ensure_ascii=False)
    open(ip, "a").write("\n")
    print(f"{len(idx['plugins'])} plugins, {changed} hashes updated")

main()
