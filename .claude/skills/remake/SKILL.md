---
name: remake
description: The staged, supervised, inside-out process for a full remake of promptpipe (or a large part of it) - intent and UX/UI, principles, requirements, the application's model, ports, strategies, adapters and line budget, standards review, function list, then build layer by layer - where only the intent and the UX/UI survive and every stage stops for the user's approval. Use when asked to refactor, rewrite, remake or redesign the app or a layer of it, or to continue the remake in design/.
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
- **Keep existing features**: a new instruction changes only what it names; it never removes a
  feature by implication. When it seems to conflict with one, ask before changing it.
- **Standard terms only**: the glossary in PLUGINS.md and standard programming terms; no invented
  words. `scripts/terms-check.py` stays at 0 (a retired word it flags is reworded, not exempted).
- **Design from the requirements, not from the code**: the design stages use only `design/`
  (intent, requirements, screenshots). The old code may be read to find functionality and layout
  (U 2026-11-21), never to reuse its code or names; what it shows goes into the requirements first.
- **Refine, don't bolt on** (U 2026-11-21): a gap is closed by extending what exists (a
  requirement's text, a field, a call's parameters, an id), not by adding something new beside it;
  something new only when refining would be counterproductive, and the review says why.
- **Reuse first**: before adding a record, field, call, event, type, file, mechanism or setting,
  look for what already exists and use it; add only when using it would be counterproductive,
  decided by the standards in `design/1-principles.md` ("Reuse first"), and say which one decided.
  Names too, in this order: the design's terms and recorded decisions, then the standard term; the
  screenshots' labels only where the design has no term (they are the reference for look and
  behaviour, not for words); a new name only when none fits.
- **Self-review before every hand-off**: everything traces to a use case or requirement; nothing
  is stored twice (no links in both directions, no derived value saved); one mechanism per job;
  every name is the design's term (or the standard's, or new and added to the terms);
  every name follows the rules (`python3 .claude/skills/remake/scripts/name-check.py` for the
  call contract, terms-check for retired words); when a stage touches the use cases, the model or
  the calls, every screen state in `design/ux/` is gone through and each element and action traced
  to a use case, a call or a record (missing states are captured with `scripts/ux/capture.js`).
  Fix what it finds before the user sees it.
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

Inside-out (Ports and Adapters): first what survives and what the app needs, then the wrappers
that provide exactly that. Never start from the layers or the libraries.

| # | Stage | Output | Checked by |
|---|---|---|---|
| 0 | **Intent and UX/UI**: what the app is for; the actors outside it (who drives it, what it drives); every use case (goal, trigger, result); screenshots of every screen and state of the old app (`node scripts/ux/capture.js`), the gestures, keys and wording | `design/0-intent.md`, `design/ux/` | user |
| 1 | **Principles**: DRY, KISS, YAGNI (and their order), functional core and imperative shell, stateless functions over plain data (DOD), Ports and Adapters, the dependency rule, role interfaces, the anti-corruption layer, events outside the main sequence and hooks inside it, errors as data, noun-first names, what survives | `design/1-principles.md` | user |
| 2 | **Requirements**: the use cases plus the constraints (security, platforms, size, checks), each with an id and its source; what is not built now (YAGNI) | `design/2-requirements.md` | user |
| 3 | **The application's model**: its records (data shapes, one owner each) and its words (layers, naming rules, verbs, nouns, events) | `design/3-terms.md` | user, terms-check |
| 4 | **The port and the calls**: one port each way (a message protocol); one table of calls (name, data and answer with their fields, types and units, events, who answers, who may call), grouped by who answers; the events; coverage of every use case | `design/4-ports.md` | user, `scripts/name-check.py`, every use case covered |
| 5 | **Strategies**: structural ways to need less code for the same features (standard names, what each replaces, estimate, cost), checked against the ports | `design/5-strategies.md` | user |
| 6 | **Adapters, layers, line budget**: each port mapped to the technology that provides it (a translator that only translates; library features no port needs are not wrapped), the layers and channels, data ownership, the main sequences as call chains with events, the budget in three lines per layer: application, ports, adapters | `design/6-architecture.md` | user |
| 7 | **Standards and review**: naming and code standards for each language in the style chosen (look them up), then a KISS and DRY pass over the whole design; fix the design, list what changed | `design/7-review.md` | user, clone-detection on the design's function names |
| 8 | **Function list**: every function per layer and module with its job, inputs and outputs, pure or effect, its port, and its line estimate; the totals fit the budget; every use case and requirement maps to functions | `design/8-functions.md` | user, budget sums, coverage |
| 9 | **Build**, one layer per stage on the `rewrite` branch: application first (pure, tested without a phone), then the adapters: core → platform → loader → page script → screen → optional plugins. Each stage: written fresh from the function list, compiled and tested (`odin check` and tests for the core), sized against the budget (`scripts/sloc.py`), terms-check, clone-detection, the contract check (below), and for the screen the parity walk (below) | code + a short stage note | user, all checks |
| 9b | **First run on the phone**, its own stage, before parity: the user builds and installs; a checklist of what to look at (starts, the old data imported, the site view shows a page, a real send); every failure becomes a fix with its cause written down | a run report in the build note | user, on the phone |
| 10 | **Parity and switch**: every use case and requirement checked on the phone against stage 0's screenshots and `2b-behaviour.md`; the old code removed in one change; `design/`, the skills and the checks moved onto the new branch; guides and READMEs rewritten | release notes | user |

A layer that goes over its budget goes back to stage 6 or 8 as a design problem.

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

## Lessons from the first remake (2026-11)

The first remake built every layer and passed every test here, then on the phone: the APK
wouldn't install (the phone was full), crashed at start (a GeckoView threading rule), showed a
watered-down screen, didn't show the site's page, and didn't bring in the old chats. Each lesson
below is a rule from then on.

- **Every message between layers has its shape in the contract.** The screen sent the site view's
  place as pixels (`top`, `left`, `width`, `height`), the platform read fractions (`l`, `t`, `r`,
  `b`): both sides were "right" against a contract that said only "the site view's region". In
  stage 4 every call's data and answer name their fields, types and units; in stage 9 each side is
  written from that table, and a check compares the keys the sender writes with the keys the
  receiver reads (for Kotlin, which can't run here, by reading it: `optString("…")`/`put("…")`
  against the table).
- **The screen is built screen by screen against stage 0.** "Watered down" means the screen was
  written from the requirements' summary instead of from the old screens. For each screen and
  state in `design/ux/` and `2b-behaviour.md`: list every element, label, gesture and state of the
  old one, build it, take the same screenshot of the new one in Chromium (same size, same stand-in
  data), put them side by side for the user, and tick the list. Budget the screen from that list,
  not from the use cases.
- **The old data is imported from real files.** Fixtures written by hand pass tests and miss the
  real shapes. Make the fixtures with the old app's own writers (its code, run on sample data), or
  ask the user for a few real files (with private text replaced), and test the import on the phone
  in 9b. An import reports what it found and what it skipped, on screen, not only in a toast.
- **Nothing is pinned that wasn't checked.** A version written from memory (GeckoView's) didn't
  exist. Every dependency, tool and version is looked up (the registry, the old build that worked)
  before it goes in; when the old build had a working way (the cached GeckoView), reuse it and say
  so.
- **The platform layer can't run here, so it gets a crash record from its first line**
  (`Download/promptpipe-crash.txt`: Termux can't read another app's log) and its known traps are
  checked by reading (the contribution skill lists them: GeckoView callbacks on the main thread
  never wait; `in` on a `ConcurrentHashMap` checks values; `java` in a Gradle script is Gradle's).
- **Say what has never run.** A hand-off lists what was tested where (here, in Chromium, on the
  phone) and what has never run at all; a layer that has never run is not "built", it is "written".
- **Work within the user's phone.** Builds happen in Termux + proot Arch on the phone, with little
  free space and a slow connection: never suggest deleting downloads, caches that would be
  downloaded again, or old builds; diagnose with read-only commands first (`du`, `ncdu`); give one
  copy-paste block per step; the version code always goes up; `app/build` can be removed before
  installing, it's rebuilt offline.
- **The checks travel with the code.** The terms check, the name check and the skills lived on the
  design branch, not the new one; carry them over when building starts (`scripts/`, `.claude/`).

