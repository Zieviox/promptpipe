# 5. Architecture and line budget (pass 2)

> **Superseded until revisited.** Written before the inside-out restart; parts of it no longer
> hold (per-topic calls, old names, the old budget). Stage 6 redoes it. Use `4-ports.md` and
> `3-terms.md` instead where they differ.

Built on the decisions so far: all eleven strategies of `5-strategies.md`, libraries allowed
behind adapters (pinned, not counted), the 3k covering the app with the optional plugins
ideally inside it too, a full remake where only the intent and the UX/UI survive.

## The shape

```
 other apps on the phone
          │  HTTP /v1 with the API token
┌─────────┴───────────────── core (Odin) ─────────────────────────┐
│ HTTP server and key · files under named roots · plugin install  │
│ and verification · local API · one event stream to the screen   │
└─────────┬───────────────────────────────────────────────────────┘
          │  HTTP calls + the event stream (with the key)
┌─────────┴──────────── screen view (browser engine) ─────────────┐
│ loader → runtime plugins → screen        the state lives here   │
└─────────┬───────────────────────────────────────────────────────┘
          │  extension port: the bus envelope
┌─────────┴──────────────── platform (Kotlin) ────────────────────┐
│ views and pages · repository · credentials and keyed fetch   │
│ clipboard · share · vibration · keep-alive · start the core     │
└─────────┬───────────────────────────────────────────────────────┘
          │  extension port: the same envelope
   page script in each site page (+ the provider's content script)
```

- **The screen is the hub.** The state lives in the screen's runtime. The core and the platform
  are services the runtime calls; they report back with events.
- **One envelope everywhere** (S4): `{ type: "call" | "reply" | "event", name, data, id }`.
  Over HTTP to the core; over the browser extension's port to the platform and, through it, to
  each page script.
- **The platform starts first**: it waits for storage, starts the core, checks with a challenge
  that the core is its own, then opens the screen view at `127.0.0.1` with the key.

## What pass 2 changed (on top of pass 1)

| | Change | Why it's smaller | Saves |
|---|---|---|---|
| P1 | **The screen talks to the platform directly**, through the same extension port the page scripts use (the extension's match list gets the app's own address). | The core no longer relays: its queue, its `/shell` routes and the platform's polling loop go. One bridge for the screen and the pages. | ≈ 300 |
| P2 | **Downloads and zip reading in the runtime**: downloads go through the platform's `http_fetch` (the same call as the keyed fetch, without a credential); zips are read with the engine's `DecompressionStream`. The core only verifies and writes. | No zip code and no download relay in Odin; the trust stays in the core (it checks every file's hash against the signed catalogue). | ≈ 100 |
| P3 | **Record definitions are the schemas** (naked objects in full): one definition per record type gives its defaults, validation, old names for import, its file form and its viewer; a record type's operations are its commands. | No separate defaults, validation or form code. | ≈ 150 |
| P4 | **The site view in a fixed region**: the platform lays the page out under a fixed-height bar; the screen only says which page and whether it shows. | No geometry kept in sync on every keyboard and layout change (the cause of #240). | ≈ 40 |
| P5 | **No credential store in the core**: tokens live in the platform's credential store; the local API token is checked against its hash in the config. | One credential store, not two. | ≈ 40 |
| P6 | **Generic file calls** with `file_heads` (the first bytes of every file in a root, for the chats list) and `file_find` (text search in a root, #212). | The chats list and search need no special routes. | (in S5) |
| P7 | **The screen keeps its look with its own CSS on design tokens**, written from the reference screenshots; no CSS library, since a library would change the look. | Tokens and a few component classes for one consistent design. | (in S11) |

## Who owns which data

Data-oriented: each type of data has one owner, one record type, one place it's stored, and
one function that writes it.

| Data | Record type | Stored in | Written by |
|---|---|---|---|
| Settings, profiles, groups, templates, connections | `Config` (settings schema, S3) | `config.json` | runtime `config_save` → core `file_write` |
| Chats | `Chat`, `Turn` | one Markdown file each, chats root | runtime `chat_save` |
| Prompt library | `Prompt` | `prompt-library.json`, chats root | runtime `prompt_save` |
| Chats' history | commits | the chats root's repository | platform `repo_commit` |
| Plugins | `Manifest` + files | built-in (APK), updates (private), your copies (shared) | core `plugin_install` / `plugin_remove` |
| Catalogue | `Catalogue_Entry` | in memory, fetched | runtime `catalogue_load` |
| Credentials | `Credential` (listing only) | the platform's credential store | platform `credential_add` / `credential_remove` |
| Pages | `Page` | the platform's views; mirrored in the state by events | platform `page_*` |
| Queue, jobs, drafts, open sheet | `Queue_Item`, `Job`, screen state | the screen's state (memory) | runtime `state_apply` |
| Per-device conveniences | — | the screen's local storage | screen `store_local` |

## The main sequences

Each one becomes one readable chain of calls in the function list (pass 4). Events are marked ⚡.

1. **Start**: platform `app_start` → wait for storage → start the core → `core_check`
   (challenge) → open the screen view → loader `config_load` (import old content once, if
   decided) → load runtime plugins in order, then the others → screen draws → ⚡`app_started`.
2. **Send**: screen `send` command → `turn_add` → `message_build` (blocks, linked prompts,
   toggles) → `send_before` hooks → `chat_route` → provider:
   - web: `page_acquire` (pool, queue) → page script: set options, type, send, read → ⚡`reply_changed`
     while it streams → `reply_finished`;
   - api: platform `http_fetch` with the connection's credential, streamed → ⚡`reply_changed` →
     `reply_finished`;

   → `reply_after` hooks → `chat_format` → `chat_save` → `repo_commit` → ⚡`chat_saved`.
3. **Side request** (`PP.ask`, Memory, Sub-chats): the send sequence with `saved: false` and a
   fresh site chat.
4. **Job** (local API): core receives `/v1` → ⚡`job_received` → runtime runs the send sequence with
   the job's profile → `job_reply` chunks to the core → the core streams them to the caller.
5. **Install and update**: `catalogue_load` (verify the signature) → `plugin_files_list` →
   `http_fetch` each file (or read a zip) → core `plugin_install` (verify each hash, write) →
   ⚡`plugin_installed` → reload.
6. **History**: `chat_save` → `repo_commit`; `repo_push` / `repo_pull` with the token from secure
   storage (the platform reads it itself; it never reaches the runtime).
7. **Credentials**: `credential_add` (form) → `credential_list` (name, tags, host, last 4) →
   `http_fetch(…, credential)` → `credential_remove`.

## The calls each side offers (first list, final names in pass 4)

- **core**: `file_read`, `file_write`, `file_list`, `file_heads`, `file_find`, `file_move`,
  `file_delete`, `plugin_list`, `plugin_install`, `plugin_remove`, `job_reply`, `log_read`,
  `app_info`, the event stream.
- **platform**: `page_open`, `page_close`, `page_show`, `page_list`, `page_run` (a command in a
  page), `repo_commit`, `repo_log`, `repo_push`, `repo_pull`, `credential_add`, `credential_list`,
  `credential_remove`, `http_fetch`, `clipboard_copy`, `clipboard_paste`, `share_text`, `url_open`,
  `vibration_play`, `files_grant`, `theme_set`, `app_background`, `service_stop`.
- **page script**: `page_send`, `page_read`, `page_stop`, `page_options`, `page_models`,
  `page_chats`, `page_report`, plus the primitives a content script uses.
- **runtime** (on `PP` for plugins): pass 4.

## Line budget

Counted as lines of code (blank lines and comments not counted), every file formatted at a
100-character width; libraries in `vendor/` not counted. A `scripts/size-check.py` reports
each layer against its budget (pass 3 settles the check).

| Layer | Module | Budget |
|---|---|---|
| Core (Odin) | server, static files, event stream | 170 |
| | key, host check, challenge | 50 |
| | files under named roots | 130 |
| | plugin list, install, verification | 170 |
| | local API | 80 |
| | **core total** | **600** |
| Platform (Kotlin) | start the core, wait for storage, challenge | 60 |
| | activity, intents (share in, open), Back | 60 |
| | views, pages, pop-ups, site view region | 150 |
| | extension ports and the bus | 50 |
| | keep-alive service | 30 |
| | repository (JGit) | 50 |
| | credentials and `http_fetch` | 90 |
| | clipboard, share, vibration, theme, files access | 30 |
| | **platform total** | **520** |
| Loader | state and `state_apply`, bus client, plugin loader and safe mode, hooks and events, `PP` | **200** |
| Page script | port, primitives, the generic send/read/wait, page to Markdown | **250** |
| Runtime logic | record types (data) | 120 |
| | send sequence, queue, page pool | 150 |
| | history: chat file, tags, chats list, search, repository calls | 130 |
| | profiles, `message_build`, prompt library | 60 |
| | jobs | 20 |
| | import of old content (if decided) | 40 |
| | **runtime total** | **520** |
| Screen | generic viewer (lists, forms, sections, select, reorder) | 220 |
| | command engine (menus, keys, Ctrl+K, help, tour) | 90 |
| | command table (data) | 110 |
| | chat view (turns, thinking, streaming, failed, queue, "↓ new", swipes) | 200 |
| | composer and header | 90 |
| | site view bar, find | 80 |
| | library adapters (morph, Markdown) | 20 |
| | CSS (tokens, components, chat) | 100 |
| | **screen total** | **910** |
| **App** | | **3,000** |
| Optional plugins | OpenAI provider 60, DeepSeek 50, Qwen 70, Memory 160, Sub-chats 60, Base64 15, Page report 20, themes 15 | **450** |
| **Everything** | | **3,450** |

Honest reading:

- The app's budget adds up to 3,000. My expected range is **3,000 to 3,400**; the risks are the
  platform (GeckoView needs some boilerplate) and the generic viewer (matching today's look
  exactly).
- Everything inside 3k isn't reachable by this estimate: the optional plugins add about 450.
  They're budgeted on their own, and every line the app comes in under its budget goes to them.
- A layer over budget is a design problem to bring back here, not a reason to pack lines.

## A new platform later

A desktop (or iOS) platform implements: starting the core, the screen view with the extension
bridge, pages, and the calls in the platform list above. The core, the loader, the runtime
plugins and the page script stay as they are.

## Decide

1. **The screen as the hub (P1).** The local API is answered while the screen runs, which is
   always while the app runs (the keep-alive service keeps it). OK?
2. **Markdown library**: markdown-it (escapes HTML in replies by default; tables, strike-through)
   (recommended), or marked with a sanitizer.
3. **Shared storage (#204)**, still open: (a) plugins and config move to the app's private
   storage; (b) they stay on shared storage, the core records each file's hash and anything
   changed outside the app needs a tap before it runs (recommended, keeps "your copy" editable
   with a file manager).
4. **Your content from the old app** (chats, prompt library, profiles): (a) imported once on the
   first start (recommended; about 40 lines, removed again in a later release); (b) start clean.
