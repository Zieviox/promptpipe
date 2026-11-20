#!/usr/bin/env python3
"""Prints a jscpd JSON report as totals per format, then every clone, largest first."""
import json, sys

d = json.load(open(sys.argv[1]))
t = d["statistics"]["total"]
print(f"total {t['lines']} lines, {t['duplicatedLines']} duplicated ({t['percentage']:.2f}%), {t['clones']} clones")
for fmt, v in sorted(d["statistics"]["formats"].items()):
    s = v["total"]
    print(f"  {fmt}: {s['lines']} lines, {s['clones']} clones, {s['percentage']:.2f}%")
for c in sorted(d["duplicates"], key=lambda c: -c["lines"]):
    a, b = c["firstFile"], c["secondFile"]
    print(f"{c['lines']:4} lines  {a['name']}:{a['start']}-{a['end']}  ==  {b['name']}:{b['start']}-{b['end']}")
