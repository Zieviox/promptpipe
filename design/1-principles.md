# 1. Principles

The rules every later part of the design (requirements, terms, functions) is checked against.
They come first because they decide what counts as a good answer.

## Rewrite from zero, not edit

The refactor is a rewrite: new code, written from this design, in new files. The current code is
not edited, moved or copied in.

- **The old code is a reference, read-only.** It tells what the app does and the edge cases
  learned the hard way (a site's quirks, Android's timing, the bugs in BUGS.md). Each lesson is
  written into the requirements or the function list first, then implemented fresh.
- **No copy-paste from the old code.** Copying brings its names, its duplicates and its hidden
  assumptions back. Even a function that looks right is rewritten to the new names and rules.
- **What carries over is data, not code**: the user's chat files, config, prompt library and
  profiles must open in the new app (migrated on first start, requirement K4).
- **The old app keeps working until the new one does everything** in the requirements, checked
  requirement by requirement. Then the old code is removed in one change.
- **Each part is built against its checks** (the core's route tests, the stand-in checks, terms
  and clone checks) from its first commit, so nothing is "finished later".
- **The language reference is current**: the Odin docs and the core library index for the
  release the phone builds with (`sh scripts/odin-reference.sh`, into `build/odin-reference/`).

## DRY, KISS, YAGNI

- **DRY (Don't Repeat Yourself).** Every item of knowledge has one source: a data format, a
  rule, a list, a limit. "The files that make up a plugin" is written once; the installer, the
  hash check, the loader and the build script all call it. DRY is about knowledge, not
  identical text: two functions that look alike but would change for different reasons stay
  apart. Checked by the clone-detection skill (and later a gate in `scripts/checks.py`).
- **KISS (Keep It Simple).** The fewest moving parts that meet the requirement: plain data and
  plain functions, no frameworks, no class hierarchies in app code, no build stage for plugins.
  When two designs meet the requirements, the one with less code and fewer concepts wins.
- **YAGNI (You Aren't Gonna Need It).** Build only what a current requirement needs. Being ready
  for another platform means clean boundaries now, not a desktop shell now. A setting, option or
  extension point exists only when something uses it.

Order when they conflict: correctness and security first, then KISS, then DRY (a small,
clear repetition beats a clever shared abstraction), then YAGNI decides what is built at all.

## Functional core, imperative shell

The standard split (Gary Bernhardt's "functional core, imperative shell"; also "ports and
adapters"):

- **Functional core**: all the app's logic as **pure functions**. Data in, data out. A pure
  function reads nothing but its arguments, changes nothing outside its return value, and gives
  the same output for the same input. Building a message from blocks, parsing a chat file,
  deciding which plugin files to download, comparing versions, planning a drag and drop: all pure.
- **Imperative shell**: the thin outer layer that does effects (files, network, the browser
  page, the operating system, the screen). It calls the pure functions to decide *what* to do,
  then does it. Effects happen only here.

So: logic is tested without a phone, a browser or a network; effects are few and easy to find.

## Stateless functions, state as data (data-oriented design)

- **Functions are stateless**: no hidden state in closures, module variables or objects. What a
  function needs comes in as arguments.
- **State is plain data in one place per process**: the core's state record, the screen's state
  record, the page script's state record. Plain records and arrays (JSON-shaped), referenced by
  id, never object graphs with methods. A function gets the part of the state it needs.
- **State changes in one place**: an "apply" function takes the current state and a change (a plain
  record) and returns the next state, or writes the change in one known function. Nothing else
  writes state. The screen is drawn from state (`view = f(state)`); the patcher (`morph.js`)
  makes that cheap.
- **Data-oriented design (DOD)**: design the data first (its shape, who owns it, how it flows),
  then the functions that transform it. Records are flat and keyed by id; lists are arrays of
  records of one shape; derived values are computed, not stored twice.

## Libraries and platforms behind adapters

- Every library and platform API sits behind an **adapter** (a wrapper): a small set of
  functions with app terms on the outside and the library's terms on the inside. GeckoView,
  JGit, Android services, the browser's DOM and storage, Odin's `core:net`, `fetch`: each is
  touched only inside its adapter.
- The adapter is the only place that deals with the library's style: objects, callbacks,
  threads, exceptions. It turns them into plain data and plain results.
- The app's own code uses **agnostic terms**: a page, not a GeckoSession; the repository, not
  JGit; secure storage, not Android Keystore. Changing a library or adding a platform means a
  new adapter, not changes across the app.
- Adapters are small and mostly free of decisions; decisions stay in the functional core.

## The main sequence and events

- **The main sequence** is the chain of calls that does one thing from start to end (send a
  message: build, hooks, provider, wait, save). Inside it, functions call each other and return
  results: direct calls, in order, easy to follow.
- **Events** are for everything outside the main sequence: something happened and others may
  want to know (a reply grew, a page loaded, a plugin was installed, the config changed). The
  same idea as delegates and events in Unity and C#, and signals in Godot (the observer pattern).
  - The emitter doesn't know who listens; listeners can't change the emitter's result.
  - An event is a name and a plain data record; names are past tense (`page_loaded`,
    `reply_progressed`).
  - Events never replace a return value: if the caller needs the answer, it's a call.
- **Hooks** are different from events: a hook is a stage plugins add *inside* the main sequence,
  run in order, each one's output feeding the next (before send, after reply). Hooks return
  values; events don't.

## Errors are data

- Functions return either a value or an error, as data: Odin's `(value, err)`; in JS a record
  `{ ok: true, value }` or `{ ok: false, error: { code, message } }` at boundaries.
- Throwing is only for programming errors (a bug), not for things that can happen (no network,
  a refused file). Adapters catch the library's exceptions and return error data.
- An error message says what happened and what to do, in the glossary's words.

## Names

- **Noun first, then the verb**: `file_write`, `chat_save`, `page_open`, `plugin_install`. The
  noun is the module, so a module's functions sort together and autocomplete lists them all
  after typing the noun (`chat_` lists every chat function). One noun per module, one verb per
  meaning (the verbs are a closed list in the terms).
- The same name in every layer for the same job: the route `/api/chat/save`, the core's
  `chat_save`, the screen's `chat_save`.
- Names use only glossary words and standard programming terms; no invented words. A name that
  needs a comment to be understood gets a better name.

## Plugins keep the app updatable

- What can live in a plugin lives in a plugin (logic in JS, updated from the catalogue without a
  new APK). The native parts (the core, the shell) hold only what must be native or trusted:
  files, keys and secrets, verification, the HTTP server, the bridge to the shell, OS services.
- The plugin surface (`PP`) is the only way plugins reach the app: named, versioned, documented.
  No plugin depends on another plugin's internal names.

## Checks keep the rules

Each rule that can be checked has a check: terms-check (one vocabulary), clone-detection (DRY),
the core's route tests, the stand-in checks (screen, migration, redraw). A refactor change is done
when its checks pass.
