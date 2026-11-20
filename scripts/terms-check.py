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
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLUGINS = os.environ.get("PP_PLUGINS") or os.path.join(os.path.dirname(ROOT), "promptpipe-plugins")
EXT = (".js", ".json", ".md", ".py", ".css", ".odin", ".kt", ".sh", ".html")
SKIP_DIRS = {".git", "build", "node_modules", "notes", "docs", ".gradle"}
SKIP_FILES = {"BUGS.md", "terms-check.py"}

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
    ("tool", r'(?i)\btools?\b(?! *\()|"tool"', r"(?i)tools/hash|hash\.py|build-tools|toolchain|tooltip|devtools"),
    ("site view tab", r"(?i)svtab|newTab\b|closeTab\b|pickTab\b|new tab\b|close tab\b|tab closed|tab is chosen|choosing a tab", None),
    ("system prompt plugin", r'system-prompt\b|"System prompts"|openLibrary\(ctx', None),
]

def files():
    for base in (ROOT, PLUGINS):
        for d, dirs, fs in os.walk(base):
            dirs[:] = [x for x in dirs if x not in SKIP_DIRS]
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
    sys.exit(1 if total else 0)

main()
