---
name: clone-detection
description: Find duplicate code (code clones) across promptpipe and promptpipe-plugins with the standard detection techniques - token-based (jscpd), token-bag Type 3 (SourcererCC style) and a responsibility inventory for Type 4 and cross-language duplicates - then report them sorted into merge / leave / pick an owner. Use when asked to look for duplicates, copy-paste, redundant code or "the same thing done twice", before a cleanup or refactor, or as a check before merging to main.
---

# Clone detection

Read-only on both repos. Finds duplicates; it does not merge them. Merging is a separate, agreed task.

## Terms (standard, Roy, Cordy & Koschke 2009)

- **Type 1**: identical code apart from whitespace, layout and comments.
- **Type 2**: the same structure with renamed identifiers or changed literals.
- **Type 3**: Type 2 plus added or removed statements ("near-miss").
- **Type 4**: different code doing the same job. No detector finds these reliably; a person does.

The weakness is CWE-1041 "Use of Redundant Code" (CISQ maintainability). The risk: one copy gets a fix and the other doesn't. The remedy: one function, called everywhere.

## Where to look

From the app repo root, with the plugins checkout next to it (`PP_PLUGINS=<folder>` for another one):

- `core/` (Odin), `app/src/main/java/` (Kotlin), `app/src/main/assets/ui/` (core.js), `app/src/main/assets/ppext/` (the page script), `scripts/`
- all of `promptpipe-plugins/`

Skip `app/src/main/assets/plugins/`: copy-plugins.py generates it from the plugins repo, so every file in it would show up as a clone.

## Passes 1 and 2: automatic

```sh
sh .claude/skills/clone-detection/scripts/run.sh <out-folder>
```

The script installs jscpd into `<out-folder>/jscpd-install`, never into a repo, and never on the user's phone. Use the session's scratchpad as `<out-folder>`. It writes:

- `1-jscpd.txt`: **token-based** (jscpd, Rabin-Karp over tokens). Exact token runs: Type 1, and Type 2 only without renaming. Minimum 30 tokens and 3 lines (the default 50 misses a lot, because this code is written in long, dense lines). Odin is read as Go. `--formats-exts` replaces jscpd's defaults, so every format is listed in the script.
- `2-tokenbag.txt`: **token-bag**, `scripts/tokenbag.py`. Each function is a bag of tokens; a pair with overlap ≥ 0.70 is a candidate (Type 3). Pairs where one function contains the other are dropped.
- `2-tokenbag-normalized.txt`: the same with names, strings and numbers replaced, at ≥ 0.85 (Type 2–3). **Mostly noise** on screen code built from `h(...)` calls. Read only the large pairs (≥ 300 tokens), and expect most of them to be false positives.

Every candidate is only a candidate. Open both places and read them before you report anything.

## Pass 3: responsibility inventory (Type 4 and cross-language)

For each job in [jobs.md](jobs.md), search every layer for the code that typically does it (the patterns are listed there), and note each place that does the job. Look especially for:

- one job done in two layers (Odin and Kotlin reading the same file; core.js and a plugin both building the same thing);
- a provider's content script rewriting a helper the page script already has, or should expose (the `helpers` object in `ppext/content.js`);
- two copies that already **disagree** (different limits, different rules for the same input). These go to the top of the report.

Add a job to jobs.md when a run finds a new one.

## Then: sort and report

Sort every confirmed finding into one of three groups:

- **Merge**: a real duplicate (the same knowledge). Rank by risk: copies that disagree first, then security-related ones (paths, keys, installs), then the rest.
- **Leave**: looks alike, different jobs (alike by design, a common idiom, same name with a different meaning, a test double). Check [accepted.md](accepted.md) first; don't report those again unless they changed.
- **Pick an owner**: the same job in different layers or languages. Recommend which layer owns it.

Report per finding: the job, every place (`path:line`), why it matters, and the proposed single home (for example `PP.openDoc(url, title)` in core.js). Start with the numbers: lines scanned, jscpd's duplicated-lines percentage per format, and the candidate counts. Also list side finds (bugs or old terms noticed on the way). Use the terms from the glossary in PLUGINS.md and standard programming terms; don't invent words.

Don't change code. When the user agrees on the merges, update accepted.md with the new "Leave" items.

## Judgement rules

- **DRY** is about one source for each item of knowledge, not identical text. Two functions that look alike but would change for different reasons stay separate.
- **Rule of Three**: two small copies can wait; merge on the third, or sooner if they already disagree or the code is security-related.
- Merging across plugins: core plugins share one global scope (a top-level name clash crashes the app), so a shared helper goes in core.js under `PP`, or in the page script's `helpers` for content scripts. Never as a bare top-level name in a plugin.
