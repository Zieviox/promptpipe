---
name: standards-review
description: Go over the code of promptpipe and promptpipe-plugins line by line against the coding guide (design/7-review.md Part 1, with the principles it cites) and the terms (design/3-terms.md), file by file, logging each file's findings in design/7-review.md Part 3 so the work survives a lost context. Use when asked to review the code, go over every line, check the code against the guide or the terms, or before merging rewrite into main. Features and UX are not reviewed here (they are agreed); the contribute skill covers changes.
---

# Going over the code against the guide and the terms

The name is the remake's stage 7, "Standards and review" (`remake/SKILL.md`), whose result is
`design/7-review.md`. That note's Part 1 is the coding guide; its Part 2 reviewed the design; Part 3
is this review of the code, and the log.

## Scope (Gtex, 2026-11-24)

"CODING guide is the priority please. That and terms. We already agreed on features."

- **In**: how the code is written and named. The sources, and only these:
  1. `design/7-review.md` Part 1, "Code standards" (the coding guide);
  2. `design/1-principles.md`, for the rules Part 1 cites ("principles");
  3. `design/3-terms.md`: records and fields, the naming rules, the closed verb list, the nouns,
     the seven events, the hooks, the adapters' words. This is the list of agreed words.
- `design/4-ports.md` (the call table) and `design/8-functions.md` (the function list) are where a
  call's name is kept across layers (rule 9), not a list of agreed words: rows were added there
  during the build without Gtex's word (`keyboard_set`, `site_shown`, `site_back`,
  `site_regenerate`), so a name being there doesn't make it agreed.
- **Out**: what the app does and how it looks (`2-requirements.md`, `2b-behaviour.md`, `ux/`). A
  behaviour that looks wrong goes on the list for Gtex; it is never changed in this review.
- A rule not in these sources is not a rule here. Don't add rules from elsewhere, and don't drop
  one because the code ignores it.

## The rules, with their sources

### Every language (7-review Part 1, "Every language")

1. Width 100, set by the formatter, never by hand; one statement per line; blank lines between the
   parts of a function; no packed lines (Q4).
2. Names: the design's terms; `noun_verb` functions; `snake_case` functions and fields; `Ada_Case`
   records; `UPPER_SNAKE` constants (W3). The decision beats a language's own convention
   (camelCase); a library's own names stay inside its adapter.
3. Comments say why, not what; a name that needs a comment gets a better name.
4. Errors are data across the port (`Error` with a gRPC code); throwing only for bugs.
5. Pure first: deciding code is pure functions over plain data; effects at the edges.
6. Tests run without a phone, with the call table's stand-ins (B4, B5).

### Names in detail (3-terms Part 2; 1-principles "Names")

7. Function: `noun_verb` or `noun_noun_verb`; the noun is the module; the verb from the closed
   list (`3-terms.md` "Verbs"). Not used: fetch-as-read, show/hide (open/close), remove-as-delete,
   check (validate or verify), make, do, handle, process, manage, util, helper.
8. Only glossary words and standard programming terms; no invented words. The order for any
   name: the design's terms and decisions, then the standard term; a new name only when none
   fits, and it goes to Gtex. It is never invented here, not even as a proposal.
9. One name per job across every layer: a call keeps its name from the application through the
   port to the adapter (`4-ports.md`).
10. Events: only the seven (`page_changed`, `reply_changed`, `http_received`, `share_received`,
    `back_pressed`, `job_received`, `job_changed`); one `_changed` event per record; "the screen
    needs no events".
11. Hooks: named by their place, noun first (`send_before`, `reply_after`, `block_text`,
    `chat_route`, `turn_render`, `toggle_render`, `menu_items`, `chat_section_format`,
    `chat_section_parse`).
12. `PP`: every function plugins may use is on `PP` under its full name; no bare names shared
    between plugins; no plugin depends on another's internal names (1-principles "Plugins").
13. Records and fields are the ones in `3-terms.md` Part 1, spelled as there (`status` not
    `state`, `url` not "address", `name` not `title`, `mime_type`, `thought_ms`, …; the "Name pass"
    table lists the replaced names). `type` means which variant a record is.
14. Inside an adapter the library's own names are used as they are (3-terms, line 8).

### State and shape (1-principles "Stateless functions", "Functional core")

15. No hidden state in closures, module variables or objects; the State is the only state of the
    screen process. A side's own small state stays private to it: the core's, the platform's, a
    page script's ("the send it is watching", 3-terms "Records that cross a boundary").
16. State changes in one place: the apply function (`state_set`).
17. Records refer to each other by id; every collection is one flat list; derived values are
    computed, not stored twice.
18. Every library goes through an adapter; application code never calls a library directly.
19. Hooks return values inside a sequence; events never replace a return value.

### Odin (7-review Part 1, "Odin")

20. Procedures `snake_case`, types `Ada_Case`, constants and enum values as in `core`, packages
    lower case; errors as a second return value, `or_return` where it reads well.
21. odinfmt at width 100; one arena per request, the heap only for state that outlives it; tests
    with `core:testing`.

### Kotlin (7-review Part 1, "Kotlin")

22. The official Kotlin conventions, except names: functions and properties `snake_case`, records
    `Ada_Case`. ktfmt (Kotlin style), width 100.
23. No app logic (P2): each call is a function of a few lines around its library; exceptions caught
    at the adapter and returned as `Error`.

### JavaScript (7-review Part 1, "JavaScript")

24. Plain scripts in strict mode; no build for plugins; no classes in app code; `const` by default.
25. Prettier width 100; ESLint's recommended rules with the naming rule set to `snake_case`.
26. Each plugin in its own scope, reaching others only through `PP` (UC42.6).
27. The screen through Preact and htm via the screen's adapter: components are plain functions of
    their inputs; no hooks that hold state (`useState`, `useReducer`, refs used as state), no class
    components; lists keyed by record id.
28. Tests: `node:test` for pure functions and sequences with stand-ins; the screen with Playwright.

### CSS, JSON and content (7-review Part 1)

29. CSS: a custom property for every colour and size a theme or the scale can change; a few
    component classes named after the design's nouns (`sheet`, `item`, `toast`, …); no CSS library;
    Prettier.
30. JSON: `snake_case` keys, two-space indent, a `version` field in every saved file.
31. Content files (guides, help, template texts): Markdown, one file per text, read by the code;
    their wording follows the glossary.

## What the checks find, and what only reading finds

Run these first on each file; they find rules 1, 2, 7, 10, 24 and 25 mechanically. Reading finds
the rest: 3–6, 8, 9, 11–23 and 26–31.

```sh
cd promptpipe-plugins && npx prettier@3.3.3 --check "**/*.js" && npm test
npx eslint@9 -c eslint.config.js .                     # recommended + the snake_case naming rule (id-match)
cd ../promptpipe && PP_PLUGINS=../promptpipe-plugins python3 scripts/terms-check.py
odin build core -out:build/ppcore -vet -strict-style
```

ktfmt, ktlint and odinfmt aren't installed in the cloud session: Kotlin and Odin formatting is read
by eye there, and the log says so.

## The order

Inside-out, as the layers are built (1-principles "Inside-out"), so a name fixed at the bottom is
fixed before its callers are read:

1. core (`core/*.odin`); 2. platform (`app/src/main/java/**/*.kt`); 3. loader
(`app/src/main/assets/ui/`); 4. page side (`app/src/main/assets/ppext/`, `runtime-site/`);
5. application (`runtime-records`, `runtime-storage`, `runtime-chats`, `runtime-profiles`,
`runtime-plugins`, `runtime-send`); 6. screen (`runtime-screen`); 7. optional plugins and the import;
8. tests and scripts.

Not reviewed: `vendor/`, test fixtures, `catalogue.json` (built), `node_modules/`, the built copy in
`app/src/main/assets/plugins/`.

## For each file

1. Read every line (in parts of at most 400 with `offset` and `limit`); no skimming, no grep in
   place of reading.
2. Check each line against rules 1–31. Write each finding as: line, rule number, what's wrong.
3. **The guide answers it**: fix it in the same pass. A fix never changes behaviour. A rename
   follows the name through every layer (rule 9) and every caller, test and doc.
4. **The guide doesn't answer it** (a name with no agreed source, a rule two sources disagree on, a
   behaviour that looks wrong): don't decide and don't invent a word. Put it in the file's row as a
   question, and later on Gtex's list.
5. Run the file's checks (the commands above, its tests). Commit the file or a small group with what
   was fixed and under which rule.
6. **Log at once**: the file's row in `design/7-review.md` Part 3, before the next file. The log is
   what survives a lost context: on resume, read Part 3 first and carry on from the first file not
   yet logged.

## The log (design/7-review.md, Part 3)

One row per file: `| file | lines | read on | fixed (rule: what) | questions |`. Below the table,
"Questions for Gtex": one line per **rule question**, grouped, never one line per name. For example,
"14 module variables in the screen hold UI state outside the State (rule 15): move them into
`State.ui`, or are they a page script's own small state?", with the files listed.

## Handing over

- Say what was read, fixed, run (tests, Prettier, ESLint, terms-check, `odin build -vet`) and not
  run (Kotlin isn't compiled here; the phone).
- Give Gtex only the grouped questions, each with the rule and its source, and say what you
  recommend.
- A build note in `design/9-build.md` (the contribute skill), and a catalogue rebuild when a
  plugin's files changed; Gtex signs on the phone.
