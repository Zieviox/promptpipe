# 5. Strategies (stage 5, redone 2026-11-21 against the calls)

Ways to need less code for the same features, each checked against `4-ports.md` and `3-terms.md`:
what it is (with its standard name), what it replaces, which calls and records already carry it,
and what it costs. Redone from the first pass (2026-11-20), whose eleven strategies were approved
(decided A–C below); they are kept and refined here, not replaced, and three new ones come from the
behaviour inventory and the stage 4 calls. Numbered "strategy 1 …" so they don't clash with the
security ids S1–S10.

Goal (U 2026-11-20): every feature in `2-requirements.md` and `2b-behaviour.md` in about **3,000
lines of clean, comfortable code** (normal spacing, one statement per line, 100 characters wide,
comments where they help). Size comes from structure, never from packed lines or cut features.

## Where the code is today

10,370 lines of code (blank lines and comments not counted): screen 4,410 (ui.js 1,348), core 1,770,
platform 993, page script 554, loader 514, other runtime plugins 985, Memory/Sub-chats/Base64/Page
report 826, providers 303, themes 15. Most of the screen is hand-built element trees; the core and
the platform are long lists of special routes doing "take a request, run one thing, answer". The
inventory (`2b-behaviour.md`) lists what all of that does.

## The strategies

### Strategy 1. Records with schemas: one generic viewer and one generic store

Standard names: model-driven UI, the **naked objects** pattern (Pawson; Apache Causeway), and the
**repository** pattern (Fowler, *Patterns of Enterprise Application Architecture*) for storage.

Each collection (`chats`, `folders`, `turns`, `profiles`, `templates`, `blocks`, `groups`,
`prompts`, `connections`, `sources`, `sends`, `drafts`, `settings`, `plugin_settings`,
`provider_choices`) has one schema: its fields with types, labels and rules, its order or grouping,
its actions (commands), and where it's stored. From it:

- **the viewer**: one generic list (keyed items, sections, folding, select mode, reorder by drag or
  Move up/down, a badge or a switch on the right) and one generic form (toggle, choice, text, number,
  credential, list, link to another record), drawn in the screenshots' look;
- **the store**: one load and one save per storage form (one JSON file for a collection, one file
  per record, a record inside the chat's data folder), so `record_*` needs no per-collection code.

- Checked against the calls: the seven `record_*` calls over 15 collections are this strategy;
  `Setting_Def` is the schema's field shape for the app and for plugins alike.
- Replaces: the chats list, the profile editor, Quick edit, the prompt library, the Plugins and
  Catalogue screens, the plugin page, Settings and its pages, the chat sheet, Model and options,
  Credentials, the storage check, and today's per-collection load and save code.
- Stays bespoke: the chat itself (turns, streaming reply, message box) and the site view's bar.
- Cost: a screen with a special layout needs a field type of its own; schemas are data, and data
  lines count (decided C).

### Strategy 2. Commands as data: one command table

Standard name: the **command pattern** with one registry (VS Code's commands).

Every action is one `Command` (`id`, `label`, `icon`, `key`, `when`, `handler`). Buttons, the ⋯
menus, long-press menus, the keys, Find's functions, help mode's cards ("what it does, where it
lives, its key"), the shortcuts list and the guides read the same table; a guide's stage is a
command id plus its words, done when that command runs.

- Checked: `Command` in the model; the command list in the requirements is its content; plugins add
  theirs with the `menu_items` hook.
- Replaces: hand-written menus per file, the key map, help.js's texts, tour.js's step logic, Find's
  separate list of functions.
- Cost: one small engine (menus, keys, help card, guide spotlight), written once.

### Strategy 3. One schema and one resolver for every setting and every linked-or-own value

Standard names: **single source of truth**; **cascading settings with local override** (D8).

Each setting is one `Setting_Def` (key, type, default, label, section, limits, old keys for the
import). One pure function, `value_get`, answers every "which value applies" question: a chat's own
value, else the profile's, else the provider's choice, else the default.

- Checked: `Config.settings` holds only values you changed; the linked-or-own table in the model;
  `record_set` with a field set to none goes back to linked.
- Replaces: defaults in the loader, Settings code, per-place fallbacks (today's provider, profile,
  model and toggle lookups are four separate lookups).

### Strategy 4. One port each way, one envelope, one call table

Standard names: a **message bus**; request/reply and notification in one format (as JSON-RPC 2.0).

- Checked: this is `4-ports.md` (81 calls, 9 events). The table is the routing, the boundary check,
  P5's "not supported on this platform", and the stand-ins for tests.
- Replaces: the core's ~40 routes, the platform's action and module lists, the page bridge's own
  message types, and their glue.
- Cost: the checks (the key, who may call what) live in one place, which has to be right.

### Strategy 5. A small, generic core

Standard names: **capability-based** file access (named roots, one path check), a thin server.

The core keeps only what must be native or trusted: the HTTP server and the key, files under named
roots with the change check (the expected revision on every write, move and delete, D7), the search
over the chats (`file_find`, #212), plugin verification (`catalogue_verify`, `plugin_write`), the log,
and the local API's HTTP side.

- Checked: the core answers 11 calls; saving a chat with its commit, moving the chats folder, copying
  and rolling back plugins are runtime sequences over `file_*` and `repo_*`.
- Odin's own library does the hard parts behind adapters: `core:net`, `core:crypto/sha2`,
  `core:crypto/ed25519`, `core:encoding/json`.
- Cost: none in features; the checks stay out of plugins' reach (S3).

### Strategy 6. A thin platform

The platform answers 25 calls, each a few lines around its library: pages, views and pop-ups
(GeckoView), the repository (JGit), credentials with the keyed request (Keystore), clipboard,
vibration, share, the picker, the bars, the service, the app's start.

- Refined from the first pass's architecture: the site view sits in a region the screen names
  (`view_set`), so no geometry is kept in sync on every keyboard change (the cause of #240); hidden
  pages keep their real size (R3).
- Replaces: today's separate action, module and page-message paths.

### Strategy 7. Providers as data; the default routine as an updatable content script

The page script in the APK only joins the port and runs the code the app hands it (S9). The
default way of using a site (type, send, wait, read, the model list, the page report) is a content
script in a runtime plugin, driven by the provider's `Provider_Def`; a provider's own content
script replaces single stages only (DeepSeek's error stage, Qwen's send and thinking stages).

- Checked: `page_open` hands the provider and its scripts; the seven `site_*` calls are the routine's
  stages.
- Replaces: most of today's 554 page-script lines, and the helpers each provider rewrote.

### Strategy 8. One send sequence for every send

Standard idea: the **filters** pattern (a fixed sequence of filters, each stage's output feeding the next).

A send runs: blocks → `send_before` hooks → the provider (`site_model_set` and `site_send`, or
`http_fetch` for an API) → `reply_after` hooks → save. Your messages, side requests, Memory's
summaries, Sub-chats' routing, other apps' jobs and API providers all use it; only the `Send`'s
fields differ (saved or not, which profile, which chat, which page).

- Checked: one `message_send`, one `Send` record, the queue and the failed list as views of `sends`.
- Replaces: today's separate paths for chats, side requests and jobs.

### Strategy 9. The browser engine's own features

- `<dialog>` for sheets, confirms and text prompts (focus, Escape, the backdrop); `<details>` for
  every fold (Q5); CSS for layout and `overflow-anchor` (UC8); `URL` for comparing addresses; `Intl`
  for dates; streams for streaming replies; `CompressionStream` where a zip needs it.
- Replaces: custom sheet, fold and scroll code.

### Strategy 10. Proven libraries for solved problems, behind adapters

Standard practice: don't rewrite what a maintained library does well; keep it behind an adapter
(principles); pinned to exact versions; not counted (decided B). Refined with what the inventory
showed:

| Problem | Library | Replaces |
|---|---|---|
| Redraws that keep typing, focus, scroll (R4) | idiomorph | today's 202-line morph.js |
| Markdown in replies, with tables (D5, #214) | a GitHub-flavoured Markdown library (markdown-it or marked) | today's Markdown code, and adds tables |
| A reply's HTML as Markdown, in the page | Turndown with its GFM plugin | the page script's ~110-line converter |
| Drag to reorder, with grips, auto-scroll at the edges, dropping into folders (UC17) | SortableJS | the chats list's and the editors' drag code |
| Reading plugin zips and making the old app's backup | fflate | zip code in the core; the zip-bomb check (S6) stays ours |
| The repository | JGit | — |

Cost: their code ships in the APK and we update them; each sits behind a small adapter.

### Strategy 11. Themes as design tokens

Standard name: **design tokens** (CSS custom properties). The screen's CSS uses one set of
variables and a few component classes; a theme is a short list of values (`2b-behaviour.md` 1.45,
3.6).

### Strategy 12. One text form of a chat (new)

Standard idea: a pure **format / parse** pair.

One pure function formats a chat as its readable Markdown (D1): header, turns, the plugins' folded
sections (`chat_section_format`); one parses an edit you kept back into the chat
(`chat_section_parse` for the plugins' parts). The same format serves copying the whole chat,
sharing it and exporting it (UC21), so there is no second exporter.

- Checked: `chat_export` and the readable file are the same function's output.
- Replaces: today's separate chat-file writer, copy and share text.

### Strategy 13. The old-content import as a removable runtime plugin (new)

The one-time import of the old app's content (X5: every old shape of chats, profiles, prompts,
settings and Memory's summaries) is a runtime plugin that runs on the first start, then can be
removed, and leaves the app later.

- Checked: it uses only existing calls (`file_list`, `file_read` on `device`, `file_write`) and the
  same record schemas (their `old_keys`).
- Saves: about 150 lines from the app's permanent count; they're still written and shipped once.
- Cost: none in features; it's code nobody keeps maintaining.

### Strategy 14. Prose as content files (new)

The templates' texts (X6), help mode's explanations, the guides' words and the plugin guide are
prose, kept in Markdown content files beside the code, like the guides already are, and read by the
code; not counted as lines of code. Schemas and the command table stay counted (decided C).

- Saves: about 150 lines of string literals from the count; changing a text no longer touches code.
- Cost: one small loader for content files (in the loader's plugin loading, which already reads a
  plugin's files).

## Estimate with every strategy

Ranges, in clean formatted code, for every requirement and every behaviour in the inventory. The
first pass's 3,000 was budgeted before the inventory showed the guides, help mode, Find's details,
the old-content import in full, the catalogue's flows and the profile details; this estimate
includes them.

| Layer | Today | Estimate |
|---|---|---|
| Screen: viewer, command engine, chat view, composer, header, provider menu, site view bar, Find, dialogs, toasts | 4,410 | 980–1,150 |
| Screen data: schemas, command table, guide stages | (inside) | 300–380 |
| Screen CSS (tokens, components) | (inside) | 160–200 |
| Runtime: state and apply, send sequence, queue and pages, chats and the text form, folders and tags, profiles and message build, plugins and catalogue, settings resolver, change check, jobs | 985 | 700–820 |
| Loader (bus client, plugin loader, safe mode, hooks, events, `PP`, content files) | 514 | 180–220 |
| Page script (APK) and the default routine (runtime content script) | 554 | 200–250 |
| Core (Odin) | 1,770 | 580–660 |
| Platform (Kotlin) | 993 | 520–600 |
| **App** | 9,226 | **3,620–4,280** |
| Old-content import (strategy 13, removable) | — | 130–170 |
| Memory, Sub-chats, Base64, Page report | 826 | 330–400 |
| Providers (DeepSeek, Qwen, OpenAI), themes | 318 | 160–200 |
| **Everything** | 10,370 | **4,240–5,050** |

Honest reading: with every strategy, the app comes to about **3,600 to 4,300** lines, every feature
kept: about a third of today's. That is 20–40% over the 3,000 target. The first pass's budget of
exactly 3,000 didn't yet include what the inventory found. Stage 6 looks for the rest in the
structure (where boundaries sit, what merges); if 3,000 needs packed lines or cut features, stage 6
says so instead of hiding it.

## Decided (2026-11-20)

- **A.** All eleven strategies.
- **B.** Libraries are allowed behind adapters, pinned to exact versions, and not counted.
- **C.** The 3k covers the app (core, platform, loader, page script, runtime plugins with the
  screen, its data and CSS); ideally the optional plugins fit in it too.

## Decided (2026-11-21)

- **D.** The libraries in strategy 10: idiomorph, a GitHub-flavoured Markdown library, Turndown with
  its GFM plugin, SortableJS, fflate, JGit; versions picked and pinned in stage 6.
- **E.** Strategy 13: the old-content import is a removable runtime plugin.
- **F.** Strategy 14: prose lives in content files and isn't counted as code.
- **G.** The target: stage 6 budgets for the low end and looks for the rest in the structure; if
  3,000 can't be reached without packing lines or cutting features, the honest number is accepted.

## Sources

- Naked objects: [Wikipedia](https://en.wikipedia.org/wiki/Naked_objects), [Apache Causeway, background](https://causeway.apache.org/userguide/3.1.0/background-context-and-theory.html); Repository: [Fowler, P of EAA](https://martinfowler.com/eaaCatalog/repository.html)
- Command registry: [VS Code commands](https://code.visualstudio.com/api/extension-guides/command)
- JSON-RPC 2.0: [specification](https://www.jsonrpc.org/specification)
- Filters pattern: [Microsoft architecture patterns](https://learn.microsoft.com/azure/architecture/patterns/pipes-and-filters)
- Libraries: [idiomorph](https://github.com/bigskysoftware/idiomorph), [markdown-it](https://github.com/markdown-it/markdown-it), [Turndown](https://github.com/mixmark-io/turndown), [SortableJS](https://github.com/SortableJS/Sortable), [fflate](https://github.com/101arrowz/fflate), [JGit](https://www.eclipse.org/jgit/)
- Platform features: [`<dialog>`](https://developer.mozilla.org/docs/Web/HTML/Element/dialog), [Compression Streams](https://developer.mozilla.org/docs/Web/API/Compression_Streams_API)
- Design tokens: [W3C Design Tokens Community Group](https://www.designtokens.org/)
