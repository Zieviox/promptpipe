# 4. Design strategies (pass 1 of the size work)

Goal (U 2026-11-20): every feature in `2-requirements.md`, in about **3,000 lines of clean,
comfortable code**. That means normal spacing, one statement per line, a fixed maximum line width
of about 100 characters (set by a formatter), and comments where they help. The size has to come
from a smarter structure, not from packing lines or removing features.

This pass lists the structural ideas that make the same features need less code. Each idea has
its standard name, what it replaces, an estimate, and its costs. You pick; pass 2 turns the picks
into the architecture and a line budget per layer.

## Where the code is today

10,370 lines of code (blank lines and comments not counted; tests and build scripts not
included): screen 4,410 (ui.js alone 1,348), core 1,770, platform 993, page script 554, loader
514, other runtime plugins 985, Memory/Sub-chats/Base64/Page report 826, providers 303,
themes 15.

The screen is mostly hand-built element trees: 177 `h("…")` calls in ui.js alone. The same
shapes (a section, an item with a label and a value, a list of items with actions, a confirm) are
built again in every file. The core and the platform each have a long list of special routes
and actions that all do "take a request, run one thing, answer".

## The strategies

### S1. Records with schemas, one generic viewer (the biggest lever)

Standard name: model-driven UI, the **naked objects** pattern (Pawson, 2002–2004; Apache
Causeway): the screen is generated from the data's description instead of written per screen.

Nearly everything the user manages is a **collection of records**: chats, folders, profiles,
blocks, groups, prompts, plugins, catalogue entries, sources, secrets, connections, queued
messages, settings. Each collection gets a short schema (its fields with types and labels, its
actions, how it's ordered or grouped). One generic viewer draws any collection as a list (keyed
items, sections, select mode, reorder by drag or Move up/down) and any record as a form (toggle,
choice, text, number, secret, link, list).

- Replaces: the chats list, the profile editor, Quick edit, the prompt library, the Plugins and
  Catalogue screens, the plugin page, Settings, the chat info sheet, Model and options, secure
  storage, the storage check: most of today's 4,410 screen lines.
- Plugins' own settings already work this way (plugin.json declares them); this extends the same
  idea to the whole app, so a plugin's settings and the app's settings are drawn by the same code.
- Only the chat itself (messages, streaming reply, composer) and the site view stay bespoke.
- Cost: a screen that needs a special layout needs a custom field type. The schemas are data,
  and data lines count too.

### S2. Commands as data (one command table)

Standard name: the **command pattern** with a single registry, as in code editors (VS Code's
commands: every action has an id and is reused by menus, keys and the palette).

Every action the user can take is one record: `{ id, label, icon, key, when, run }`. Buttons,
the ⋯ menus, long-press menus, keyboard shortcuts, the Ctrl+K command list, help texts (the ?
mode) and the first-run tour all read the same table. A tour stop is a command id plus a
sentence.

- Replaces: hand-written menus in each file, the shortcut map, help.js and tour.js logic, and the
  "what does this button do" texts written more than once.
- Cost: a small engine (menus, shortcuts, help overlay) has to be written once.

### S3. One schema for settings

Standard name: **single source of truth**, schema-driven configuration.

Each setting is one record: key, type, default, label, section, limits, and old names (for
migration). From it: the defaults, the Settings screen (through S1), validation, and the
migration of old config.

- Replaces: defaults in the loader, Settings code, scattered migration code.

### S4. One message format and bus across every process

Standard names: **message bus**, request/reply plus publish/subscribe over one envelope (like
JSON-RPC 2.0, which has calls, replies and notifications in one format).

The screen, the core, the platform and the page script all send one envelope:
`{ type: "call" | "reply" | "event", name, data, id }`. The core routes it; each side registers
handlers by name (`chat_save`, `page_send`, `clipboard_copy`). Events (S-principles) travel the
same way.

- Replaces: about 40 special routes in the core, the platform's action and module lists, the
  page bridge's own message types, and the glue around them in the loader.
- Adding a capability is registering one handler; nothing in between changes.
- Cost: the security checks (the key, which side may call what) move to one place, which has to
  be right.

### S5. A small, generic core

Standard names: **capability-based access** to files (named roots, path checks once), and a
"thin server".

The core keeps only what must be native or trusted: the HTTP server and the key, the bus router,
files under named roots (`chats`, `plugins`, `config`, `export`) with one path check, plugin
install with hash and signature verification, and the local API's HTTP side. Everything else
(saving a chat with its commit, copying a plugin, rolling back, moving the chats folder,
exporting) becomes runtime code built from the file and repo calls.

- Replaces: most of today's 1,770 core lines (special routes, per-feature file code).
- Odin's own library does the hard parts: `core:net`, `core:crypto/sha2`, `core:crypto/ed25519`,
  `core:compress/deflate`, `core:encoding/json`.
- Cost: none in features; trust stays in the core (verification of updates must not be
  updatable itself).

### S6. A thin platform

The platform registers its capabilities in one table (S4): pages and views (GeckoView), the
repository (JGit), secure storage with the keyed request, clipboard, vibration, share,
notifications, file access. Each handler is a few lines around the library.

- Replaces: the separate action, module and page-message code paths in today's 993 lines.

### S7. Providers as data, a page script of primitives

The page script offers about ten primitives (find, wait for, read text, read as Markdown, type,
click, watch changes, report) and **one** generic send-and-read routine driven by the
provider's selectors. A provider's content script replaces single stages only.

- Replaces: much of today's 554 page-script lines, and the helpers providers rewrote (the
  duplicates report, item 14).

### S8. One send sequence for every send

Standard idea: a fixed sequence of stages, each one's output feeding the next (filters).

A send is a list of stages run in order: blocks → `send_before` hooks → provider → `reply_after`
hooks → save. The same sequence serves your messages, side requests (`PP.ask`), Memory's
summaries, Sub-chats and the local API's jobs, with only its options differing (saved or not,
which profile, which chat).

- Replaces: today's separate paths for chats, side requests and jobs.

### S9. The platform's built-ins instead of custom code

The browser engine already does a lot that the app does by hand:

- `<dialog>` for sheets, confirms and text prompts (focus, Back/Escape, the backdrop).
- `<details>` for folded thinking and long messages.
- CSS for layout, scroll anchoring (`overflow-anchor`) and the "↓ 1 new" behaviour.
- `URL` for comparing addresses, `Intl` for dates, Web Streams for streaming replies.

- Replaces: custom sheet, fold and scroll code in the screen.

### S10. Proven libraries for solved problems, behind adapters

Standard practice: don't rewrite what a maintained library does well; keep it behind an adapter
(principles).

- **DOM morphing**: idiomorph (used by htmx and Turbo, about 3.3 KB compressed) instead of our
  own morph.js.
- **Markdown**: a maintained GitHub-flavoured Markdown library, which also gives tables,
  strike-through and nested lists (#214) for free.
- **Git**: JGit, as today.

Cost: their code ships in the APK and is updated by us; they're pinned to exact versions and
are not counted in the 3k (Decide B).

### S11. Themes as variables

Standard name: **design tokens** (CSS custom properties). The screen's CSS uses a small set of
variables and a few component classes; a theme is a short list of values.

## Estimate with every strategy

Rough, ±20%, for the full requirement list, in clean formatted code:

| Layer | Today | With S1–S11 |
|---|---|---|
| Screen: generic viewer, command engine, chat view, composer, header, find, site view | 4,410 | 830 |
| Screen data: command table, collection and settings schemas | (inside the above) | 400 |
| Screen CSS (tokens, components) | (inside the above) | 180 |
| Runtime logic: send sequence, queue and pages, history and chat file, profiles and library, jobs, migration | 985 | 600 |
| Core (Odin) | 1,770 | 700 |
| Platform (Kotlin) | 993 | 500 |
| Loader (state, bus client, plugin loader, hooks, `PP`) | 514 | 220 |
| Page script | 554 | 280 |
| **App subtotal** | 9,226 | **≈ 3,710** |
| Memory, Sub-chats, Base64, Page report | 826 | 355 |
| Providers (mostly selectors), themes | 318 | 120 |
| **Everything** | 10,370 | **≈ 4,185** |

Honest reading: pass 1 brings the app from about 10,400 to about 3,700 (or 4,200 with the
optional plugins), with every feature. The last 700 are not found yet. Pass 2 looks for them in
the architecture itself (where the boundaries sit, what can merge), still without packing lines
or cutting features. If 3k turns out to need either of those, I'll say so instead of hiding it.

## Decide

- **A.** Which strategies to adopt (recommended: all eleven).
- **B.** Libraries (S10): allowed behind adapters, pinned, and not counted in the 3k?
- **C.** What the 3k covers: (a) the app (core, platform, loader, page script, runtime plugins
  with the screen and its data and CSS), with the optional catalogue plugins (providers, Memory,
  Sub-chats, Base64, Page report, themes) counted separately; or (b) everything.

## Sources

- Naked objects: [Wikipedia](https://en.wikipedia.org/wiki/Naked_objects), [Apache Causeway, background and theory](https://causeway.apache.org/userguide/3.1.0/background-context-and-theory.html), [Pawson's thesis](https://causeway.apache.org/docs/2.0.0/_attachments/Pawson-Naked-Objects-thesis.pdf)
- Schema-driven settings: [Nextcloud declarative settings](https://docs.nextcloud.com/server/stable/developer_manual/exapp_development/tech_details/api/settings.html), [WordPress DataForm settings pages](https://developer.wordpress.org/news/2026/01/how-to-use-dataform-to-create-plugin-settings-pages/), [Drupal schema_form](https://drupal.org/project/schema_form)
- idiomorph: [README](https://unpkg.com/idiomorph@0.7.4/README.md), [repository](https://github.com/bigskysoftware/idiomorph/)
- Platform features: [Ed25519 verify in Firefox (caniuse)](https://caniuse.com/mdn-api_subtlecrypto_verify_ed25519), [Compression Streams in all browsers (web.dev)](https://web.dev/blog/compressionstreams?authuser=8)
- Earlier passes: [GLib/GNOME namespacing](https://developer.gnome.org/documentation/guidelines/programming/namespacing.html), [SemVer 2.0.0](https://semver.org/), [.NET event names](https://learn.microsoft.com/en-us/dotnet/fundamentals/code-analysis/quality-rules/ca1713), [Google AIP-136 custom methods](https://google.aip.dev/136)
