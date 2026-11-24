---
name: contribute
description: How to change promptpipe or promptpipe-plugins after the remake - a fix, a feature, a plugin, a screen - so it fits the design (requirements, terms, ports, layers), passes the checks, and builds and runs on the user's phone. Use for any code change to either repo that isn't a full remake (that's the remake skill), including bugs found on the phone.
---

# Contributing to promptpipe

promptpipe is built from `design/` (its intent, requirements, terms, contract and architecture).
A change fits that design, or changes the design first. `design/` lives beside the code on the
`rewrite` branch (Gtex, 2026-11-24: the code had been written without it in reach); the UX
screenshots stay on the design branch (`ccr-bb40c4f5-cvvj2n`); after the switch (stage 10), on `main`.
Design changes go to `rewrite`'s `design/` only, so there's one copy. The code is in two repos side by side:
**promptpipe** (`core/` Odin, `app/src/main/java/` Kotlin, `app/src/main/assets/ui/` the loader,
`app/src/main/assets/ppext/` the page side, `scripts/`) and **promptpipe-plugins** (`runtime-*`
the application and the screen, the optional plugins, `scripts/`, `test/`).

## Before writing code

1. **Read what the change touches**, in this order: `design/0-intent.md` (what it's for),
   `design/2-requirements.md` (the ids: UC, R, S, D, …), `design/3-terms.md` (records and names),
   `design/4-ports.md` (every call and event with its data), `design/6-architecture.md` (layers,
   who owns what), the latest notes in `design/9-build.md`, and `PLUGINS.md` for plugin work.
2. **Find the requirement.** A fix restores what a requirement says; a feature adds or changes a
   requirement first (its id, the date and the user's words). Keep existing features: a change
   touches only what it names; when it seems to conflict with another feature, ask.
3. **Find the owner.** One job, one place (`.claude/skills/clone-detection/jobs.md` lists the
   jobs). Use what exists before adding: a field, a parameter, a call's option, a setting; add
   something new only when extending would be worse, and say why.
4. **For a bug found on the phone, find the cause before the fix**: the crash record
   (`Download/promptpipe-crash.txt`), the core log (`Documents/PromptPipe/logs/core.log`, or
   Settings › Advanced › Core log), a screenshot. Write the cause in the commit message.

## Where code goes

| Layer | Where | It does | It never does |
|---|---|---|---|
| Core (Odin) | `core/` | files under named roots with the change check, serving the screen and plugins, plugin hashes, the catalogue's signature, the local API | know about chats or the screen |
| Platform (Kotlin) | `app/src/main/java/` | Android: GeckoView pages, Keystore credentials, git (JGit), picker, share, clipboard, the service | hold app data or decide app behaviour |
| Loader | `app/src/main/assets/ui/loader.js` | the one route between layers, the State, plugins, hooks | contain app features |
| Page side | `app/src/main/assets/ppext/` | run in site pages only the code the app hands over | run anything from the website |
| Application | `promptpipe-plugins/runtime-*` | everything the app does (records, chats, profiles, sending, plugins, storage) and the screen | touch Android or files except through calls |
| Optional | the other plugin folders | providers, block plugins, themes | rely on another plugin's internals |

Libraries go behind an adapter (one file that translates), pinned in `vendor/` with their
licence. Inside the app: functions over plain data, no classes, no state outside the State
(components are plain functions); a library may be whatever it is behind its adapter.

## Rules for the code

- **Names**: snake_case; functions `noun_verb` with a verb from the closed list in
  `design/3-terms.md`; records `Ada_Case`; the design's terms first, then the standard term; no
  invented words (`python3 scripts/terms-check.py` stays at 0).
- **Every name has a source, said with it.** The order is `design/1-principles.md`'s ("Names are
  reused too"): the design's terms and decisions (`3-terms.md`, the glossary, the decisions in the
  notes), then the standard term (the technology's own name, a standard programming term). A name
  with neither is new: it goes to the user with no word attached, and only their word goes into
  `3-terms.md`. Never a made-up word, not even as a proposal.
- **What's settled is in all the design notes, not one.** Before calling a name, a word, a screen
  or a behaviour undecided, or proposing a new one, search every note: `0-intent.md`,
  `2-requirements.md`, `2b-behaviour.md`, `3-terms.md`, `4-ports.md`, `8-functions.md`, `9-build.md`
  (with its approved proposals) and `ux/SPEC.md`. Reading only `3-terms.md` once called the queue,
  branches, Quick edit and Look "undecided" when they'd been settled for days. Say where each
  settled thing comes from; only the user reopens it.
- **Errors are data** (`{ code, message }`, gRPC codes), said in plain words with what to do.
- **Hooks inside the send sequence, events outside it.**
- **A cross-layer change updates the contract first**: the call's row in `design/4-ports.md`
  names its fields, types and units; then both sides are written from that row, and you check
  that the keys the sender writes are the keys the receiver reads. (A pixel region sent where
  fractions were read once left the site view invisible.)
- **No version from memory**: look it up (the registry, the old working build) before pinning it.
- **The screen**: compare with the UI spec and wireframe (`design/ux/SPEC.md`, `wireframe.html`),
  the screenshots in `design/ux/` and `design/2b-behaviour.md`. They are a reference for UX only:
  the words are the settled terms, and the spec's Quick start guides are skipped (2026-11-22).
  **The look matters as much as the features**: match the wireframe's layout, spacing, sizes,
  colours and icons, and show the new screen beside the wireframe's in screenshots. Every
  element, label, gesture and state of the screen you touch is still there. Take the same
  screenshot in Chromium (`test/test_screen.js` shows how) and look at both.
- **One text path, one error path.** Site text comes in only through the page's `markdown_get`
  (HTML to Markdown); the screen shows any text only through `markdown_render`. Errors reach people
  only through `error_words` (plain words; the technical text goes under Details). A second way to
  do any of these is a bug, even when it looks quicker.
- **Stand-ins behave exactly like the real thing.** A test stand-in that's more forgiving than the
  real component hides bugs (the stand-in core matched `*.json`, the real one didn't, and chats
  loaded empty on the phone). When a call's rule matters, check it against the real core too
  (`core/test/test_core.py`), and write the rule into its contract (`design/4-ports.md`).
- **Nothing waits without a limit, nothing fails silently.** Every wait has a time limit and a
  visible state ("Checking the page…"); every failure says what happened and what to do.
- **Platform traps** (the platform can't be compiled or run here, so read for these):
  GeckoView calls delegates on the main thread, and nothing there may wait (`GeckoResult.poll`,
  `.get()`): answer at once, or do the work on `app.workers`; `x in map` on a `ConcurrentHashMap`
  checks values, so use `containsKey`; in `build.gradle.kts`, `java` means Gradle's extension, so
  import `java.util.*` classes; GeckoView and views only on the main thread (`app.main_run`).
  GeckoView turns a session inactive when its view isn't showing, and Gecko throttles inactive
  pages: hidden site pages must be set active again after every view change and on resume, or
  replies only arrive at the end (`sessions_wake`). A `lateinit` page session isn't there for a
  moment after the page is listed (`page.started`). Before dropping old platform code, find why
  it was there (`git log -S`): the old app's oddities were often fixes.
  In the app's GeckoView, `requestAnimationFrame` only fires when something else asks for a
  frame: never put the screen's redraw (or anything that must run while you just watch) behind
  it; the redraw uses a short timer. When something works in Chromium but not on the phone,
  measure on the phone (the reply's Live updates counts what the page sent, the app got and the
  screen drew) before changing code.
  A site page can load anew by itself (a reload, the site's own navigation): whatever the
  platform hands a page (its scripts) must be handed again at every hello, not only after the
  platform's own load.
  An Odin update can change its Android target: read Odin's own sources (`odin root`, then
  `core/sys/android`, `core/os/*_android.odin`, `base/runtime/entry_unix.odin`) instead of
  guessing. The core starts through `pp_core_main` (Odin keeps `main` for NativeActivity apps),
  and `build.sh` links the object itself, so libraries Odin's bindings name (`system:android`)
  go on its link line; `llvm-nm -u build/ppcore.o` lists what's needed.

## Checks before handing over

```sh
cd promptpipe-plugins && npm test                      # the application, the screen and the site routine
npx prettier@3.3.3 --check "**/*.js"                   # width 100 (.prettierrc); vendor/ excluded
cd ../promptpipe && odin build core -out:build/ppcore -vet -strict-style && python3 core/test/test_core.py build/ppcore
python3 scripts/terms-check.py                         # 0, or the line is reworded
python3 .claude/skills/remake/scripts/name-check.py design   # when calls changed
```

- A plugin's files changed: `python3 scripts/catalogue_build.py` in promptpipe-plugins (the
  hashes), and the user signs on the phone (`scripts/catalogue_sign.py`).
- A bigger change: the clone-detection skill; new duplicates are merged or listed as accepted.
- Docs that describe what changed: `app/src/main/assets/docs/QUICKSTART.md`, `PLUGINS.md`,
  a plugin's `GUIDE.md`, the READMEs, and a note in `design/9-build.md` (what, why, checks).
- **Self-review**: it traces to a requirement; nothing is stored twice; one mechanism per job; the
  names follow the rules; the screen lost nothing; and you say what was tested where (here, in
  Chromium, on the phone) and what hasn't run.

## Building on the user's phone

The user builds in Termux + proot Arch, with the two repos at `~/promptpipe` and
`~/promptpipe-plugins`. Give each part its own copy-paste block:

```sh
cd ~/promptpipe-plugins && git pull
cd ~/promptpipe && git pull && sh scripts/build.sh 1.0.0 <code>      # add "release" once the keys exist
rm -rf ~/promptpipe/app/build && df -h /sdcard                         # room to install; rebuilt offline
```

- **The version code always goes up** (it's above 1000 now); keeping the version name replaces the
  APK in `build/` instead of adding one.
- **Space and internet are scarce**: never suggest deleting downloads, caches that would be
  downloaded again, or old builds (`build/*.apk` are kept on purpose). Diagnose with read-only
  commands first (`du -h -d 2 … | sort -h`, `ncdu`), then name exactly what a deletion removes.
- Install from `Download/promptpipe.apk` with My Files. "Problem parsing the package" has meant a
  full phone before.
- A crash: `cat /sdcard/Download/promptpipe-crash.txt`.

## Committing

- Work on the branch the session names; push with `git push -u origin <branch>`; no pull request
  unless the user asks. Commit messages say what changed and why (the cause, for a fix), and end
  with the attribution lines the session gives; never a model name or id.
- Both repos change together when a change crosses them; push both.
