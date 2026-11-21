# 7. Standards and the KISS/DRY review (stage 7, 2026-11-21)

Two parts: the code standards for each language, in the style already decided (snake_case
everywhere, noun first, records in Ada_Case, 100 characters wide); then a KISS and DRY pass over
the whole design (stages 0–6), with what it changed. Checked by the names check (73 calls, 7
events), terms-check (0) and a look for calls doing the same job (the clone check on the design's
names, below).

## Part 1. Code standards

### Every language

- **Width 100**, set by each language's formatter, never by hand; one statement per line; blank
  lines between parts of a function; no packed lines (Q4).
- **Names**: the design's terms (`3-terms.md`), `noun_verb` for functions, `snake_case` for functions
  and fields, `Ada_Case` for records, `UPPER_SNAKE` for constants (W3, decided 2026-11-20). Where a
  language's own convention differs (Kotlin's camelCase, JavaScript's camelCase), the decision wins
  and the linter is told so; a library's own names stay inside its adapter (U 2026-11-21).
- **Comments say why**, not what; a name that needs a comment gets a better name (principles).
- **Errors are data** across the port (`Error` with a gRPC code); throwing only for bugs.
- **Pure first**: deciding code is pure functions over plain data; effects sit at the edges
  (principles).
- **Tests**: the application's tests run without a phone, with the call table's stand-ins (B4, B5).

### Odin (the core)

- The core library's conventions (as `core:*` is written): procedures `snake_case`, types
  `Ada_Case`, constants and enum values `Ada_Case` or `UPPER_SNAKE` as in `core`, packages lower
  case; errors as a second return value (`value, err`), with `or_return` where it reads well.
- Formatter: `odinfmt` (from the Odin language server) at width 100.
- Memory: one arena per request, the heap only for state that outlives it (the old core's rule,
  re-decided here because it keeps a server simple).
- Tests: `core:testing` with `odin test` (the reference's `testing.md`), compiled against
  dev-2026-11 (B3).

### Kotlin (the platform)

- The official Kotlin coding conventions, except names: functions and properties `snake_case`
  (W3) and records `Ada_Case`; ktlint's naming rules are switched off for that, the rest stays on.
- Formatter: ktfmt in its Kotlin-language style, width 100.
- No app logic (P2): each call is a function of a few lines around its Android or GeckoView
  library; exceptions caught at the adapter and returned as `Error`.
- Tests: none on the phone's side beyond what the platform's adapters need; the screen and the
  application are tested without it (B5).

### JavaScript (loader, runtime plugins, screen, page script, content scripts)

- Plain scripts in strict mode, no build for plugins (principles: KISS); no classes in app
  code; `const` by default.
- Formatter: Prettier, width 100; linter: ESLint's recommended rules, with the naming rule set to
  `snake_case`.
- Each plugin runs in its own scope and reaches others only through `PP` (UC42.6).
- The screen is drawn with Preact and htm through the screen's adapter (plugins through `PP`):
  components are plain functions of their inputs; no hooks that hold state (`useState`,
  `useReducer`, refs used as state), no class components; the `State` is the only state. Lists
  keyed by record id.
- Tests: Node's built-in test runner (`node:test`) for the application's pure functions and its
  sequences with stand-in calls; the screen's checks with Playwright and the screenshots (B5, Q1).

### CSS

- Design tokens (custom properties) for every colour and size that a theme or the scale can change;
  a few component classes named after the design's nouns (`sheet`, `item`, `toast`, …); no CSS
  library (it would change the look, Q1). Formatter: Prettier.

### JSON and content files

- JSON: `snake_case` keys, two-space indent, a `version` field in every saved file.
- Content files (prose: guides, help texts, template texts, decided F): Markdown, one file per
  text, read by the code; their wording follows the glossary (W1).

## Part 2. The KISS and DRY review

Each change refines what exists (U 2026-11-21: "refine instead of bolting on"); the standard that
decided it is named.

| # | Was | Now | Why (standard) |
|---|---|---|---|
| 1 | `profile_export`, `prompt_export`, `profile_import`, `prompt_import`, `chat_export` | `record_export`, `record_import` on any collection; the schema gives the file's form | One mechanism per job (DRY); strategy 1 already makes the schema the storage form |
| 2 | `chat_create`, `chat_open` | `record_create`, `record_get` on `chats` (`record_get` brings the turns) | The generic record calls already do it (reuse first) |
| 3 | `chat_data_read`, `chat_data_write` | the `chat_data` collection (by chat and plugin) with `record_get`, `record_set` | Plugin data is records too (reuse first, DRY) |
| 4 | `commit_list` in two tables (the application passing through to the platform) | one `commit_list`, answered by the platform | A pass-through adds nothing (KISS) |
| 5 | `popup_changed` | part of `page_changed` (`popup`) | A record's changes are one `_changed` event (principles) |
| 6 | `app_resumed` | gone: the platform reopens dead pages itself (R3) and reports them with `page_changed` | Nothing in the application listened for anything the platform didn't already report (YAGNI) |
| 7 | `Send.saved` | derived: a send with no `chat` is a side request | Nothing stored twice (DOD) |
| 8 | `Config.provider`, `Config.active_profile` (fields of their own) | the settings `chats.provider`, `chats.profile` | The coverage already set them with `record_set` on `settings`; one mechanism for app values (strategy 3) |
| 9 | Q4 "about 3,000" | Q4 records the decided budget (3,620; 3,540 since Preact) | The requirement and the decision said different things (DRY) |

Kept after a look (they do different jobs): `chat_find` (parses the query) over `file_find` (scans
text); `model_list` (picks the chat's page) over `site_model_list`; `plugin_install` and
`plugin_update` (different verbs: put in, replace with a newer or earlier version) over
`plugin_write` (the verified write); `send_stop` (the application's send) over `site_stop` (the
page); `api_token_create` (makes the token and its hash) over `credential_create`;
`failure_resolve` (one choice of four, each a short sequence) instead of four calls;
`site_chat_open` (finds the chat already linked to a site chat, or makes one).

## In numbers

- The contract: 73 calls (9 record operations for 16 collections, 21 more in the application, 11
  in the core, 25 in the platform, 7 in the page script) and 7 events, from 81 and 9.
- The budget is 3,540 since Preact (fewer calls are fewer lines, kept as margin for the risks named in
  stage 6).

## Next

Stage 8: the function list, every function per layer and module with its job, inputs, outputs,
pure or effect, its call, and its line estimate, fitting the budget.

## Sources

- Kotlin: [coding conventions](https://kotlinlang.org/docs/coding-conventions.html), [ktfmt](https://github.com/facebook/ktfmt), [ktlint](https://pinterest.github.io/ktlint/)
- JavaScript: [Prettier](https://prettier.io/docs/options), [ESLint](https://eslint.org/docs/latest/rules/), [Node's test runner](https://nodejs.org/api/test.html)
- Odin: the core library's sources and `build/odin-reference/docs/testing.md`; [the language server's formatter (odinfmt)](https://github.com/DanielGavin/ols)
- Testing with stand-ins: [Fowler, Test Double](https://martinfowler.com/bliki/TestDouble.html)
