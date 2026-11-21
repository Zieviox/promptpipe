---
name: remake
description: The staged, supervised process for a full remake of promptpipe (or a large part of it) - assess, principles, requirements, terms, strategies, architecture and line budget, standards review, function list, UX/UI reference, then build layer by layer - where only the intent and the UX/UI survive and every stage stops for the user's approval. Use when asked to refactor, rewrite, remake or redesign the app or a layer of it, or to continue the remake in design/.
---

# Full remake

A remake rebuilds the app from its intent. **Only the intent (what it's for) and the UX/UI
(what the user sees and does) survive.** Code, structure, internal formats, the plugin format and
names are all new. Editing old code is not a remake: it carries the old slips along.

The design lives in `design/` (numbered files, one per stage). The current state of this remake:
read `design/` in order before doing anything; the last file says which stage is next and what is
still open.

## Rules for every stage

- **The user supervises every stage.** A stage ends with its document committed, a short summary,
  and the open decisions as questions (recommended answer first). Never start the next stage
  until the user approves; if the user interrupts with a new instruction, write it into the
  design first (principles or requirements, with the date and their words), then continue.
- **Record every decision** where it belongs, with the date: `Decided (YYYY-MM-DD): …`.
- **Standard terms only**: the glossary in PLUGINS.md and standard programming terms; no invented
  words. `scripts/terms-check.py` stays at 0 (a retired word it flags is reworded, not exempted).
- **No reuse of old code unless stuck**, and then say so in the stage's review (what, from where,
  why). The old code is a read-only reference for behaviour and lessons.
- **Honest numbers**: estimates come with a range; a target that isn't reachable is said, not
  hidden. Size comes from structure, never from packing lines or cutting features.
- **Research before deciding**: look up the standard practice (and cite it) before proposing
  something non-trivial; check facts that decide a design (engine support, library behaviour,
  language API at the compiler release in use: `sh scripts/odin-reference.sh`).
- Push to the session's branch after each stage; the new code goes on a fresh, empty branch
  (`rewrite`) in both repos once building starts.

## The stages

| # | Stage | Output | Checked by |
|---|---|---|---|
| 0 | **Assess**: duplicates (the clone-detection skill), lines of code per layer (`scripts/sloc.py`), every feature in use | `notes/duplicates-*.md`, numbers in the next files | — |
| 1 | **Principles**: DRY, KISS, YAGNI (and their order when they conflict), functional core and imperative shell, stateless functions over plain data (DOD), adapters for libraries and platforms, events outside the main sequence and hooks inside it, errors as data, noun-first names, what survives the remake | `design/1-principles.md` | user |
| 2 | **Requirements**: every feature and constraint with an id and its source (user decision with date, bug number, current feature); what is not built now (YAGNI); the main sequences | `design/2-requirements.md` | user |
| 3 | **Terms**: the layers, naming rules (casing, noun_verb, records, constants, events, hooks, routes), the closed verb list, the nouns, the adapters, the screen words that change | `design/3-terms.md` | user, terms-check |
| 4 | **Strategies**: structural ways to need less code for the same features, each with its standard name, what it replaces, an estimate and its cost; where the code is today | `design/4-strategies.md` | user |
| 5 | **Architecture and line budget**: the shape and channels, what the strategies change, data ownership (one owner, record type, store and writer per type of data), the main sequences as call chains with events, the calls each side offers, a line budget per layer and module | `design/5-architecture.md` | user |
| 6 | **Standards and review**: naming and code standards for each language in the style chosen (look them up: the language's own conventions, SemVer for versions, event naming, API naming), then a KISS and DRY pass over the whole design; fix the design, list what changed | `design/6-review.md` | user, clone-detection on the design's function names |
| 7 | **Function list**: every function per layer and module with its job, inputs and outputs, pure or effect, and its line estimate; the totals fit the budget; every requirement id maps to functions | `design/7-functions.md` | user, budget sums, requirement coverage |
| 8 | **UX/UI reference**: screenshots of every screen and state of the old app (stand-in and phone), the gestures and wording; this is the visual spec | `design/ux/` | user |
| 9 | **Build**, one layer per stage on the `rewrite` branch: core → platform → loader → page script → runtime → screen → optional plugins. Each stage: write the code fresh from the function list, compile and test (`odin check`/tests for the core), size against the budget (`scripts/sloc.py`), terms-check, clone-detection, screenshots against stage 8 | code + a short stage note | user, all checks |
| 10 | **Parity and switch**: every requirement checked on the phone; the old code removed in one change; guides and READMEs rewritten | release notes | user |

A layer that goes over its budget goes back to stage 5 or 7 as a design problem.

## Counting lines

```sh
python3 .claude/skills/remake/scripts/sloc.py - <<'EOF'
core      core
platform  app/src/main/java
loader    app/src/main/assets/ui
EOF
```

Lines of code: blank lines and comments not counted; files formatted at the agreed width (100
characters) before counting; `vendor/` (libraries) not counted.
