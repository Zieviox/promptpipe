#!/usr/bin/env python3
"""Finds old words that the rename of 2026-11-20 replaced, so the vocabulary stays one set.

    python3 scripts/terms-check.py            counts per word and file (exit 1 if any)
    python3 scripts/terms-check.py --list     every line found

Looks at both repos (this one and ../promptpipe-plugins, or PP_PLUGINS): code, plugin files,
guides and READMEs. Not BUGS.md or notes/ (history), not the website (docs/).

The words (see README "Words" for the full table):
  plugin types        "kind" -> "tags": provider, theme, passive, core, driver
  a provider plugin   "AI site" / "site plugin" / manifest "site" -> provider ("site" stays the website)
  its in-page script  siteScript -> contentScript
  a profile's lines   row / piece / step / pipe -> block (types prompt, plugin, message)
  starters            preset -> template
  a plugin's on/off   block (old meaning) / pill / switch -> toggle
  the site's settings switches -> options
  the app's modules   App part -> core plugin;  Message plugin / Tool -> plugin / passive
  background pages    site view tabs -> pages
  saved prompts       the System prompt plugin -> the prompt library (linked prompt blocks)
Lines that mention "legacy" are migration code reading old saved data, and may use old names.

Then the names against the list itself (design/3-terms.md, beside the code): every function's
verb is in the closed verb list and its other words are in the list; events are the seven; setting
keys and saved Turn fields are in the list; the port contract's calls likewise (as name-check.py).
Names waiting for a decision are in design/terms-pending.md: reported, not failed. Anything else
fails, so a new name that breaks the list can't come in.
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLUGINS = os.environ.get("PP_PLUGINS") or os.path.join(os.path.dirname(ROOT), "promptpipe-plugins")
EXT = (".js", ".json", ".md", ".py", ".css", ".odin", ".kt", ".sh", ".html")
SKIP_DIRS = {".git", "build", "node_modules", "notes", "docs", ".gradle", "vendor", "design"}  # design/ records the old words on purpose (the name pass); vendor/ is others' code
SKIP_PATHS = {os.path.join("app", "src", "main", "assets", "plugins")}  # made by copy-plugins.py from the plugins repo
SKIP_FILES = {"BUGS.md", "terms-check.py", "migration-check.js"}  # the migration check holds old saved data on purpose

# (name, pattern, allowed-line pattern or None[, files where this word means something else]).
# Case-sensitive unless (?i).
WORDS = [
    ("kind", r'"kind"|\.kind\b|\bkind:|KIND_|kindOf', None, r"\.kt$|\.odin$|test_core\.py$"),
    ("siteScript", r"siteScript|site script", None),
    ("site plugin", r"(?i)\bsite plugins?\b|\bAI sites?\b|isSite\b|siteFor\b|siteIdOf\b|setChatSite\b|sitePlugin\b|manifest\.site\b|\bsite\.(switches|input|reply|stop|thinking|chatLinks|strip)\b", None),
    ("switches", r"(?i)\bswitches\b|setSwitch|switchEl|switchOn\b|chatSwitches|setChatSwitch|clearChatSwitches|switchBtn|\.sw\b|\bsw\.", r'role[=:] ?"switch"|"sw"|\.sw\b \{|class: "sw'),
    ("toggle as block", r'renderBlock|blockFor\b|blockEntries|topBlocks|manifest\.block\b|"block":|\bblock\.place|block under the message box|on a block\b|where its block goes', None),
    ("pill", r"ctx\.pill|\bpill\(|pill-main|pill-gear", None),
    ("piece", r"(?i)\bpieces?\b|partRow|pluginPieces", None),
    ("step", r'(?i)\bsteps?\b|isStep|stepOn|setStepOn|pipeSteps|isPipeStep', r"(?i)tour|guide|skip step|step \$|steps each|quick steps|storage|step by step|which step|of 3|\bstep\(b|steps\":|walkthrough|r\.steps|x\.ok|step: \"|human check|one more step", r"tour\.js$|store\.odin$|qwen-chat/content\.js$|build-local\.sh$"),
    ("preset", r"(?i)\bpresets?\b|presetOf|STARTERS", None),
    ("pipe", r"(?i:\bpipeline\b)|\.pipe\b|\bpipe\.|core-pipeline|pipe-preview", None),
    ("row", r"(?i)(?<!\.\.)\.rows\b|add a row|(profile|plugin|prompt|preset)('s)? rows?\b|\brows? (on or off|above it)|switch rows|\b(its|this|the plugin's|a) row\b(?! of)|where (its|the) row", r"(?i)\bsheet\b|chats list|r\.steps|grid", r"drawer\.js$|chat-sheet\.js$"),
    ("app part", r"(?i)\bapp parts?\b|isPart\b|appParts|\bS\.parts\b|\bpart:|\"part\"|thinking\" part|\bui\.part\b", None),
    ("message plugin", r"(?i)\bmessage plugins?\b", None),
    ("tool", r'(?i)\btools?\b(?! *\()|"tool"', r"(?i)tools/hash|hash\.py|build-tools|toolchain|tooltip|devtools|own tools", r"qwen-chat/content\.js$"),
    ("site view tab", r"(?i)svtab|newTab\b|closeTab\b|pickTab\b|new tab\b|close tab\b|tab closed|tab is chosen|choosing a tab", None),
    ("system prompt plugin", r'system-prompt\b|openLibrary\(ctx', None),
]

def files():
    for base in (ROOT, PLUGINS):
        for d, dirs, fs in os.walk(base):
            # docs/ at a repo's top is the website (not checked); app/.../docs holds the guides (checked)
            dirs[:] = [x for x in dirs if (x not in SKIP_DIRS or (x == "docs" and d != base)) and os.path.relpath(os.path.join(d, x), base) not in SKIP_PATHS]
            for f in fs:
                if f.endswith(EXT) and f not in SKIP_FILES:
                    yield os.path.join(d, f)

def main():
    show = "--list" in sys.argv
    found = {}
    for path in files():
        rel = os.path.relpath(path, os.path.dirname(ROOT))
        try:
            lines = open(path, encoding="utf-8").read().split("\n")
        except Exception:
            continue
        for n, line in enumerate(lines, 1):
            if re.search(r"(?i)legacy", line):
                continue
            for name, pat, allow, *skip in WORDS:
                if skip and re.search(skip[0], rel):
                    continue
                if re.search(pat, line) and not (allow and re.search(allow, line)):
                    found.setdefault(name, []).append((rel, n, line.strip()[:160]))
    total = 0
    for name, *_ in WORDS:
        hits = found.get(name, [])
        total += len(hits)
        if not hits:
            continue
        by_file = {}
        for rel, n, line in hits:
            by_file.setdefault(rel, []).append((n, line))
        print(f"{name}: {len(hits)}")
        for rel, items in sorted(by_file.items()):
            print(f"  {rel}: {len(items)}")
            if show:
                for n, line in items:
                    print(f"    {n}: {line}")
    print(f"\n{total} old words left")
    broken = names_check(show)
    sys.exit(1 if total or broken else 0)

# ---------- the names against the list (design/3-terms.md) ----------

DEFS = [re.compile(r"^(?:export\s+)?(?:const|let)\s+([a-z][a-z0-9_]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-z_]+)\s*=>"),
        re.compile(r"^(?:async\s+)?function\s+([a-z][a-z0-9_]*)\s*\("),
        re.compile(r"^\s*(?:private\s+|internal\s+|override\s+)*fun\s+([a-z][a-z0-9_]*)\s*\("),
        re.compile(r"^([a-z][a-z0-9_]*)\s*::\s*proc")]

def names_check(show):
    design = os.path.join(ROOT, "design")
    terms = open(os.path.join(design, "3-terms.md"), encoding="utf-8").read()
    pending_path = os.path.join(design, "terms-pending.md")
    pending = set(re.findall(r"`([a-z][a-z0-9_.]*)`", open(pending_path, encoding="utf-8").read())) if os.path.exists(pending_path) else set()
    table = terms[terms.index("### Verbs"):terms.index("Not used, to keep")]
    verbs = set(re.findall(r"`([a-z]+)`", table.split("| Example |")[1]))
    hooks = set(re.findall(r"`([a-z_]+)`", terms[terms.index("- **Hooks**"):terms.index("- **`PP`**")]))
    events = set(re.findall(r"`([a-z]+_(?:changed|received|pressed))`", terms[terms.index("### Events"):terms.index("### Name pass")]))
    words = set()
    for name in re.findall(r"`([a-z][a-z0-9_.]*)`", terms):
        words.update(re.split(r"[_.]", name))
    words.update(w.lower() for rec in re.findall(r"\b[A-Z][a-z]+(?:_[A-Z][a-z]+)+\b|\b[A-Z][a-z]+\b", terms) for w in rec.split("_"))
    problems = []
    def where(path, n):
        return f"{os.path.relpath(path, os.path.dirname(ROOT))}:{n}"
    # function names, in both repositories (not tests, vendored libraries or built copies)
    seen = set()
    for base, exts in ((PLUGINS, (".js",)), (os.path.join(ROOT, "core"), (".odin",)), (os.path.join(ROOT, "app", "src"), (".kt", ".js"))):
        for d, dirs, fs in os.walk(base):
            dirs[:] = [x for x in dirs if x not in {".git", "node_modules", "test", "vendor", "build", "plugins"}]
            for f in fs:
                if not f.endswith(exts):
                    continue
                path = os.path.join(d, f)
                for n, line in enumerate(open(path, encoding="utf-8", errors="ignore"), 1):
                    for pat in DEFS:
                        m = pat.match(line)
                        name = m and m.group(1)
                        if not name or "_" not in name or name in seen or name in hooks | events:
                            continue
                        seen.add(name)
                        *nouns, verb = name.split("_")
                        why = []
                        if verb not in verbs:
                            why.append(f"verb '{verb}' isn't in the closed list")
                        unknown = [w for w in nouns if w not in words and w not in verbs]
                        if unknown:
                            why.append(f"{', '.join(unknown)} not in the list")
                        if why:
                            problems.append((name, where(path, n), "; ".join(why)))
                # events sent
                if f.endswith(".js"):
                    for n, line in enumerate(open(path, encoding="utf-8", errors="ignore"), 1):
                        for e in re.findall(r'event_send\("([a-z_]+)"', line):
                            if e not in events and e not in seen:
                                seen.add(e)
                                problems.append((e, where(path, n), "an event outside the seven"))
    # setting keys and saved Turn fields
    schema = json.load(open(os.path.join(PLUGINS, "runtime-records", "schemas.json"), encoding="utf-8"))
    for d in schema["settings"]:
        if f"`{d['key']}`" not in terms:
            problems.append((d["key"], "runtime-records/schemas.json", "a setting key not in the list"))
    send = open(os.path.join(PLUGINS, "runtime-send", "send.js"), encoding="utf-8").read()
    i = send.index("  const turn = {")
    for field in re.findall(r"^\s+([a-z_]+)[:,]", send[i:send.index("};", i)], re.M):
        if f"`{field}`" not in terms:
            problems.append((field, "runtime-send/send.js (turn_save)", "a saved Turn field not in the list"))
    # the port contract (as name-check.py)
    ports = open(os.path.join(design, "4-ports.md"), encoding="utf-8").read()
    for c in re.findall(r"^\| `([a-z_]+)` \|", ports[:ports.index("## The events")], re.M):
        *nouns, verb = c.split("_")
        why = [f"verb '{verb}' isn't in the closed list"] if verb not in verbs else []
        why += [f"{w} not in the list" for w in nouns if w not in words]
        if why:
            problems.append((c, "design/4-ports.md", "; ".join(why)))
    waiting = [p for p in problems if p[0] in pending]
    broken = [p for p in problems if p[0] not in pending]
    print(f"\nNames: {len(seen)} checked against design/3-terms.md")
    for title, items in (("break the list", broken), ("waiting for a decision (design/terms-pending.md)", waiting)):
        print(f"{len(items)} {title}")
        if show or title == "break the list":
            for name, at, why in sorted(items):
                print(f"  {name}  ({at}): {why}")
    return len(broken)

main()
