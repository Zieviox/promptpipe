#!/usr/bin/env python3
"""Checks the names in the call contract against the naming rules in the terms.

    python3 .claude/skills/remake/scripts/name-check.py [design folder]

- every call (a table row starting with `| \\`name\\` |` above "## The events" in 4-ports.md) is
  noun_verb or noun_noun_verb, its verb is in the closed verb list, and each noun is a known word
  (a noun or record in 3-terms.md);
- every event (rows between "## The events" and "## Coverage") ends in a past tense.
Prints each problem; exit code 1 when there are any.
"""
import os, re, sys

design = sys.argv[1] if len(sys.argv) > 1 else "design"
terms = open(os.path.join(design, "3-terms.md")).read()
ports = open(os.path.join(design, "4-ports.md")).read()

verb_table = terms[terms.index("### Verbs"):terms.index("Not used, to keep")]
verbs = set(re.findall(r"`([a-z]+)`", verb_table.split("| Example |")[1]))
known = lambda n: f"`{n}`" in terms or n.capitalize() in terms or n in ("api", "token")

events_at = ports.index("## The events")
calls = re.findall(r"^\| `([a-z_]+)` \|", ports[:events_at], re.M)
events = re.findall(r"^\| `([a-z_]+)` \|", ports[events_at:ports.index("## Coverage")], re.M)

problems = []
for c in calls:
    *nouns, verb = c.split("_")
    if not nouns:
        problems.append(f"{c}: no noun")
    if verb not in verbs:
        problems.append(f"{c}: verb '{verb}' is not in the closed list")
    problems += [f"{c}: noun '{n}' is not in the terms" for n in nouns if not known(n)]
for e in events:
    *nouns, tense = e.split("_")
    if not tense.endswith("ed"):
        problems.append(f"{e}: an event name ends in a past tense")
    problems += [f"{e}: noun '{n}' is not in the terms" for n in nouns if not known(n)]

print(f"{len(calls)} calls, {len(events)} events checked")
for p in problems:
    print("  " + p)
sys.exit(1 if problems else 0)
