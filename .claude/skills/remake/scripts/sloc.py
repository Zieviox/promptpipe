#!/usr/bin/env python3
"""Lines of code per group: blank lines and comments are not counted (the usual SLOC count).

    python3 sloc.py GROUPS_FILE        each line: <group name> <path> [<path> ...]
    python3 sloc.py - < GROUPS_FILE

Paths are files or folders (searched recursively); node_modules, vendor and .git are skipped,
and so are tests (test_*.*, *_test.*, *.test.js).
Counts .js .odin .kt .css .c .html .py .sh.
"""
import os, sys

EXT = (".js", ".odin", ".kt", ".css", ".c", ".html", ".py", ".sh")
SKIP = ("node_modules", "vendor", "/.git")
SLASH_COMMENTS = (".js", ".odin", ".kt", ".c", ".css")
HASH_COMMENTS = (".py", ".sh")


def count(path):
    ext = os.path.splitext(path)[1]
    n, in_block = 0, False
    for line in open(path, errors="ignore"):
        s = line.strip()
        if in_block:
            in_block = "*/" not in s
            continue
        if not s:
            continue
        if ext in SLASH_COMMENTS and s.startswith("/*"):
            in_block = "*/" not in s
            continue
        if ext in SLASH_COMMENTS and s.startswith("//"):
            continue
        if ext in HASH_COMMENTS and s.startswith("#"):
            continue
        n += 1
    return n


def files(path):
    if os.path.isfile(path):
        yield path
        return
    for d, _, names in os.walk(path):
        if any(s in d for s in SKIP):
            continue
        for f in names:
            if f.endswith(EXT) and not (f.startswith("test_") or "_test." in f or f.endswith(".test.js")):
                yield os.path.join(d, f)


def main():
    src = sys.stdin if len(sys.argv) < 2 or sys.argv[1] == "-" else open(sys.argv[1])
    total = 0
    for line in src:
        parts = line.split()
        if not parts or parts[0].startswith("#"):
            continue
        name, paths = parts[0], parts[1:]
        n = sum(count(f) for p in paths for f in files(p))
        total += n
        print(f"{n:6}  {name}")
    print(f"{total:6}  total")


main()
