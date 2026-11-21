# 6. Adapters, layers and the line budget (stage 6, redone 2026-11-21)

Refined from the first architecture pass (2026-11-20) against `4-ports.md` (the calls),
`3-terms.md` (the records) and `5-strategies.md` (the fourteen strategies, decided A–G). It says
which technology answers each call (the adapters), how the layers talk (the channels), who owns
which data, the main sequences as call chains, and the budget in three lines per layer:
application, ports, adapters.

## The shape

```
 other apps on the phone
          │  HTTP /v1 with the API token
┌─────────┴────────────────────── core (Odin) ───────────────────────────┐
│ HTTP server, key and host check · files under named roots with the     │
│ change check · search · plugin verification · log · the local API      │
└─────────┬──────────────────────────────────────────────────────────────┘
          │  HTTP calls (the envelope) + one event stream (server-sent events), with the key
┌─────────┴─────────────── screen view (browser engine) ─────────────────┐
│ loader → runtime plugins (the application) → screen      State lives here │
└─────────┬──────────────────────────────────────────────────────────────┘
          │  the built-in extension's port: the same envelope
┌─────────┴───────────────────── platform (Kotlin) ──────────────────────┐
│ start the core · views, pages, pop-ups · repository · credentials and  │
│ the keyed fetch · clipboard, share, picker, vibration, bars · service   │
└─────────┬──────────────────────────────────────────────────────────────┘
          │  the extension's port in each site page: the same envelope
   page script (APK) running the content scripts the app hands it (S9)
```

- **The application runs in the screen view** (the loader and the runtime plugins), so the
  `State` has one owner and one writer (`state_apply`). The core and the platform answer calls and
  report events; neither keeps the app's data in memory.
- **Channels** (refined from the first pass's P1): the screen talks to the core over HTTP and to
  the platform over the built-in extension's port, the same port the site pages use; the core never
  relays platform calls, so its queue and polling routes are gone. The platform starts the core and
  checks with a challenge that it's its own (S2); it needs no other call to it (JGit works on the
  chats folder directly).
- **The router is the call table** (strategy 4): each side registers the calls it answers; the
  loader sends a call to whichever side registered it; a call nobody registered answers
  `unimplemented` (P5).
- **The local API** is answered while the screen view runs, which is whenever the app runs (the
  background service keeps it, R2); a `/v1` request becomes a `job_received` event, and the answer
  comes back as `job_changed` events the core streams to the caller (#209).

## Adapters: each call's technology

A translator only translates (anti-corruption layer): its interface is the call, its inside is
the library used as it is. Library features no call needs are not wrapped.

| Side | Calls | Technology inside |
|---|---|---|
| core | `file_*` with revisions (D4: write to a temporary file, then rename) | Odin `core:os`, `core:crypto/sha2` |
| core | `file_find` | a line scan of the chats' data in Odin |
| core | `catalogue_verify`, `plugin_write`, `plugin_list`, `plugin_remove` | `core:crypto/ed25519`, `core:crypto/sha2`, `core:os` |
| core | the HTTP server, the event stream, the local API | `core:net` (our small HTTP/1.1; Odin has no HTTP server), `core:encoding/json` |
| core | `log_read` | `core:os` |
| platform | `page_*`, `view_set`, `page_changed`, `back_pressed` | GeckoView (sessions, views, the navigation and content delegates), version pinned (S8) |
| platform | the port to the screen and the pages | GeckoView's WebExtension messaging (`connectNative` from the built-in extension's content script; the app's own address is in its match list) |
| platform | `repo_*`, `commit_list` | JGit |
| platform | `credential_*`, `http_fetch`, `http_received` | Android Keystore (AES-GCM key) for the values; `HttpURLConnection` for requests, streamed, with the credential added only for its hosts (S7) |
| platform | `clipboard_*`, `content_export`, `share_received`, `picker_open`, `url_open`, `vibration_start`, `bars_set`, `storage_access_open` | Android's services and intents |
| platform | `app_get`, `app_start`, `app_close`, `service_stop` | the activity and a foreground service |
| page script | `site_*` | the site's DOM, through the content scripts the app hands it; Turndown with its GFM plugin for the reply as Markdown |
| screen | drawing | the DOM, idiomorph for redraws, markdown-it for replies, SortableJS for reordering |
| runtime | zips (plugin zips, the old app's backup) | fflate |
| screen | per-device conveniences (folds, Find's recent picks) | the browser's local storage |

**Pinned versions** (decided D, checked 2026-11-21): idiomorph 0.8.0, markdown-it 15.0.3,
turndown 7.2.5, turndown-plugin-gfm 1.0.2, sortablejs 1.15.7, fflate 0.8.3, JGit
5.13.3.202401111512-r (the last line that runs on Android's Java), GeckoView 144.0.20251020130000.
They sit in `vendor/` and aren't counted (decided B).

## The layers and their modules

| Layer | Modules | Owns |
|---|---|---|
| core | server (HTTP, key, host, the event stream), router (the call table, the boundary check), files (roots, revisions, search), plugins (list, verify, write, remove), local API, log | the revision record, the key, the local API's open requests |
| platform | start (wait for storage, start and check the core), activity (intents, Back, insets), pages (sessions, views, pop-ups, recovery, the region), port (the extension's messages), repository, credentials and fetch, services (clipboard, share, picker, vibration, bars, storage access, url), keep-alive | the views and pages, the credential store, the core process |
| loader | bus client (the call table, the envelope), state (`State`, `state_apply`), plugin loader (order, safe mode, content files), hooks and events, `PP` | `State` |
| runtime (the application) | send (sequence, queue, page pool, side requests, jobs), chats (records, the text form, folders, tags, find), profiles (blocks, `message_build`, preview, templates), plugins (catalogue, install, update, copy), settings (schemas, `value_get`, the generic store), change (the shared dialog's flow), credentials (listing, connections) | every record in `3-terms.md` part 1 |
| page side | the page script (APK: join the port, run the code it's handed); the default routine (a runtime plugin's content script: type, send, wait, read, models, the report) | a page's provider description and the send it's watching |
| screen | viewer (lists, forms, sheets), command engine (menus, keys, help card, guides), chat view, composer, header and provider menu, site view bar, Find, dialogs and toasts; schemas and the command table (data); CSS | `Ui` (inside `State`) |

## Who owns which data

| Data | Record | Stored in | Written by |
|---|---|---|---|
| Settings, profiles, blocks, groups, templates, connections, sources, provider choices | `Config` | the app folder's `config.json` | runtime settings → `file_write` |
| A chat and its turns | `Chat`, `Turn`, `Attachment` | the chat's data folder; its readable `.md` | runtime chats → `file_write` |
| Your order of the chats list | `Folder` | `folders.json` with the chats | runtime chats |
| Drafts | `drafts` | the app folder's `drafts.json` | runtime chats |
| A plugin's data for a chat | (the plugin's) | `<plugin id>.json` in the chat's data folder | the plugin, through `PP` |
| Prompt library | `Prompt` | `prompts.json` with the chats | runtime profiles |
| Counter tags | — | `tags.json` with the chats | runtime chats |
| History | commits | the chats' repository | platform `repo_commit`, on the runtime's call |
| Plugins | `Manifest` and files | the APK (built-in), app-private (updates), the app folder (your copies) | core `plugin_write`, `plugin_remove` |
| Revisions | `Revision` | app-private `revisions.json` | core |
| Credentials | `Credential` | the platform's store | platform |
| Sends, pages, jobs, the screen's state | `Send`, `Page`, `Job`, `Ui` | memory | loader `state_apply` |

## The main sequences

Each becomes one readable chain in the function list (stage 8). ⚡ marks an event.

1. **Start**: platform: wait for storage (R1) → start the core, check it (S2), restart it when it
   stops (R8) → open the screen view at `127.0.0.1` with the key → loader: `app_get`, read `Config`
   and the schemas → load the runtime plugins in order (a failing plugin of yours: restart in safe
   mode, UC33) → the other plugins → first start only: the old-content import plugin (X5) → the
   screen draws `State` → the provider's site page opens in the background (`page_open`).
2. **Send**: `message_send` (a `Send`) → queued if the chat has one on its way (UC2) → `chat_route`
   hooks (route) → `message_build` (blocks with `value_get` for the chat's toggles, linked prompts,
   `block_text`, `send_before` hooks) → provider:
   - web: a free page (or `page_open`; else waiting) → `site_model_set` → `site_send` (limits) →
     ⚡`reply_changed` while it streams;
   - api: `http_fetch` with the connection's credential, streamed → ⚡`http_received`;

   → `reply_after` hooks → the turn saved (`file_write` of its data and its readable `.md`) →
   `repo_commit` (and push if set) → `vibration_start`; a failure becomes the `Send`'s `Error`
   (UC4), a cut-off reply keeps what came.
3. **Side request** (Memory, Sub-chats, plugins): the send sequence with no chat and a fresh
   site chat on a free page.
4. **Job** (local API): `/v1` → ⚡`job_received` → `job_run`: the send sequence with the job's
   profile and chat (a `models` job answers the profiles' names) → ⚡`job_changed` parts → the core
   streams them; a closed connection stops the send (#209).
5. **Install and update**: `catalogue_load` → `http_fetch` (the catalogue and its signature) →
   `catalogue_verify` → `http_fetch` each file, or a zip read with fflate (S6 checked) →
   `plugin_write` (each hash checked, S3) → the loader reloads plugins.
6. **Outside change** (D7): any `file_write`, `file_move` or `file_delete` with an expected revision
   → an `Outside_Change` → the shared dialog → `change_resolve` (theirs, ours, both); keeping an
   edited readable file parses it back (strategy 12).
7. **Chats folder** (UC36): `file_list` on `device` → `chats_folder_move` (move, use, merge) →
   `file_*` → the screen redraws the list.
8. **Old content** (X5, first start): the import plugin: `file_list`, `file_read` on `device` →
   `.nomedia` marker → the backup zipped with fflate → `file_write` → each old shape mapped through
   the schemas' `old_keys` → `record_create` → done; deleting the old folders later is `file_delete`
   on `device`.

## The line budget

Counted as lines of code (blank lines and comments not counted, 100 characters wide, `vendor/`
not counted, prose in content files not counted, decided F). Three lines per layer: the
**application** (deciding: pure functions and the sequences), the **ports** (the call table's
registration and checks, the envelope, the schemas and the command table), the **adapters**
(translating to a technology: Odin's libraries, Android, the DOM, the site's page). Budgeted for
the low end of stage 5's estimate (decided G).

| Layer | Application | Ports | Adapters | Total |
|---|---|---|---|---|
| core | 0 | 110 (router, envelope, key and host check, boundary check) | 470 (files and revisions 160, HTTP server and event stream 130, plugin verification and writing 110, local API 70) | **580** |
| platform | 0 | 60 (the port, registration) | 460 (start and check the core 60, activity 60, pages, views, pop-ups, recovery 140, repository 50, credentials and fetch 90, services 45, keep-alive 15) | **520** |
| loader | 130 (state and apply 30, plugin loader and safe mode 60, hooks and events 40) | 50 (bus client, call table) | 0 | **180** |
| page side | 0 | 40 (the page script: the port, running handed code) | 160 (the default routine's stages 130, the report 30) | **200** |
| runtime | 700 (send 170, chats and the text form 160, profiles 110, plugins 100, settings and the generic store 90, change 25, jobs 25, credentials and connections 20) | 0 (uses the loader's) | 0 | **700** |
| screen | 120 (Find's ranking and query, the new-reply and scroll rules, guide progress) | 300 (schemas 190, command table 80, guide stages 30) | 1,020 (viewer 260, chat view 230, composer 70, header, provider menu and site view bar 90, Find 50, dialogs and toasts 30, command engine 130, CSS 160) | **1,440** |
| **App** | **950** | **560** | **2,110** | **3,620** |
| Optional | | | Memory 220, Sub-chats 80, Base64 40, Page report 10, OpenAI provider 60, DeepSeek 30, Qwen 90, themes 20 | **550** |
| Removable | | | the old-content import (strategy 13) | **130** |
| **Everything** | | | | **4,300** |

Honest reading:

- The app's budget is **3,620**, the low end of the estimate; the expected range stays 3,620–4,280.
  The risks: the screen (matching the screenshots' look exactly with a generic viewer), the
  platform (GeckoView's boilerplate), and the core's HTTP server (Odin has none to reuse).
- **3,000 isn't reached by structure alone.** The search for the rest found only small moves (the
  site view bar and the provider menu as viewer lists, about 40; a reply's actions as commands,
  about 30); the remaining ~550 would need cutting features or packing lines, which is ruled out
  (decided G). The honest target is 3,620.
- A layer over its budget comes back here as a design problem, never as packed lines.
- `scripts/sloc.py` (in the remake skill) reports each layer against this table at every build
  stage.

## A new platform later (N1)

A desktop or iOS platform answers the platform's calls (pages, the port, the repository,
credentials, the services) and starts the core; the core, the loader, the runtime plugins, the page
script and the screen stay as they are.

## Decided (2026-11-21)

- **H.** The channels: the screen talks to the platform over the extension's port and to the core
  over HTTP; the core never relays.
- **I.** The budget: 3,620 for the app, every feature kept, is the budget for the function list
  (stage 8); 3,000 isn't reachable without cuts (decided G).

## Sources

- GeckoView WebExtensions and native messaging: [Interacting with Web content](https://firefox-source-docs.mozilla.org/mobile/android/geckoview/consumer/web-extensions.html)
- Server-sent events: [HTML Living Standard](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- Android Keystore: [Android Keystore system](https://developer.android.com/privacy-and-security/keystore)
- Anti-corruption layer: [Microsoft](https://learn.microsoft.com/azure/architecture/patterns/anti-corruption-layer)
- Versions: the npm registry (2026-11-21), the app's build file (JGit, GeckoView)
